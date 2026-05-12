import { initThemeOverrideCache } from "./stores/useThemeStore";
initThemeOverrideCache();

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./lib/theme/context";
import "./styles/index.css";
import "./styles/App.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);

import { syncThemeFromBackend } from "./stores/useThemeStore";
syncThemeFromBackend();
