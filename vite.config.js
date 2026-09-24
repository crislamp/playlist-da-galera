import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Spotify exige 127.0.0.1 (não aceita mais "localhost") em redirect de dev.
export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5173 },
});
