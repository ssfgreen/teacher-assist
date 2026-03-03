import "./styles/globals.css";

import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import ComponentPlayground from "./dev/ComponentPlayground";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element '#root' not found");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {window.location.pathname === "/playground" ? (
      <ComponentPlayground />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
