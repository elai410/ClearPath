import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Dashboard from "./Dashboard.jsx";
import Analytics from "./Analytics.jsx";
import Follow from "./pages/Follow.jsx";
import { LanguageProvider } from "./lib/i18n/LanguageContext.jsx";
import "./styles.css";

const path = window.location.pathname;
const follow = path.match(/^\/follow\/([^/]+)/);

const Page = path === "/dashboard" ? Dashboard
  : path === "/analytics" ? Analytics
  : follow ? () => <Follow token={follow[1]} />
  : App;

// Staff surfaces stay in English; patient and companion views are localized.
const localized = Page === App || Boolean(follow);

ReactDOM.createRoot(document.getElementById("root")).render(
  localized ? (
    <LanguageProvider>
      <Page />
    </LanguageProvider>
  ) : (
    <Page />
  )
);
