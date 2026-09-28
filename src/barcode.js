// Pure barcode helpers (no browser or React dependencies) so they can be unit-tested in tests/tally.mjs.

// The product database stores EAN-13. A 12-digit UPC-A is just an EAN-13 with a leading 0, and a 14-digit
// GTIN often has a 0 in front — without this a perfectly good US barcode comes back as "not found".
export function normalizeBarcode(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length === 12) return "0" + d;
  if (d.length === 14 && d.startsWith("0")) return d.slice(1);
  return d;
}

// Standard GS1 check digit (weights 3,1,3,1… from the right). Catches almost every single-digit typo.
// 8-digit codes are let through unchecked: UPC-E squeezes its check digit differently.
export function isValidBarcode(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(d.length)) return false;
  if (d.length === 8) return true;
  const digits = d.split("").map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

// Turn the browser's camera failure into something a person can act on (instead of one vague sentence).
export function explainCameraError(err) {
  const raw = String((err && (err.name ? `${err.name}: ${err.message}` : err.message)) || err || "");
  if (typeof window !== "undefined" && window.isSecureContext === false)
    return "The camera needs a secure (https) connection, and this page isn't on one.";
  if (/NotAllowed|Permission|denied/i.test(raw))
    return "Camera permission is blocked. Allow camera access for this site in your browser's settings (usually the padlock or camera icon by the address bar), then try again.";
  if (/NotFound|DevicesNotFound|no camera/i.test(raw))
    return "No camera was found on this device.";
  if (/NotReadable|TrackStart|in use|Could not start video/i.test(raw))
    return "The camera couldn't start — another app or browser tab may be using it. Close that and try again.";
  if (/Overconstrained/i.test(raw))
    return "This camera doesn't support the requested settings.";
  if (/mediaDevices|getUserMedia|not supported/i.test(raw))
    return "This browser can't access the camera.";
  return `The camera couldn't start (${raw.slice(0, 120) || "unknown error"}).`;
}

