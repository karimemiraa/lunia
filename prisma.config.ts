import { defineConfig, env } from "prisma/config";

// Prisma 7's config file is evaluated before the CLI's own .env loading, so
// DATABASE_URL isn't in process.env yet when `env()` below runs. Load it
// ourselves via Node's built-in .env loader (no extra dependency needed).
try {
  process.loadEnvFile();
} catch {
  // No .env file present (e.g. in CI where vars are injected directly) — ignore.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
