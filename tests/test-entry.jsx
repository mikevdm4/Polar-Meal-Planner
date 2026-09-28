import React from "react";
import ReactDOM from "react-dom/client";
import { AthleteApp } from "../src/App.jsx";
import { AthleteSummary } from "../src/Auth.jsx";

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

// Normally the athlete app; tests can ask for the coach's view of an athlete instead.
const tree = window.__TEST_COMPONENT__ === "coach-summary"
  ? React.createElement(AthleteSummary, { data: window.__TEST_ATHLETE_DATA__, athleteId: "athlete-1", coachId: "coach-1" })
  : React.createElement(AthleteApp, {
      currentUserId: "test-user-id", userEmail: "test@example.com",
      onSignOut: () => {}, coachId: window.__TEST_COACH_ID__ || null, onProfileRefresh: async () => {},
      ...(window.__TEST_PROPS__ || {}),
    });

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(TestBoundary, null, tree));
