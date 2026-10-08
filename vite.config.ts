import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Git commit of this deploy (Vercel sets VERCEL_GIT_COMMIT_SHA at build time),
  // attached to every logged error so you know which release broke.
  define: {
    __APP_VERSION__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA ?? "dev").slice(0, 7)),
  },
  plugins: [
    TanStackRouterVite({ autoCodeSplitting: true }),
    tsconfigPaths(),
    tailwindcss(),
    react(),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Vendor code changes rarely, app code every deploy. Splitting them means
        // returning visitors on weak mobile data re-download only the app chunk
        // after a deploy, not React/Supabase/Router again.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "vendor-react";
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("@tanstack")) return "vendor-tanstack";
          // Every lucide icon was its own tiny file (~18 extra requests on a guest's
          // first load); one chunk is one request.
          if (id.includes("lucide-react")) return "vendor-icons";
          return undefined;
        },
      },
    },
  },
});
