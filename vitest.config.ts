import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [tsconfigPaths()],
  // Server actions import "server-only" (via the staff-console translator);
  // outside a Next.js build it throws, so tests get an empty stand-in.
  resolve: { alias: { "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)) } },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    globals: true,
    // Test files share one real Postgres DB. Most suites avoid collisions by
    // partitioning their own data (unique phone prefixes/dates), but
    // tests/booking/outbox.test.ts exercises processDueMessages(), which
    // scans the *entire* ScheduledMessage table for due rows regardless of
    // which suite created them (e.g. bookings.test.ts's CONFIRMATION rows are
    // scheduled with sendAt=now, i.e. immediately due). Running test files in
    // parallel would let it race with, and mutate, other suites' in-flight
    // rows. Serializing file execution removes that class of flake; the
    // suite is small enough that this costs a negligible amount of time.
    fileParallelism: false,
  },
});
