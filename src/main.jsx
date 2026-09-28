import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { hardReload, APP_VERSION } from "./ErrorNotice.jsx";
import "./index.css";

// Without this, ANY uncaught error anywhere in the app — a bad API response,
// a library throwing unexpectedly, a genuine bug — results in exactly a
// blank white page with zero indication of what broke, for both the athlete
// and anyone trying to debug it afterward. This catches that and shows
// something actionable instead, plus logs the real error to the console so
// it can actually be diagnosed rather than guessed at.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("Polar Endurance — caught a render error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", padding: "24px",
          fontFamily: "sans-serif", textAlign: "center", background: "#F5F4EE", color: "#14403E",
        }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>⚠️</div>
          <h1 style={{ fontSize: "18px", marginBottom: "8px" }}>Something went wrong</h1>
          <p style={{ fontSize: "14px", color: "#948A78", marginBottom: "16px", maxWidth: "320px" }}>
            The app hit an unexpected error rather than just showing a blank page. Reloading usually fixes it —
            if it keeps happening, please let your coach know what you were doing right before this appeared.
          </p>
          <button
            onClick={hardReload}
            style={{ background: "#14403E", color: "#fff", border: "none", padding: "10px 24px", borderRadius: "999px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
          >
            Reload the app
          </button>
          <p style={{ fontSize: "11px", color: "#948A78", marginTop: "16px" }}>Version {APP_VERSION}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non-fatal — the app still works fully online without it, this just
      // means the offline app-shell caching won't be available.
    });
  });
}
