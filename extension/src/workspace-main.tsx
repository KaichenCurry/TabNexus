import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TaskApp } from "./v2/app/TaskApp";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TaskApp />
  </StrictMode>
);
