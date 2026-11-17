import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import { App } from "./App";
import { ProvedorDialogo } from "./Dialogo";
import "./estilo.css";

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <ProvedorDialogo>
      <App />
    </ProvedorDialogo>
  </StrictMode>,
);
