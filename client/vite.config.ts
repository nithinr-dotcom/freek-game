import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5173, host: true },
  // `npm run preview -w client`: the production build, reachable through a tunnel for phone testing
  preview: { port: 6281, host: true, allowedHosts: true },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
});
