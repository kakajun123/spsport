import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { LocaleProvider } from "./context/LocaleContext";
import { AuthProvider } from "./context/AuthContext";
import { DemoVenueProvider } from "./context/DemoVenueContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <DemoVenueProvider>
        <LocaleProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </LocaleProvider>
      </DemoVenueProvider>
    </BrowserRouter>
  </React.StrictMode>
);
