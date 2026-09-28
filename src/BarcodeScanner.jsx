import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats as F } from "html5-qrcode";
import { hardReload } from "./ErrorNotice.jsx";
import { isValidBarcode, explainCameraError } from "./barcode.js";

// Only the formats printed on shop products. Scanning "everything" (QR codes, Data Matrix, PDF417…) makes
// the decoder try a dozen algorithms every frame, which is slower and worse at ordinary 1D barcodes.
const RETAIL_FORMATS = [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF];
const READER_CONFIG = { verbose: false, formatsToSupport: RETAIL_FORMATS, useBarCodeDetectorIfSupported: true };

const isPermissionOrMissing = (err) => /NotAllowed|Permission|denied|NotFound|DevicesNotFound/i.test(String((err && (err.name || err.message)) || err));

export function BarcodeScannerModal({ onScan, onClose }) {
  const scannerRef = useRef(null);
  const startedRef = useRef(false);
  const foundRef = useRef(false);
  const fileRef = useRef(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const [error, setError] = useState("");
  const [found, setFound] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState("");
  const [photoStatus, setPhotoStatus] = useState(""); // "" | "reading" | "failed"
  const [cameraInfo, setCameraInfo] = useState(""); // what the camera actually delivered — useful when reporting a problem

  // A barcode can be reported several times in a row before the camera stops — only ever act on the first.
  const finish = (code) => {
    if (foundRef.current) return;
    foundRef.current = true;
    setFound(true);
    if (startedRef.current) {
      startedRef.current = false;
      try { scannerRef.current.stop().catch(() => {}); } catch (e) { /* already stopped */ }
    }
    // Brief, unmissable confirmation before handing off.
    setTimeout(() => onScanRef.current(code), 500);
  };

  useEffect(() => {
    let cancelled = false;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError(explainCameraError("mediaDevices not supported"));
      return undefined;
    }
    const scanner = new Html5Qrcode("barcode-reader", READER_CONFIG);
    scannerRef.current = scanner;

    const scanConfig = (videoConstraints) => ({
      fps: 12,
      // Wide and short suits 1D barcodes far better than a square box.
      qrbox: (w, h) => ({ width: Math.floor(w * 0.9), height: Math.floor(Math.min(h * 0.55, w * 0.5)) }),
      videoConstraints, // NB: when given, these REPLACE the facingMode argument, so it's repeated inside
    });
    // Low default resolution is the #1 reason 1D barcodes won't read. Ask for HD, fall back to anything.
    const HIGH_RES = { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } };
    const BASIC = { facingMode: "environment" };

    (async () => {
      const startWith = (vc) => scanner.start({ facingMode: "environment" }, scanConfig(vc), (text) => finish(text), () => {});
      try {
        try {
          await startWith(HIGH_RES);
        } catch (first) {
          if (cancelled || isPermissionOrMissing(first)) throw first;
          await startWith(BASIC); // e.g. the camera rejected the HD request
        }
        if (cancelled) { try { await scanner.stop(); } catch (e) { /* ignore */ } return; }
        startedRef.current = true;
        try {
          const st = scanner.getRunningTrackSettings();
          const engine = typeof window !== "undefined" && "BarcodeDetector" in window ? "built-in detector" : "software decoder";
          setCameraInfo(`Camera ${st.width || "?"}×${st.height || "?"} · ${engine}`);
        } catch (e) { /* not available on every browser */ }
        // Continuous autofocus where the camera allows it (harmless if not).
        try { await scanner.applyVideoConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch (e) { /* not supported */ }
      } catch (err) {
        if (!cancelled) setError(explainCameraError(err));
      }
    })();

    return () => {
      cancelled = true;
      // stop() on a scanner that never started can throw synchronously — a promise .catch() wouldn't see that.
      if (startedRef.current) {
        try { scanner.stop().catch(() => {}); } catch (e) { /* already stopped */ }
      }
    };
  }, []);

  useEffect(() => {
    if (found || error) return undefined;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [found, error]);

  const submitTyped = () => {
    const digits = typed.replace(/\D/g, "");
    if (digits.length < 8) { setTypedError("Barcodes have 8–14 digits — type the number printed under the bars."); return; }
    if (!isValidBarcode(digits)) { setTypedError("That number doesn't look right — check each digit (the last one is a check digit, so most typos get caught here)."); return; }
    setTypedError("");
    finish(digits);
  };

  // A still photo taken with the phone's own camera app has proper autofocus and full resolution, so it often
  // reads a barcode that the live video view can't.
  const onPhoto = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setPhotoStatus("reading");
    try {
      const reader = new Html5Qrcode("barcode-file-reader", READER_CONFIG);
      const text = await Promise.race([
        reader.scanFile(file, false),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000)),
      ]);
      try { reader.clear(); } catch (err) { /* ignore */ }
      setPhotoStatus("");
      finish(text);
    } catch (err) {
      setPhotoStatus("failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto" style={{ background: "#0F1210" }}>
      <div className="flex items-center justify-between p-4">
        <span className="text-sm font-semibold text-white">Scan a barcode</span>
        <button className="text-white text-2xl leading-none" onClick={onClose}>×</button>
      </div>

      <div className="mx-4 rounded-xl overflow-hidden relative flex-1" style={{ background: "#000", minHeight: 260 }}>
        <div id="barcode-reader" className="w-full" />
        {found && (
          <div className="pe-fadein absolute inset-0 flex flex-col items-center justify-center" style={{ background: "rgba(15,18,16,0.9)" }}>
            <div className="text-4xl mb-2">✅</div>
            <div className="text-white text-sm font-semibold">Barcode found!</div>
            <div className="text-white text-xs opacity-70 mt-1">Looking it up…</div>
          </div>
        )}
        {!found && !error && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: "rgba(0,0,0,0.55)" }}>
            <span className="inline-block w-2 h-2 rounded-full pe-pulse" style={{ background: "#6FA968" }} />
            <span className="text-white text-xs font-medium">Scanning…</span>
          </div>
        )}
        {error && !found && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-5 text-center">
            <div className="text-3xl mb-2">📷</div>
            <p className="text-white text-sm mb-3" data-testid="camera-error">{error}</p>
            <p className="text-white text-xs opacity-70">You can still add it with a photo or by typing the number below.</p>
          </div>
        )}
      </div>

      {cameraInfo && <p className="text-center text-[10px] text-white opacity-40 pt-2" data-testid="camera-info">{cameraInfo}</p>}
      <p className="text-center text-xs text-white opacity-70 px-4 pt-3">
        {error ? "" : seconds > 8
          ? "Still looking — hold it 15–25cm away, in good light, with the bars filling most of the frame. Tilt slightly if there's glare."
          : "Line up the barcode inside the frame — it'll scan automatically."}
      </p>

      <div className="mx-4 my-4 rounded-xl p-3" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div className="text-white text-xs font-semibold mb-2">Can't get it to scan?</div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} data-testid="barcode-photo-input" />
        <button
          className="w-full py-2 rounded-full text-xs font-semibold mb-2"
          style={{ background: "#fff", color: "#14403E" }}
          onClick={() => fileRef.current && fileRef.current.click()}
          disabled={photoStatus === "reading"}
        >
          {photoStatus === "reading" ? "Reading photo…" : "📷 Take a photo of the barcode instead"}
        </button>
        {photoStatus === "failed" && (
          <p className="text-xs mb-2" style={{ color: "#F5C9A8" }}>
            Couldn't find a barcode in that photo — try again closer, in better light, with the whole barcode in shot. Or type the number below.
          </p>
        )}
        <div className="flex gap-2">
          <input
            className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm"
            style={{ background: "#fff", color: "#14403E" }}
            inputMode="numeric" autoComplete="off" placeholder="Or type the number under the bars"
            value={typed}
            onChange={(e) => { setTyped(e.target.value); setTypedError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") submitTyped(); }}
          />
          <button className="px-4 py-2 rounded-full text-xs font-semibold shrink-0" style={{ background: "#6FA968", color: "#fff" }} onClick={submitTyped}>
            Look up
          </button>
        </div>
        {typedError && <p className="text-xs mt-2" style={{ color: "#F5C9A8" }}>{typedError}</p>}
        {error && (
          <p className="text-xs mt-3 text-white opacity-80">
            Camera still not working? Try to{" "}
            <button type="button" className="underline font-semibold" onClick={hardReload}>reload the app page</button>.
          </p>
        )}
      </div>

      {/* The photo decoder needs an element to attach to; it's never shown. */}
      <div id="barcode-file-reader" style={{ display: "none" }} />
    </div>
  );
}
