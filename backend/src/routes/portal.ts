import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireStudent } from "../middleware/auth.js";
import { money } from "../lib/money.js";
import { todayDateOnly } from "../lib/dateOnly.js";
import { toTimeString } from "../lib/lectureShared.js";
import { validateBody } from "../middleware/validate.js";
import multer from "multer";
import { MAX_UPLOAD_BYTES, uploadAsset, signedAssetUrl } from "../services/uploads.js";
import { rateLimit } from "../middleware/rateLimit.js";

/**
 * The student's own read-only view of their record (changes-phase10.md §10.6).
 *
 * Every handler scopes to `req.user!.studentId`, which is stamped by
 * `authenticate` from the login's own linked Student row — never from a path
 * or query parameter. That is what makes it structurally impossible for one
 * student to read another's marks or fees: there is no id to tamper with.
 *
 * `authenticate` has also already re-derived portal eligibility by the time
 * any of this runs, so a course whose portal was switched off stops serving
 * data immediately, without any check needing to be repeated here.
 */
export const portalRouter = Router();

portalRouter.use(authenticate, requireStudent);

/** The batch the student is currently in — the scope for timetable and for
 * "tests coming up". Null if they've been admitted but not placed yet, which
 * the UI shows as an empty timetable rather than an error. */
async function currentBatchId(studentId: string): Promise<string | null> {
  const membership = await prisma.studentBatch.findFirst({
    where: { studentId, leftAt: null },
    select: { batchId: true },
    orderBy: { joinedAt: "desc" },
  });
  return membership?.batchId ?? null;
}

/** Attendance rate over every record the student has, plus the raw counts the
 * portal shows underneath it. HOLIDAY is excluded from the denominator — it
 * isn't a day anyone could have attended, so counting it would quietly drag
 * every student's rate down. LATE counts as present, matching how the staff
 * attendance summary already treats it. */
function attendanceStats(records: { status: string }[]) {
  const counted = records.filter((r) => r.status !== "HOLIDAY");
  const present = counted.filter(
    (r) => r.status === "PRESENT" || r.status === "PRESENT_BIOMETRIC" || r.status === "LATE"
  ).length;
  return {
    total: counted.length,
    present,
    absent: counted.filter((r) => r.status === "ABSENT").length,
    leave: counted.filter((r) => r.status === "LEAVE").length,
    rate: counted.length === 0 ? null : Math.round((present / counted.length) * 100),
  };
}

async function feeSummary(studentId: string) {
  const account = await prisma.feeAccount.findUnique({
    where: { studentId },
    include: { installments: { orderBy: { seq: "asc" } } },
  });
  if (!account) return null;

  const zero = new Prisma.Decimal(0);
  const totalDue = account.installments.reduce((s, i) => s.plus(i.amount), zero);
  const totalPaid = account.installments.reduce((s, i) => s.plus(i.paidAmount), zero);
  const totalWaived = account.installments.reduce(
    (s, i) => (i.waived ? s.plus(i.amount.minus(i.paidAmount)) : s),
    zero
  );
  const balance = totalDue.minus(totalPaid).minus(totalWaived);

  const today = todayDateOnly();
  // Installment status is derived here exactly as it is on the staff side —
  // there is no stored status column to read, and inventing a second rule for
  // the portal is how a student ends up being told they're paid up while the
  // defaulters list says otherwise.
  const installments = account.installments.map((i) => {
    const outstanding = i.amount.minus(i.paidAmount);
    const status = i.waived
      ? "WAIVED"
      : outstanding.lessThanOrEqualTo(0)
        ? "PAID"
        : i.dueDate < today
          ? "OVERDUE"
          : i.paidAmount.greaterThan(0)
            ? "PARTIAL"
            : "DUE";
    return {
      id: i.id,
      seq: i.seq,
      dueDate: i.dueDate,
      amount: money(i.amount),
      paidAmount: money(i.paidAmount),
      outstanding: money(outstanding.lessThan(0) ? zero : outstanding),
      status,
    };
  });

  const nextDue = installments.find((i) => i.status === "OVERDUE" || i.status === "DUE" || i.status === "PARTIAL");

  return {
    account,
    summary: {
      planType: account.planType,
      status: account.status,
      totalDue: money(totalDue),
      totalPaid: money(totalPaid),
      balance: money(balance.lessThan(0) ? zero : balance),
      nextDueDate: nextDue?.dueDate ?? null,
      nextDueAmount: nextDue?.outstanding ?? null,
      overdueCount: installments.filter((i) => i.status === "OVERDUE").length,
    },
    installments,
  };
}

// ---------------------------------------------------------------------------
// Dashboard — one round trip for the landing screen
// ---------------------------------------------------------------------------

portalRouter.get("/dashboard", async (req, res, next) => {
  try {
    const studentId = req.user!.studentId!;
    const batchId = await currentBatchId(studentId);
    const today = todayDateOnly();

    const [student, attendance, upcoming, latestResults, fees, unreadCount] = await Promise.all([
      prisma.student.findUniqueOrThrow({
        where: { id: studentId },
        select: {
          name: true,
          studentCode: true,
          email: true,
          admissionDate: true,
          course: { select: { name: true, code: true } },
          institute: { select: { name: true } },
        },
      }),
      prisma.attendanceRecord.findMany({ where: { studentId }, select: { status: true } }),
      batchId
        ? prisma.lecture.findMany({
            where: { batchId, date: { gte: today }, cancelledAt: null },
            select: {
              id: true,
              kind: true,
              date: true,
              startTime: true,
              endTime: true,
              subject: { select: { name: true } },
              faculty: { select: { fullName: true } },
              test: { select: { id: true, title: true, totalMarks: true } },
            },
            orderBy: [{ date: "asc" }, { startTime: "asc" }],
            take: 3,
          })
        : Promise.resolve([]),
      prisma.testResult.findMany({
        where: { studentId },
        select: {
          id: true,
          marksObtained: true,
          enteredAt: true,
          test: { select: { title: true, totalMarks: true, subject: { select: { name: true } } } },
        },
        orderBy: { enteredAt: "desc" },
        take: 3,
      }),
      feeSummary(studentId),
      prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
    ]);

    res.json({
      student: {
        name: student.name,
        studentCode: student.studentCode,
        email: student.email,
        course: student.course,
        instituteName: student.institute.name,
        admissionDate: student.admissionDate,
      },
      attendance: attendanceStats(attendance),
      upcoming: upcoming.map((l) => ({
        id: l.id,
        kind: l.kind,
        date: l.date,
        startTime: toTimeString(l.startTime),
        endTime: toTimeString(l.endTime),
        subject: l.subject.name,
        faculty: l.faculty.fullName,
        test: l.test,
      })),
      recentResults: latestResults.map((r) => ({
        id: r.id,
        title: r.test.title,
        subject: r.test.subject.name,
        marksObtained: money(r.marksObtained),
        totalMarks: r.test.totalMarks,
        enteredAt: r.enteredAt,
      })),
      fees: fees?.summary ?? null,
      unreadNotifications: unreadCount,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Timetable
// ---------------------------------------------------------------------------

portalRouter.get("/timetable", async (req, res, next) => {
  try {
    const studentId = req.user!.studentId!;
    const batchId = await currentBatchId(studentId);
    if (!batchId) return res.json({ batch: null, lectures: [] });

    // A four-week window centred on today: enough past for "what did I miss?"
    // and enough future for "what's coming", without paging a whole year of
    // lectures into a phone.
    const today = todayDateOnly();
    const from = new Date(today);
    from.setUTCDate(from.getUTCDate() - 14);
    const to = new Date(today);
    to.setUTCDate(to.getUTCDate() + 21);

    const [batch, lectures, parentMeetings] = await Promise.all([
      prisma.batch.findUnique({ where: { id: batchId }, select: { id: true, name: true } }),
      prisma.lecture.findMany({
        where: { batchId, date: { gte: from, lte: to } },
        select: {
          id: true,
          kind: true,
          date: true,
          startTime: true,
          endTime: true,
          cancelledAt: true,
          cancelReason: true,
          note: true,
          subject: { select: { name: true } },
          faculty: { select: { fullName: true } },
          test: { select: { id: true, title: true, totalMarks: true } },
          // The student's own attendance for that session, if it's been
          // marked — one join rather than a second endpoint the timetable
          // screen would otherwise have to call and stitch together itself.
          attendance: { where: { studentId }, select: { status: true }, take: 1 },
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      }),
      // Surfaced on the timetable rather than a separate screen — a parent
      // opening this wants "what's happening with my kid's batch", and a PTM
      // is exactly that, same as a lecture is.
      prisma.parentMeeting.findMany({
        where: { batchId, date: { gte: from, lte: to }, cancelledAt: null },
        select: { id: true, title: true, date: true, startTime: true, endTime: true, venue: true },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      }),
    ]);

    res.json({
      batch,
      lectures: lectures.map((l) => ({
        id: l.id,
        kind: l.kind,
        date: l.date,
        startTime: toTimeString(l.startTime),
        endTime: toTimeString(l.endTime),
        cancelled: l.cancelledAt !== null,
        cancelReason: l.cancelReason,
        note: l.note,
        subject: l.subject.name,
        faculty: l.faculty.fullName,
        test: l.test,
        attendanceStatus: l.attendance[0]?.status ?? null,
      })),
      parentMeetings: parentMeetings.map((m) => ({
        id: m.id,
        title: m.title,
        date: m.date,
        startTime: toTimeString(m.startTime),
        endTime: toTimeString(m.endTime),
        venue: m.venue,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Tests — their own marks, plus what's scheduled and not yet held
// ---------------------------------------------------------------------------

portalRouter.get("/tests", async (req, res, next) => {
  try {
    const studentId = req.user!.studentId!;
    const batchId = await currentBatchId(studentId);
    const today = todayDateOnly();

    const [results, upcoming] = await Promise.all([
      prisma.testResult.findMany({
        where: { studentId },
        select: {
          id: true,
          marksObtained: true,
          remarks: true,
          enteredAt: true,
          lecture: { select: { date: true } },
          test: {
            select: {
              id: true,
              title: true,
              totalMarks: true,
              passingMarks: true,
              instructions: true,
              paperAssetUrl: true,
              paperAssetName: true,
              subject: { select: { name: true } },
            },
          },
        },
        orderBy: { enteredAt: "desc" },
      }),
      batchId
        ? prisma.lecture.findMany({
            where: {
              batchId,
              kind: "TEST",
              cancelledAt: null,
              date: { gte: today },
              // A test session the student already has marks for isn't
              // upcoming, whatever its date says.
              results: { none: { studentId } },
            },
            select: {
              id: true,
              date: true,
              startTime: true,
              endTime: true,
              test: {
                select: {
                  id: true,
                  title: true,
                  totalMarks: true,
                  passingMarks: true,
                  instructions: true,
                  paperAssetUrl: true,
                  paperAssetName: true,
                  subject: { select: { name: true } },
                },
              },
            },
            orderBy: [{ date: "asc" }, { startTime: "asc" }],
          })
        : Promise.resolve([]),
    ]);

    res.json({
      upcoming: upcoming
        .filter((l) => l.test !== null)
        .map((l) => ({
          lectureId: l.id,
          date: l.date,
          startTime: toTimeString(l.startTime),
          endTime: toTimeString(l.endTime),
          test: {
            ...l.test!,
            subject: l.test!.subject.name,
          },
        })),
      results: results.map((r) => ({
        id: r.id,
        heldOn: r.lecture.date,
        enteredAt: r.enteredAt,
        marksObtained: money(r.marksObtained),
        remarks: r.remarks,
        test: {
          id: r.test.id,
          title: r.test.title,
          subject: r.test.subject.name,
          totalMarks: r.test.totalMarks,
          passingMarks: r.test.passingMarks,
          instructions: r.test.instructions,
          paperAssetUrl: r.test.paperAssetUrl,
          paperAssetName: r.test.paperAssetName,
        },
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

portalRouter.get("/attendance", async (req, res, next) => {
  try {
    const studentId = req.user!.studentId!;

    const records = await prisma.attendanceRecord.findMany({
      where: { studentId },
      select: {
        id: true,
        status: true,
        markedAt: true,
        lecture: {
          select: {
            id: true,
            date: true,
            startTime: true,
            kind: true,
            subject: { select: { name: true } },
            batch: { select: { name: true } },
          },
        },
      },
      orderBy: [{ lecture: { date: "desc" } }],
      // Deliberately capped: a student's full history can run into hundreds of
      // rows and the screen shows a rolling record, not an archive. The stats
      // below are computed from every record, not just this page.
      take: 120,
    });

    const all = await prisma.attendanceRecord.findMany({ where: { studentId }, select: { status: true } });

    res.json({
      stats: attendanceStats(all),
      records: records.map((r) => ({
        id: r.id,
        status: r.status,
        date: r.lecture.date,
        startTime: toTimeString(r.lecture.startTime),
        kind: r.lecture.kind,
        subject: r.lecture.subject.name,
        batch: r.lecture.batch.name,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------

portalRouter.get("/fees", async (req, res, next) => {
  try {
    const studentId = req.user!.studentId!;
    const fees = await feeSummary(studentId);
    if (!fees) return res.json({ summary: null, installments: [], payments: [] });

    const payments = await prisma.payment.findMany({
      where: { feeAccountId: fees.account.id, voidedAt: null },
      select: {
        id: true,
        amount: true,
        mode: true,
        paidOn: true,
        receiptNumber: true,
        publicToken: true,
        publicTokenRevokedAt: true,
      },
      orderBy: { paidOn: "desc" },
    });

    res.json({
      summary: fees.summary,
      installments: fees.installments,
      payments: payments.map((p) => ({
        id: p.id,
        amount: money(p.amount),
        mode: p.mode,
        paidOn: p.paidOn,
        receiptNumber: p.receiptNumber,
        // The public receipt link the student can open, print or forward —
        // omitted entirely when revoked, so the portal never renders a link
        // that would 404.
        receiptToken: p.publicTokenRevokedAt === null ? p.publicToken : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Notifications — the reminders feed
// ---------------------------------------------------------------------------

portalRouter.get("/notifications", async (req, res, next) => {
  try {
    const [notifications, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, type: true, title: true, body: true, metadata: true, readAt: true, createdAt: true },
      }),
      prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
    ]);

    res.json({ notifications, unread });
  } catch (err) {
    next(err);
  }
});

const markReadSchema = z.object({ ids: z.array(z.string()).optional() });

/** Marks the given notifications read, or all of them when no ids are given.
 * Scoped to the caller's own userId, so passing someone else's id is a no-op
 * rather than a leak. */
portalRouter.post("/notifications/read", validateBody(markReadSchema), async (req, res, next) => {
  try {
    const { ids } = req.body as z.infer<typeof markReadSchema>;
    const result = await prisma.notification.updateMany({
      where: { userId: req.user!.id, readAt: null, id: ids && ids.length > 0 ? { in: ids } : undefined },
      data: { readAt: new Date() },
    });
    res.json({ marked: result.count });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

portalRouter.get("/profile", async (req, res, next) => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: req.user!.studentId! },
      select: {
        name: true,
        studentCode: true,
        email: true,
        phone: true,
        parentPhone: true,
        dob: true,
        fatherName: true,
        motherName: true,
        school: true,
        admissionDate: true,
        course: { select: { name: true, code: true } },
        institute: { select: { name: true, phone: true, email: true, city: true } },
        batches: {
          where: { leftAt: null },
          select: { joinedAt: true, batch: { select: { name: true } } },
          orderBy: { joinedAt: "desc" },
          take: 1,
        },
      },
    });
    if (!student) throw ApiError.notFound("Student not found");

    res.json({
      ...student,
      currentBatch: student.batches[0]?.batch ?? null,
      batches: undefined,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Self-serve payment collection — the student's side (changes-phase11.md §11.1)
// ---------------------------------------------------------------------------

/** Read-only view of the institute's payment config. Returns `null` when the
 * feature is off or never configured, so the frontend can render "no Pay fees
 * button" with one falsy check rather than inspecting individual fields. */
portalRouter.get("/payment-config", async (req, res, next) => {
  try {
    const config = await prisma.institutePaymentConfig.findUnique({ where: { instituteId: req.user!.instituteId! } });
    if (!config || !config.isEnabled) return res.json(null);

    // No QR image is sent — the portal generates the QR from upiId/payeeName
    // (plus whatever amount the student is paying) on the fly, so it can
    // never disagree with the UPI ID it's meant to encode. See
    // changes-phase13.md §13.1.
    res.json({
      upiId: config.upiId,
      payeeName: config.payeeName,
      instructions: config.instructions,
    });
  } catch (err) {
    next(err);
  }
});

/** The student's own submitted proofs, newest first — powers the "Waiting for
 * confirmation" / "Rejected, try again" states on the Fees screen. */
portalRouter.get("/payment-proofs", async (req, res, next) => {
  try {
    const proofs = await prisma.paymentProof.findMany({
      where: { studentId: req.user!.studentId! },
      select: {
        id: true,
        amountClaimed: true,
        referenceNo: true,
        assetUrl: true,
        assetPublicId: true,
        status: true,
        rejectReason: true,
        submittedAt: true,
        reviewedAt: true,
      },
      orderBy: { submittedAt: "desc" },
      take: 20,
    });

    res.json(
      proofs.map((p) => ({
        id: p.id,
        amountClaimed: money(p.amountClaimed),
        referenceNo: p.referenceNo,
        // Signed fresh on every read — the stored URL is inert on its own
        // (see services/uploads.ts), so a student re-opening this screen a
        // week later still gets a link that actually works.
        assetUrl: signedAssetUrl(p.assetPublicId, p.assetUrl),
        status: p.status,
        rejectReason: p.rejectReason,
        submittedAt: p.submittedAt,
        reviewedAt: p.reviewedAt,
      }))
    );
  } catch (err) {
    next(err);
  }
});

const proofUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });
// Burst guard on top of the one-PENDING-proof rule above — that rule stops a
// flood of *accepted* submissions, this stops a flood of upload attempts
// (rejected ones included) from one source in a short window.
const proofUploadLimiter = rateLimit({ max: 10, windowMs: 15 * 60_000, keyPrefix: "payment-proof-upload" });

/** Uploads the screenshot itself. Kept separate from POST /payment-proofs so
 * a student can upload once and see the image before committing to submit —
 * and so the upload step, which touches Cloudinary, can be retried on its own
 * without re-typing the amount. */
portalRouter.post(
  "/payment-proofs/upload",
  proofUploadLimiter,
  proofUpload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) throw ApiError.badRequest("No file was uploaded.");
      const instituteId = req.user!.instituteId!;

      // Payment screenshots are financial records, not course material — see
      // services/uploads.ts's AssetVisibility doc — so they're stored
      // `authenticated` rather than `public` like a QR or test paper.
      const asset = await uploadAsset(req.file, { instituteId, folder: "payment-proofs", visibility: "authenticated" });

      res.status(201).json({ url: asset.url, name: asset.name, publicId: asset.publicId });
    } catch (err) {
      next(err);
    }
  }
);

const submitProofSchema = z.object({
  amountClaimed: z.number().positive("Enter the amount you paid"),
  referenceNo: z.string().max(50).optional(),
  assetUrl: z.string().url(),
  assetName: z.string().max(255),
  assetPublicId: z.string().max(255),
});

/**
 * Records a student's claim of having paid outside the app. The screenshot
 * itself is uploaded separately via POST /portal/payment-proofs/upload (below)
 * — this route only ever receives the resulting URL/publicId, never a raw
 * file, so the compression the client already did is never redone or undone
 * on the way in.
 */
portalRouter.post("/payment-proofs", validateBody(submitProofSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof submitProofSchema>;
    const studentId = req.user!.studentId!;
    const instituteId = req.user!.instituteId!;

    const config = await prisma.institutePaymentConfig.findUnique({ where: { instituteId } });
    if (!config?.isEnabled) throw ApiError.badRequest("Online payment isn't available for your institute right now.");

    const account = await prisma.feeAccount.findUnique({ where: { studentId } });
    if (!account) throw ApiError.badRequest("No fee account was found for you.");

    // One pending proof at a time — otherwise the review queue can be flooded
    // by resubmitting before staff ever look at the first one.
    const pending = await prisma.paymentProof.findFirst({ where: { studentId, status: "PENDING" } });
    if (pending) {
      throw ApiError.conflict(
        "You already have a payment awaiting confirmation. Wait for it to be reviewed before submitting another."
      );
    }

    const proof = await prisma.paymentProof.create({
      data: {
        instituteId,
        studentId,
        feeAccountId: account.id,
        amountClaimed: new Prisma.Decimal(body.amountClaimed),
        referenceNo: body.referenceNo,
        assetUrl: body.assetUrl,
        assetName: body.assetName,
        assetPublicId: body.assetPublicId,
      },
    });

    res.status(201).json({ id: proof.id, status: proof.status, submittedAt: proof.submittedAt });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Study material — read-only, scoped to the student's own course.
// See changes-phase12.md §12.5.
// ---------------------------------------------------------------------------

/** Everything shared with this student's course, newest first. Scoped by the
 * course on their own Student row (never a courseId from the request), so one
 * student can never read another course's material. Course-wide resources
 * (subjectId null) come back alongside subject-specific ones — the portal
 * groups them for display. */
portalRouter.get("/study-resources", async (req, res, next) => {
  try {
    const student = await prisma.student.findUniqueOrThrow({
      where: { id: req.user!.studentId! },
      select: { courseId: true },
    });

    const resources = await prisma.studyResource.findMany({
      where: { courseId: student.courseId },
      select: {
        id: true,
        title: true,
        description: true,
        kind: true,
        assetUrl: true,
        assetName: true,
        externalUrl: true,
        createdAt: true,
        subject: { select: { id: true, name: true, shortCode: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(resources);
  } catch (err) {
    next(err);
  }
});
