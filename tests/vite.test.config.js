import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist-test",
    emptyOutDir: true,
    rollupOptions: { input: "tests/test-entry.jsx", output: { entryFileNames: "test-bundle.js", format: "iife" } },
    minify: false,
  },
  define: {
    "process.env.NODE_ENV": '"development"',
    "import.meta.env.VITE_SUPABASE_URL": '"https://test.supabase.co"',
    "import.meta.env.VITE_SUPABASE_ANON_KEY": '"test-anon-key"',
  },
});
