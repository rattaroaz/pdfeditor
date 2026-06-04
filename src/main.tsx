import "@/index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { initLogging, logger } from "@/lib/logging";
import App from "./App";

initLogging();
if (import.meta.env.VITE_E2E) {
  logger.setBackendShipping(true);
  void import("@/lib/e2eBridge").then(({ registerE2eBridge }) => registerE2eBridge());
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
