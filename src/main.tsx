import "@/index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { initLogging } from "@/lib/logging";
import App from "./App";

initLogging();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
