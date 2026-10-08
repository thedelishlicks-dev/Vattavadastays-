 import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { reloadOnceForNewVersion } from "./lib/staleBuild";
import { prefetchGuestProperty } from "./lib/prefetch";
import { installGlobalErrorLogging } from "./lib/errorLog";

const router = getRouter();

// Report uncaught errors to the superadmin Errors tab.
installGlobalErrorLogging();

// Begin loading the property data now, in parallel with the route code.
prefetchGuestProperty();

// After a deploy, a browser holding an old cached index.html asks for JS chunks
// that no longer exist and the route fails ("Something went wrong"). Reload once
// to pick up the new build. Guarded so a genuinely broken deploy can't loop:
// at most one automatic reload per 30 seconds.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadOnceForNewVersion();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
