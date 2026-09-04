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
import { analyticsRouter } from "./routes/analytics.js";
import { whatsappRouter } from "./routes/whatsapp.js";
import { portalAccessRouter } from "./routes/portalAccess.js";
import { portalRouter } from "./routes/portal.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";
import { UPLOAD_ROOT, UPLOAD_URL_PREFIX } from "./services/uploads.js";

export const app = express();

// Render (and any single nginx/ALB in front) terminates TLS and appends the
// real client IP to X-Forwarded-For. Without this, Express hands `req.ip` the
// proxy's address and middleware/rateLimit.ts would have to read the header
// itself — which an attacker can forge freely, making every limiter useless.
// `1` = trust exactly one proxy hop; raise it only if a second real proxy is
// ever added, never set it to `true`.
app.set("trust proxy", 1);

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

// Disk-backed uploads (services/uploads.ts). Only reached when Cloudinary is
// unconfigured — the local-dev fallback — since uploads otherwise live in the
// object store and are served from its own domain.
// Hardened deliberately: `nosniff` + a forced attachment disposition mean a
// file crafted to look like HTML can never execute as script on the API's own
// origin, and no directory index is exposed.
app.use(
  UPLOAD_URL_PREFIX,
  express.static(UPLOAD_ROOT, {
    index: false,
    dotfiles: "deny",
    fallthrough: false,
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", "attachment");
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
app.use("/api/analytics", analyticsRouter);
app.use("/api/org/whatsapp", whatsappRouter);
// Staff-side credential management, and the student's own read-only portal —
// two separate routers because they have opposite audiences: OWNER/ADMIN vs.
// the STUDENT login itself. See changes-phase10.md §10.6.
app.use("/api/portal-access", portalAccessRouter);
app.use("/api/portal", portalRouter);
// Deliberately outside authenticate/requireInstitute — the one unauthenticated
// public surface in the app (now also the WhatsApp webhook — see
// routes/public.ts's header comment).
app.use("/api/public", publicRouter);

app.use(notFoundHandler);
app.use(errorHandler);
