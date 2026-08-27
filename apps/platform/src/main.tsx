import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { AppProviders } from "./app/app-providers.tsx";
import { GlobalErrorBoundary } from "./app/global-error-boundary.tsx";
import "./styles/tokens.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Không tìm thấy phần tử gốc của ứng dụng.");
document.body.classList.add("aeck-platform-document");

createRoot(rootElement).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <AppProviders />
    </GlobalErrorBoundary>
  </StrictMode>,
);
