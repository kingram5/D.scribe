import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

// Evaluation rigs spend real money on the project's API key, so they are kept
// out of `npm test` and run only on purpose: `npm run eval:theo`.
export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { globals: true, environment: "node", include: ["evals/**/*.eval.ts"], testTimeout: 60 * 60 * 1000 },
});
