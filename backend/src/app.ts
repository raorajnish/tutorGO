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
import { notificationsRouter } from "./routes/notifications.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";

export const app = express();

app.use(cors());
app.use(express.json());

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
app.use("/api/notifications", notificationsRouter);

app.use(notFoundHandler);
app.use(errorHandler);
