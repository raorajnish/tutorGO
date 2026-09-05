import "dotenv/config";
import { app } from "./app.js";
import { startReminderScheduler } from "./services/reminderScheduler.js";
import { startPtmReminderScheduler } from "./services/ptmReminders.js";

const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  console.log(`tutorgo-backend listening on http://127.0.0.1:${port}`);
  // Started here rather than in app.ts so importing the app (tests, scripts)
  // never kicks off background work.
  startReminderScheduler();
  startPtmReminderScheduler();
});
