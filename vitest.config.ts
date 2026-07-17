// Alias « @/ » aligné sur tsconfig : permet de tester les routes Next
// (elles importent en @/lib/...) sans réécrire leurs imports.
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
