import { createPortal } from "react-dom";

// Renders straight into <body>, bypassing every ancestor in between. This matters for any full-screen
// overlay (position: fixed) in this app: CSS says an ancestor with an active `transform` (which several
// cards here have, briefly, via the .pe-fadein mount animation) creates a new "containing block", and a
// `position: fixed` element inside it positions relative to THAT ancestor instead of the actual screen —
// which is exactly how a popup can end up sitting far down the page instead of centred on screen. A portal
// sidesteps the whole ancestor chain, so it can't happen regardless of what's animating at the time.
export function Portal({ children }) {
  return createPortal(children, document.body);
}
