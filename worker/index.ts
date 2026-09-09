// Reminder outbox worker: a small, long-running Node process that polls
// processDueMessages() on an interval so scheduled booking messages
// (confirmations, 24h reminders, post-visit follow-ups) actually get sent.
// getConfiguredSender() picks the real WhatsApp/SMS provider adapter when
// running in production with a fully configured provider, and falls back to
// the logging-only stub sender everywhere else (local dev, CI, an
// unconfigured provider) — see src/modules/comms/sender.ts.
//
// Deliberately dependency-light: no BullMQ/queue library, just a
// setTimeout-based poll loop with a clean SIGINT/SIGTERM shutdown. Run it
// with `pnpm worker` locally, or as the `worker` service in
// docker-compose.prod.yml (see that file's comment for why it reuses the
// `migrator` image target).
//
// Env vars must be loaded (locally via .env; in Docker via env_file) before
// `@/lib/db` is evaluated, since it reads them at module-init time to build
// its Prisma driver adapter. Top-level `import` statements are hoisted
// ahead of any code in this file, so we load .env first and then reach
// `@/lib/db` (via `@/modules/booking/outbox`) through a dynamic import,
// which only evaluates once actually awaited below.
try {
  process.loadEnvFile();
} catch {
  // No .env file present (e.g. Docker, where env_file supplies the vars
  // directly) — ignore.
}

const POLL_INTERVAL_MS = 30_000;

async function main() {
  const { processDueMessages, reclaimStaleClaims } = await import("@/modules/booking/outbox");
  const { prisma } = await import("@/lib/db");

  let stopping = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function tick() {
    try {
      // Return any abandoned SENDING rows (from a crashed worker) to PENDING
      // before claiming this tick's batch.
      const reclaimed = await reclaimStaleClaims(new Date());
      if (reclaimed > 0) console.log(`[worker] reclaimed ${reclaimed} stale claim(s)`);
      // No sender override: processDueMessages resolves the real/stub sender
      // per message based on its resolved channel (whatsapp/sms/email).
      const result = await processDueMessages(new Date());
      console.log(
        `[worker] heartbeat ${new Date().toISOString()} processed=${result.processed} sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`,
      );
    } catch (err) {
      // A single failed poll must not kill the worker — log and keep going.
      console.error("[worker] processDueMessages threw", err);
    }
  }

  async function loop() {
    if (stopping) return;
    await tick();
    if (!stopping) timer = setTimeout(() => void loop(), POLL_INTERVAL_MS);
  }

  console.log(`[worker] starting, polling every ${POLL_INTERVAL_MS / 1000}s`);
  await loop();

  async function shutdown(signal: string) {
    if (stopping) return;
    stopping = true;
    console.log(`[worker] received ${signal}, shutting down`);
    if (timer) clearTimeout(timer);
    await prisma.$disconnect();
    process.exit(0);
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[worker] fatal error", err);
  process.exit(1);
});
