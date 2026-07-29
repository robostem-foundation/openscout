import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import App from "./App";
import { AuthProvider } from "./auth";
import { completeGoogleSignIn } from "./google-signin";
import { TooltipProvider } from "./components/ui/tooltip";
import "./index.css"; // Tailwind preflight + Geist tokens — must load first
import "./styles.css"; // legacy app styles — after, so element rules win over preflight

// Returning from Google: swap the ID token in the URL fragment for a session.
// Not awaited (top-level await would force an esnext build target) — it strips
// the fragment and restores the deep link synchronously before render, and the
// session itself arrives through onAuthStateChange a moment later.
void completeGoogleSignIn();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <TooltipProvider>
        <App />
      </TooltipProvider>
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
