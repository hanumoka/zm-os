import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
const root = document.getElementById("root");
if (!root) throw new Error("앱 진입점을 찾지 못했습니다.");
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
