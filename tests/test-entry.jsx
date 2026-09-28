import React from "react";
import ReactDOM from "react-dom/client";
import { AthleteApp } from "../src/App.jsx";

window.__TEST_RESULTS__ = { error: null, errorInfo: null };

class TestBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) {
    window.__TEST_RESULTS__.error = error.message + "\n" + error.stack;
    window.__TEST_RESULTS__.errorInfo = info.componentStack;
  }
  render() {
    return this.state.hasError ? React.createElement("div", { id: "test-crashed" }, "CRASHED") : this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  React.createElement(TestBoundary, null,
    React.createElement(AthleteApp, {
      currentUserId: "test-user-id", userEmail: "test@example.com",
      onSignOut: () => {}, coachId: null, onProfileRefresh: async () => {},
    })
  )
);
