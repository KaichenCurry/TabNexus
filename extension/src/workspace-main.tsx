import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceApp } from "./workspace/WorkspaceApp";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WorkspaceApp />
  </StrictMode>
);
