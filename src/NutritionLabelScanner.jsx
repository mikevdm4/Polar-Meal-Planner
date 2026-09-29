import React, { useRef, useState } from "react";
import { parseNutritionText, toPer100, atwaterCheck } from "./labelParser.js";
import { hardReload } from "./ErrorNotice.jsx";
import { Portal } from "./Portal.jsx";

// Loaded once, on first use — Tesseract's engine and language data are ~2MB+, no reason to ship it in the
// main bundle for the far more common case of the camera or database lookup working fine.
let workerPromise = null;
function getWorker(onProgress) {
  if (!workerPromise) {
    // Self-hosted rather than the library's CDN default: the first use downloads ~9MB (worker, wasm engine,
    // English language data), cached by the browser after that. Hosting it ourselves means this doesn't
    // depend on a third-party CDN being reachable — a barcode-database outage shouldn't also break this.
    workerPromise = import("tesseract.js").then(({ createWorker }) =>
      createWorker("eng", 1, {
        workerPath: "/tesseract/worker.min.js",
        corePath: "/tesseract/tesseract-core-simd-lstm.wasm.js",
        langPath: "/tesseract",
        gzip: true,
        logger: (m) => { if (m.status === "recognizing text") onProgress(m.progress); },
      })
    );
  }
  return workerPromise;
}

// Same handful of steps a person would do by hand before squinting at a label photo: make it bigger (small
// print and decimal points are the first casualty of a phone photo), even out the lighting, and sharpen —
// this alone was the difference between "g" being misread as a digit and being read correctly in testing.
function preprocess(imgEl) {
  const targetW = 1800;
  const scale = targetW / imgEl.naturalWidth;
  const w = targetW, h = Math.round(imgEl.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(imgEl, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) gray[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  let lo = 255, hi = 0;
  for (let i = 0; i < gray.length; i++) { if (gray[i] < lo) lo = gray[i]; if (gray[i] > hi) hi = gray[i]; }
  const range = Math.max(hi - lo, 1);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const v = Math.min(255, Math.max(0, ((gray[p] - lo) / range) * 255));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

const ROUND1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

export function NutritionLabelScanner({ onConfirm, onClose }) {
  const fileRef = useRef(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [status, setStatus] = useState("pick"); // pick | reading | review | failed
  const [progress, setProgress] = useState(0);
  const [parsed, setParsed] = useState(null);
  const [edit, setEdit] = useState({ kcal: "", protein: "", carb: "", fat: "", servingG: "" });

  const onFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setPhotoUrl(URL.createObjectURL(file));
    setStatus("reading"); setProgress(0);
    const img = new Image();
    img.onload = async () => {
      try {
        const canvas = preprocess(img);
        const worker = await getWorker(setProgress);
        await worker.setParameters({ tessedit_pageseg_mode: "4", preserve_interword_spaces: "1" });
        const { data } = await worker.recognize(canvas);
        const result = parseNutritionText(data.text, { confidence: data.confidence });
        setParsed(result);
        if (result.missing.length >= 3) {
          setStatus("failed");
        } else {
          const per100 = result.basis === "per100" ? result : (toPer100(result, result.basis, result.servingG) || result);
          setEdit({
            kcal: per100.kcal ?? "", protein: ROUND1(per100.protein) ?? "",
            carb: ROUND1(per100.carb) ?? "", fat: ROUND1(per100.fat) ?? "",
            servingG: result.servingG ?? "",
          });
          setStatus("review");
        }
      } catch (err) {
        setStatus("failed");
      }
    };
    img.onerror = () => setStatus("failed");
    img.src = URL.createObjectURL(file);
  };

  const liveCheck = atwaterCheck({ kcal: Number(edit.kcal), protein: Number(edit.protein), carb: Number(edit.carb), fat: Number(edit.fat) });

  const confirm = () => {
    const kcal = Number(edit.kcal), protein = Number(edit.protein), carb = Number(edit.carb), fat = Number(edit.fat);
    if (!(kcal >= 0 && protein >= 0 && carb >= 0 && fat >= 0)) return;
    onConfirm({ kcal, protein, carb, fat, servingG: Number(edit.servingG) > 0 ? Number(edit.servingG) : null });
  };

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto" style={{ background: "#14403E" }}>
      <div className="flex items-center justify-between p-4">
        <span className="text-sm font-semibold text-white">Photo the nutrition label</span>
        <button className="text-white text-2xl leading-none" onClick={onClose}>×</button>
      </div>

      <div className="px-4 pb-8 flex-1">
        {status === "pick" && (
          <div className="text-center pt-10">
            <div className="text-5xl mb-3">📋</div>
            <p className="text-white text-sm mb-1 opacity-90">Take a clear, well-lit photo of the "Nutrition" or "Nutrition Facts" panel on the pack.</p>
            <p className="text-white text-xs mb-6 opacity-60">Hold it flat, fill the frame with the table, and avoid glare — this reads it, but you'll always get to check the numbers before they're saved.</p>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} data-testid="label-photo-input" />
            <button className="px-6 py-3 rounded-full text-sm font-semibold" style={{ background: "#fff", color: "#14403E" }} onClick={() => fileRef.current.click()}>
              📷 Take or choose a photo
            </button>
          </div>
        )}

        {status === "reading" && (
          <div className="text-center pt-10">
            {photoUrl && <img src={photoUrl} alt="" className="mx-auto rounded-lg mb-4" style={{ maxHeight: 220, opacity: 0.7 }} />}
            <div className="text-white text-sm mb-2">Reading the label…</div>
            <div className="w-48 h-1.5 rounded-full mx-auto overflow-hidden" style={{ background: "rgba(255,255,255,0.2)" }}>
              <div className="h-full rounded-full" style={{ width: `${Math.round(progress * 100)}%`, background: "#6FA968", transition: "width 0.2s" }} />
            </div>
          </div>
        )}

        {status === "failed" && (
          <div className="text-center pt-10">
            <div className="text-4xl mb-3">🤔</div>
            <p className="text-white text-sm mb-4">Couldn't make out enough of that photo. A flatter angle, brighter light, or filling more of the frame with the table usually helps.</p>
            <button className="px-6 py-2.5 rounded-full text-sm font-semibold mb-3" style={{ background: "#fff", color: "#14403E" }} onClick={() => { setStatus("pick"); setPhotoUrl(null); }}>
              Try another photo
            </button>
            <div className="text-white text-xs opacity-70">
              or{" "}
              <button className="underline font-semibold" onClick={() => setStatus("manual")}>enter the numbers yourself</button>
            </div>
          </div>
        )}

        {(status === "review" || status === "manual") && (
          <div className="pe-fadein">
            {photoUrl && (
              <img src={photoUrl} alt="Your photo of the label" className="w-full rounded-lg mb-3" style={{ maxHeight: 260, objectFit: "contain", background: "#0F1210" }} />
            )}
            <div className="rounded-xl p-4" style={{ background: "#fff" }}>
              {status === "review" && (
                <p className="text-xs mb-3" style={{ color: "#6B6355" }}>
                  Here's what it read, as values <strong>per 100g</strong>{parsed?.servingG ? ` (the label itself was per ${parsed.servingG}g serving, converted)` : ""}.
                  Check each one against your photo above before adding — OCR on small print isn't perfect.
                </p>
              )}
              {status === "manual" && (
                <p className="text-xs mb-3" style={{ color: "#6B6355" }}>Enter the values from the label's <strong>per 100g</strong> column.</p>
              )}

              {parsed && parsed.warnings.length > 0 && status === "review" && (
                <div className="rounded-lg p-2.5 mb-3 text-xs" style={{ background: "#FFF7ED", border: "1px solid #F5DCC9", color: "#9C5527" }}>
                  {parsed.warnings.map((w, i) => <p key={i} className={i ? "mt-1" : ""}>⚠ {w}</p>)}
                </div>
              )}
              {!parsed?.warnings?.length && liveCheck && !liveCheck.ok && status === "review" && (
                <div className="rounded-lg p-2.5 mb-3 text-xs" style={{ background: "#FFF7ED", border: "1px solid #F5DCC9", color: "#9C5527" }}>
                  ⚠ {liveCheck.message}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 mb-2">
                {[
                  ["kcal", "Calories (per 100g)", parsed?.unsure?.kcal],
                  ["protein", "Protein (g)", parsed?.unsure?.protein],
                  ["carb", "Carbs (g)", parsed?.unsure?.carb],
                  ["fat", "Fat (g)", parsed?.unsure?.fat],
                ].map(([key, label, unsure]) => (
                  <div key={key}>
                    <label className="block text-[10px] font-medium mb-1" style={{ color: unsure ? "#B5652F" : "#948A78" }}>
                      {label}{unsure ? " · check this" : ""}
                    </label>
                    <input
                      type="number" inputMode="decimal" min="0" step="any"
                      className="pe-input w-full px-2 py-2 text-sm"
                      style={unsure ? { borderColor: "#E3A76F" } : undefined}
                      value={edit[key]}
                      onChange={(e) => setEdit((p) => ({ ...p, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <div className="mb-3">
                <label className="block text-[10px] font-medium mb-1" style={{ color: "#948A78" }}>Pack serving size in grams (optional — lets you log "1 serving")</label>
                <input type="number" min="0" className="pe-input w-full px-2 py-2 text-sm" value={edit.servingG} onChange={(e) => setEdit((p) => ({ ...p, servingG: e.target.value }))} />
              </div>
              <button className="pe-btn-primary w-full py-2.5 rounded-full text-sm font-semibold" onClick={confirm} disabled={!(edit.kcal !== "" && edit.protein !== "" && edit.carb !== "" && edit.fat !== "")}>
                Use these values
              </button>
              <button className="w-full text-xs font-medium mt-2" style={{ color: "#948A78" }} onClick={() => { setStatus("pick"); setPhotoUrl(null); }}>
                Take a different photo
              </button>
            </div>
          </div>
        )}
      </div>
      <p className="text-center text-[11px] text-white opacity-50 pb-4 px-4">
        Trouble with this too? <button type="button" className="underline" onClick={hardReload}>Reload the app page</button>.
      </p>
    </div>
    </Portal>
  );
}
