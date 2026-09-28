import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Stamped into every build so it's always possible to tell exactly which
// version is running (shown at the bottom of Setup and on the error screen).
const BUILD_STAMP = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";

export default defineConfig({
  plugins: [react()],
  define: { __APP_BUILD__: JSON.stringify(BUILD_STAMP) },
});
