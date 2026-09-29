import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats as F } from "html5-qrcode";
import { hardReload } from "./ErrorNotice.jsx";
import { Portal } from "./Portal.jsx";
import { isValidBarcode, explainCameraError } from "./barcode.js";

// Only the formats printed on shop products. Scanning "everything" (QR codes, Data Matrix, PDF417…) makes
// the decoder try a dozen algorithms every frame, which is slower and worse at ordinary 1D barcodes.
const RETAIL_FORMATS = [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF];
const READER_CONFIG = { verbose: false, formatsToSupport: RETAIL_FORMATS, useBarCodeDetectorIfSupported: true };

const isPermissionOrMissing = (err) => /NotAllowed|Permission|denied|NotFound|DevicesNotFound/i.test(String((err && (err.name || err.message)) || err));

// Reused so the "resolution actually being used" figure and the tap-to-focus target both agree with reality.
function readTrack(scanner) {
  try { return scanner.getRunningTrackSettings(); } catch (e) { return null; }
}
function readTrackObject(scanner) {
  // html5-qrcode exposes the *settings*, not the raw MediaStreamTrack — reach through its render state for
  // the track itself, which is what applyConstraints/getCapabilities (needed for tap-to-focus) require.
  try { return scanner?.renderedCamera?.mediaStream?.getVideoTracks?.()[0] || null; } catch (e) { return null; }
}

export function BarcodeScannerModal({ onScan, onClose, onPhotographLabel, onTypeMealName, onManualEntry }) {
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [canTapFocus, setCanTapFocus] = useState(false);
  const [focusPoint, setFocusPoint] = useState(null); // {x, y} in on-screen pixels, for the tap ring
  const [focusStatus, setFocusStatus] = useState(""); // "" | "focusing" | "unsupported"

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
      fps: 10,
      // Wide and short suits 1D barcodes far better than a square box.
      qrbox: (w, h) => ({ width: Math.floor(w * 0.9), height: Math.floor(Math.min(h * 0.55, w * 0.5)) }),
      videoConstraints, // NB: when given, these REPLACE the facingMode argument, so it's repeated inside
    });
    // 720p, not 1080p: a barcode filling most of the frame has plenty of pixels to decode at 720p, and every
    // extra megapixel is more work the decoder has to redo up to 10 times a second — on a phone without the
    // browser's built-in hardware detector (all of iOS Safari, some Android browsers), that's the difference
    // between reading a barcode in under a second and the scan visibly lagging or never quite landing.
    const GOOD = { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } };
    const BASIC = { facingMode: "environment" };

    (async () => {
      const startWith = (vc) => scanner.start({ facingMode: "environment" }, scanConfig(vc), (text) => finish(text), () => {});
      try {
        try {
          await startWith(GOOD);
        } catch (first) {
          if (cancelled || isPermissionOrMissing(first)) throw first;
          await startWith(BASIC); // e.g. the camera rejected that exact combination
        }
        if (cancelled) { try { await scanner.stop(); } catch (e) { /* ignore */ } return; }
        startedRef.current = true;
        const usingNativeDetector = typeof window !== "undefined" && "BarcodeDetector" in window;
        const st = readTrack(scanner);
        if (st) setCameraInfo(`Camera ${st.width || "?"}×${st.height || "?"} · ${usingNativeDetector ? "built-in detector" : "software decoder"}`);

        const track = readTrackObject(scanner);
        if (track && track.getCapabilities) {
          try {
            const caps = track.getCapabilities();
            if (caps.focusMode && caps.focusMode.includes("continuous")) {
              await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
            }
            // pointsOfInterest is what a tap-to-focus point actually needs — only offer the UI if it's real.
            setCanTapFocus(!!caps.pointsOfInterest || (!!caps.focusMode && caps.focusMode.includes("single-shot")));
          } catch (e) { /* getCapabilities/applyConstraints isn't implemented everywhere (notably Safari) */ }
        }
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

  const handleTapToFocus = async (e) => {
    if (found || error || !canTapFocus) return;
    const track = readTrackObject(scannerRef.current);
    if (!track || !track.applyConstraints) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    setFocusPoint({ x: clientX - rect.left, y: clientY - rect.top });
    setFocusStatus("focusing");
    try {
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      const advanced = {};
      if (caps.pointsOfInterest) advanced.pointsOfInterest = [{ x, y }];
      if (caps.focusMode && caps.focusMode.includes("single-shot")) advanced.focusMode = "single-shot";
      await track.applyConstraints({ advanced: [advanced] });
      setTimeout(() => setFocusStatus(""), 700);
      // Hand focus back to continuous afterwards where the camera supports it, so it doesn't stay locked
      // on this one spot for the rest of the scan.
      if (caps.focusMode && caps.focusMode.includes("continuous")) {
        setTimeout(() => track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {}), 1200);
      }
    } catch (e2) {
      setFocusStatus("");
    }
    setTimeout(() => setFocusPoint(null), 900);
  };

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
    <Portal>
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto" style={{ background: "#0F1210" }}>
      <div className="flex items-center justify-between p-4">
        <span className="text-sm font-semibold text-white">Scan a barcode</span>
        <button className="text-white text-2xl leading-none" onClick={onClose}>×</button>
      </div>

      <div
        className="mx-4 rounded-xl overflow-hidden relative flex-1"
        style={{ background: "#000", minHeight: 260, cursor: canTapFocus && !found && !error ? "crosshair" : "default" }}
        onClick={canTapFocus ? handleTapToFocus : undefined}
        data-testid="camera-view"
      >
        <div id="barcode-reader" className="w-full" />
        {focusPoint && (
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              left: focusPoint.x - 28, top: focusPoint.y - 28, width: 56, height: 56,
              border: "2px solid #fff", boxShadow: "0 0 0 2px rgba(0,0,0,0.4)",
              animation: "peFocusRing 0.7s ease-out",
            }}
          />
        )}
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
        {canTapFocus && !found && !error && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full" style={{ background: "rgba(0,0,0,0.5)" }}>
            <span className="text-white text-[10px]" data-testid="tap-focus-hint">Tap the blurry spot to focus there</span>
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

        <button
          className="w-full flex items-center justify-center gap-1 text-xs font-medium text-white opacity-80 mt-3 py-1"
          onClick={() => setMoreOpen((v) => !v)}
          data-testid="more-options-toggle"
        >
          More options {moreOpen ? "▲" : "▼"}
        </button>
        {moreOpen && (
          <div className="pe-fadein mt-2 flex flex-col gap-2">
            <button
              className="w-full py-2 rounded-full text-xs font-semibold"
              style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}
              onClick={onPhotographLabel}
            >
              📋 Photograph the nutrition label instead
            </button>
            <button
              className="w-full py-2 rounded-full text-xs font-semibold"
              style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}
              onClick={onTypeMealName}
            >
              🔍 Type in the meal name instead
            </button>
            <button
              className="w-full py-2 rounded-full text-xs font-semibold"
              style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}
              onClick={onManualEntry}
            >
              ✏️ Full manual entry
            </button>
          </div>
        )}
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
    </Portal>
  );
}
