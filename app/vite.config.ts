import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api/* is served by Cloudflare Pages Functions (`wrangler pages dev` on :8788 during dev).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:8788" },
  },
  build: { target: "es2022", sourcemap: true },
});
