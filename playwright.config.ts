import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  // The whole suite shares one real Postgres DB (same as vitest -- see
  // vitest.config.ts's fileParallelism note) and several specs contend for
  // the same finite resources: staff schedules/rooms/slots for booking
  // fixtures (admin-calendar/admin-clients/admin-booking-config/site-booking
  // all create real bookings), and shared aggregate reads (marketing/reports
  // dashboards, topClientsByLtv) that can observe another spec's
  // in-flight/partial writes. Running specs concurrently (Playwright's
  // default: multiple workers, each worker running files in parallel) lets
  // two workers race to book the same slot or read the DB mid-mutation,
  // producing intermittent failures that have nothing to do with the code
  // under test. Forcing a single worker with parallelism off makes every
  // spec run one at a time against a consistent DB state, trading suite
  // runtime for determinism.
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
