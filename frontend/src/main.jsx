import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import SharedView from "./components/SharedView.jsx";
import "./index.css";

// /view/:token 경로면 공유 뷰, 아니면 메인 앱
const path = window.location.pathname;
const shareMatch = path.match(/^\/view\/([A-Za-z0-9_-]+)$/);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {shareMatch ? <SharedView token={shareMatch[1]} /> : <App />}
  </React.StrictMode>
);
