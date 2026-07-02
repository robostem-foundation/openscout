import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import App from "./App";
import { AuthProvider } from "./auth";
import "./index.css"; // Tailwind preflight + Geist tokens — must load first
import "./styles.css"; // legacy app styles — after, so element rules win over preflight

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
    <Analytics />
  </StrictMode>,
);

// Register the PWA service worker (dependency-free). Guarded so a failure never
// breaks the app, and registered on load so it doesn't compete with startup.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
