// First, on purpose: importing a component also imports its stylesheet, and the
// later sheet wins a tie, so the shared rules must load before any screen's.
import "./app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { LocaleProvider } from "./i18n";
import { registerServiceWorker } from "./registerServiceWorker";

const root = document.getElementById("root");
if (!root) throw new Error("#root element is missing from index.html");

registerServiceWorker();

createRoot(root).render(
  <StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </StrictMode>,
);
