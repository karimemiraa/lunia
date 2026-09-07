// Load .env into process.env before any test module reads it (e.g. src/lib/env.ts,
// used by the DB/Redis clients). Vitest/Vite only expose .env values via
// import.meta.env by default, not process.env, so we load it ourselves with
// Node's built-in loader (available Node 20.6+, no extra dependency needed).
try {
  process.loadEnvFile();
} catch {
  // No .env file present (e.g. CI, where vars are injected directly) — ignore.
}

import "@testing-library/jest-dom/vitest";
