import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OptionsApp } from "./options/OptionsApp";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OptionsApp />
  </StrictMode>
);
