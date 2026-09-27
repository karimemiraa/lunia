// Creates or refreshes the clearly-labelled test customer "Test Customer
// (demo)" (demo.customer@lunia.test, tag "test"). Idempotent: safe to run
// repeatedly. Usage: pnpm demo:customer
//
// Logic lives in src/modules/clinical/demoCustomer.ts (tested in
// tests/clinical/demoCustomer.test.ts). .env is loaded BEFORE importing it,
// since the app's DB client reads DATABASE_URL at import time.

try {
  process.loadEnvFile();
} catch {
  // No .env file (e.g. env injected by the container) -- fine.
}

async function main() {
  const { ensureDemoCustomer } = await import("../src/modules/clinical/demoCustomer");
  const { prisma } = await import("../src/lib/db");
  try {
    const summary = await ensureDemoCustomer();
    console.log("Demo customer ready:");
    console.table(summary);
    console.log(`Admin: /admin/clients/${summary.clientProfileId}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export {};
