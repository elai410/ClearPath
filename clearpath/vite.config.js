import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Overridable so a second backend can be run side by side without
      // disturbing whatever is already serving 3001.
      "/api": process.env.CLEARPATH_API || "http://localhost:3001",
    },
  },
});
