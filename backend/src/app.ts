import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { platformRouter } from "./routes/platform.js";
import { orgRouter } from "./routes/org.js";
import { organizationRouter } from "./routes/organization.js";
import { academicsRouter } from "./routes/academics.js";
import { enquiryRouter } from "./routes/enquiry.js";
import { admissionRouter } from "./routes/admission.js";
import { studentsRouter } from "./routes/students.js";
import { attendanceRouter } from "./routes/attendance.js";
import { feesRouter } from "./routes/fees.js";
import { payrollRouter } from "./routes/payroll.js";
import { expensesRouter } from "./routes/expenses.js";
import { testsRouter } from "./routes/tests.js";
import { notificationsRouter } from "./routes/notifications.js";
import { remindersRouter } from "./routes/reminders.js";
import { publicRouter } from "./routes/public.js";
import { distributionRouter } from "./routes/distribution.js";
import { whatsappRouter } from "./routes/whatsapp.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";

export const app = express();

app.use(cors());
// `verify` stashes the raw bytes on req.rawBody alongside the parsed body —
// needed only by the WhatsApp webhook's X-Hub-Signature-256 check
// (routes/public.ts), which HMACs the exact bytes Meta sent, not a
// re-serialization of the parsed JSON. No effect on any other route.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "tutorgo-backend" });
});

app.use("/api/auth", authRouter);
app.use("/api/platform", platformRouter);
app.use("/api/org", orgRouter);
app.use("/api/organization", organizationRouter);
app.use("/api/academics", academicsRouter);
app.use("/api/enquiries", enquiryRouter);
app.use("/api/admissions", admissionRouter);
app.use("/api/students", studentsRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/fees", feesRouter);
app.use("/api/payroll", payrollRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/tests", testsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/reminders", remindersRouter);
app.use("/api/distribution", distributionRouter);
app.use("/api/org/whatsapp", whatsappRouter);
// Deliberately outside authenticate/requireInstitute — the one unauthenticated
// public surface in the app (now also the WhatsApp webhook — see
// routes/public.ts's header comment).
app.use("/api/public", publicRouter);

app.use(notFoundHandler);
app.use(errorHandler);
