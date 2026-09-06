import "dotenv/config";
import { app } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { startReminderScheduler } from "./services/reminderScheduler.js";
import { startPtmReminderScheduler } from "./services/ptmReminders.js";
import { assertProductionConfig } from "./lib/startupChecks.js";

assertProductionConfig();

const port = Number(process.env.PORT ?? 4000);

const server = app.listen(port, () => {
  console.log(`tutorgo-backend listening on http://127.0.0.1:${port}`);
  // Started here rather than in app.ts so importing the app (tests, scripts)
  // never kicks off background work.
  startReminderScheduler();
  startPtmReminderScheduler();
});

// Render (and most PaaS hosts) sends SIGTERM before killing a container on
// every deploy or scale-down — without handling it, in-flight requests get
// severed mid-response instead of finishing. `server.close()` stops accepting
// new connections but lets existing ones complete; only once that's done (or
// the 10s safety net fires) do we close the DB pool and actually exit.
function shutdown(signal: string) {
  console.log(`${signal} received — closing server gracefully...`);
  server.close(async (err) => {
    if (err) console.error("Error while closing server:", err);
    try {
      await prisma.$disconnect();
    } catch (disconnectErr) {
      console.error("Error while disconnecting Prisma:", disconnectErr);
    }
    process.exit(err ? 1 : 0);
  });

  // Safety net: a stuck connection (e.g. an open SSE stream) must not hang
  // the process forever and block the host from ever completing the deploy.
  setTimeout(() => {
    console.error("Graceful shutdown timed out — forcing exit");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
