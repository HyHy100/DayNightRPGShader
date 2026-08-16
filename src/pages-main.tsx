import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import DaylightStudio from "./ui/DaylightStudio";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Application root was not found");
}

createRoot(root).render(
  <StrictMode>
    <DaylightStudio />
  </StrictMode>,
);
