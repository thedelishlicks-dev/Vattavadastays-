import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    tanstackStart({
      server: {
        preset: "vercel",
      },
    }),
    tsconfigPaths(),
    tailwindcss(),
    react(),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
