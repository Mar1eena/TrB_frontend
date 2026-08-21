import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const mount = document.getElementById("app") ?? document.getElementById("root");
if (!mount) {
  throw new Error("mount node not found");
}

createRoot(mount).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
