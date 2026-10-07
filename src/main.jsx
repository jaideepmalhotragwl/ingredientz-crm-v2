import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode><App /></React.StrictMode>
)

// ── Installable app (PWA) ──────────────────────────────────────────────────
// Registers the service worker that makes the CRM installable on phones and
// carries push notifications later. Registered after load so it never delays
// first paint, and failures are ignored — the app works fine without it.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {})
  })
}
