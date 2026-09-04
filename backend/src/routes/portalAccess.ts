import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireInstitute, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { generateTempPassword, hashPassword } from "../lib/password.js";
import { sendMail } from "../services/mailer.js";
import { inviteEmailHtml } from "../lib/emailTemplates.js";
import { auditLog } from "../services/audit.js";
import { derivePortalStatus, type PortalAccessStatus } from "../lib/portalAccess.js";

/**
 * Student-portal credential management (changes-phase10.md §10.6).
 *
 * Issuing a login is handing out access to a student's own fee and academic
 * record, so the whole router is OWNER/ADMIN — deliberately tighter than
 * general student management, which RECEPTION can also do.
 */
export const portalAccessRouter = Router();

portalAccessRouter.use(authenticate, requireInstitute, requireRoles("OWNER", "ADMIN"));

const loginUrlFor = (email: string) =>
  `${process.env.FRONTEND_URL ?? "http://127.0.0.1:3000"}/login?email=${encodeURIComponent(email)}`;

/** Sends the credential mail. Shared by first issue, re-issue and resend so
 * the three can never drift into sending subtly different things. */
async function sendCredentialMail(input: {
  student: { name: string; email: string };
  instituteId: string;
  organizationId: string | null;
  instituteName: string;
  tempPassword: string;
}) {
  return sendMail({
    to: input.student.email,
    subject: `Your student portal login — ${input.instituteName}`,
    html: inviteEmailHtml({
      recipientName: input.student.name,
      orgOrInstituteName: input.instituteName,
      email: input.student.email,
      tempPassword: input.tempPassword,
      role: "Student",
      loginUrl: loginUrlFor(input.student.email),
    }),
    purpose: "STUDENT_PORTAL_INVITE",
    organizationId: input.organizationId,
    instituteId: input.instituteId,
  });
}

/** Loads one student with everything status derivation needs, tenant-scoped. */
async function loadStudentForPortal(id: string, instituteId: string) {
  const student = await prisma.student.findUnique({
    where: { id },
    select: {
      id: true,
      instituteId: true,
      name: true,
      email: true,
      isActive: true,
      courseId: true,
      userId: true,
      portalIssuedForCourseId: true,
      course: { select: { id: true, name: true, code: true, portalEnabled: true } },
      user: { select: { id: true, email: true, isActive: true, lastLoginAt: true, mustChangePassword: true } },
    },
  });
  if (!student || student.instituteId !== instituteId) throw ApiError.notFound("Student not found");
  return student;
}

type LoadedStudent = Awaited<ReturnType<typeof loadStudentForPortal>>;

function statusOf(s: {
  courseId: string;
  userId: string | null;
  portalIssuedForCourseId: string | null;
  course: { portalEnabled: boolean };
  user: { isActive: boolean } | null;
}): PortalAccessStatus {
  return derivePortalStatus({
    courseId: s.courseId,
    userId: s.userId,
    portalIssuedForCourseId: s.portalIssuedForCourseId,
    coursePortalEnabled: s.course.portalEnabled,
    userIsActive: s.user?.isActive ?? null,
  });
}

// ---------------------------------------------------------------------------
// Management page data
// ---------------------------------------------------------------------------

/**
 * Every course with its students and their derived portal status. Two flat
 * institute-scoped queries (courses, then students with their login joined),
 * grouped in memory — not a per-student lookup, so this stays one round trip
 * per collection however many students the institute has.
 */
portalAccessRouter.get("/", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;

    const [courses, students] = await Promise.all([
      prisma.course.findMany({
        where: { instituteId },
        select: { id: true, name: true, code: true, isActive: true, portalEnabled: true },
        orderBy: { name: "asc" },
      }),
      prisma.student.findMany({
        where: { instituteId, isActive: true },
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
          courseId: true,
          userId: true,
          portalIssuedForCourseId: true,
          batches: {
            where: { leftAt: null },
            select: { batch: { select: { id: true, name: true } } },
            orderBy: { joinedAt: "desc" },
            take: 1,
          },
          user: { select: { isActive: true, lastLoginAt: true, mustChangePassword: true } },
        },
        orderBy: { name: "asc" },
      }),
    ]);

    const portalByCourse = new Map(courses.map((c) => [c.id, c.portalEnabled]));
    const byCourse = new Map<string, ReturnType<typeof rowFor>[]>();

    function rowFor(s: (typeof students)[number]) {
      const status = derivePortalStatus({
        courseId: s.courseId,
        userId: s.userId,
        portalIssuedForCourseId: s.portalIssuedForCourseId,
        coursePortalEnabled: portalByCourse.get(s.courseId) ?? false,
        userIsActive: s.user?.isActive ?? null,
      });
      return {
        id: s.id,
        name: s.name,
        email: s.email,
        batch: s.batches[0]?.batch ?? null,
        status,
        hasLogin: Boolean(s.userId),
        lastLoginAt: s.user?.lastLoginAt ?? null,
        awaitingFirstLogin: s.user ? s.user.mustChangePassword : false,
      };
    }

    for (const s of students) {
      const list = byCourse.get(s.courseId);
      if (list) list.push(rowFor(s));
      else byCourse.set(s.courseId, [rowFor(s)]);
    }

    res.json(
      courses.map((c) => {
        const rows = byCourse.get(c.id) ?? [];
        return {
          id: c.id,
          name: c.name,
          code: c.code,
          isActive: c.isActive,
          portalEnabled: c.portalEnabled,
          counts: {
            total: rows.length,
            active: rows.filter((r) => r.status === "ACTIVE").length,
            pending: rows.filter((r) => r.status === "PENDING").length,
          },
          students: rows,
        };
      })
    );
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Course-level portal toggle
// ---------------------------------------------------------------------------

const togglePortalSchema = z.object({ portalEnabled: z.boolean() });

/** Lives here rather than on PATCH /academics/courses/:id because it is an
 * access-control decision, not course metadata: RECEPTION can edit a course
 * but must not be able to grant a whole class access to their fee records. */
portalAccessRouter.patch(
  "/courses/:id",
  validateBody(togglePortalSchema),
  async (req, res, next) => {
    try {
      const instituteId = req.tenantId!;
      const { portalEnabled } = req.body as z.infer<typeof togglePortalSchema>;

      const course = await prisma.course.findUnique({ where: { id: req.params.id as string } });
      if (!course || course.instituteId !== instituteId) throw ApiError.notFound("Course not found");

      const updated = await prisma.course.update({
        where: { id: course.id },
        data: { portalEnabled },
        select: { id: true, portalEnabled: true },
      });

      await auditLog({
        action: portalEnabled ? "COURSE_PORTAL_ENABLED" : "COURSE_PORTAL_DISABLED",
        instituteId,
        organizationId: req.user!.organizationId,
        userId: req.user!.id,
        targetType: "Course",
        targetId: course.id,
        metadata: { code: course.code },
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Credential issuance
// ---------------------------------------------------------------------------

/** Creates or re-issues one student's login. Returns the mail result so the
 * caller can surface the temp password inline when delivery failed, matching
 * how staff invites already behave. */
async function issueCredential(
  student: LoadedStudent,
  actor: { instituteId: string; organizationId: string | null; userId: string },
  instituteName: string
) {
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const email = student.email.toLowerCase();

  // A student email colliding with a *staff* login is the one case that can't
  // be resolved automatically — surfaced as a clear conflict rather than a
  // raw unique-constraint violation.
  const clash = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (clash && clash.id !== student.userId) {
    throw ApiError.conflict(
      "Another account on TutorGO already uses this email. Change the student's email first, then send credentials."
    );
  }

  await prisma.$transaction(async (tx) => {
    if (student.userId) {
      // Re-issue: rotate the password, re-enable, and re-point the credential
      // at the course they're actually on now. The User row itself is reused,
      // so nothing that references it (notifications, push subscriptions) is
      // orphaned by a course change.
      await tx.user.update({
        where: { id: student.userId },
        data: {
          email,
          fullName: student.name,
          passwordHash,
          mustChangePassword: true,
          isActive: true,
        },
      });
      await tx.student.update({
        where: { id: student.id },
        data: { portalIssuedForCourseId: student.courseId },
      });
    } else {
      const user = await tx.user.create({
        data: {
          instituteId: actor.instituteId,
          email,
          passwordHash,
          fullName: student.name,
          phone: null,
          role: "STUDENT",
          mustChangePassword: true,
        },
      });
      await tx.student.update({
        where: { id: student.id },
        data: { userId: user.id, portalIssuedForCourseId: student.courseId },
      });
    }
  });

  await auditLog({
    action: student.userId ? "STUDENT_PORTAL_LOGIN_REISSUED" : "STUDENT_PORTAL_LOGIN_CREATED",
    instituteId: actor.instituteId,
    organizationId: actor.organizationId,
    userId: actor.userId,
    targetType: "Student",
    targetId: student.id,
    metadata: { email, courseId: student.courseId },
  });

  const mail = await sendCredentialMail({
    student: { name: student.name, email },
    instituteId: actor.instituteId,
    organizationId: actor.organizationId,
    instituteName,
    tempPassword,
  });

  return { emailDelivered: mail.delivered, tempPassword: mail.delivered ? undefined : tempPassword };
}

async function instituteNameFor(instituteId: string) {
  const institute = await prisma.institute.findUniqueOrThrow({
    where: { id: instituteId },
    select: { name: true },
  });
  return institute.name;
}

portalAccessRouter.post("/students/:id/issue", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const student = await loadStudentForPortal(req.params.id as string, instituteId);
    const status = statusOf(student);

    if (status === "NOT_ELIGIBLE") {
      throw ApiError.badRequest(
        "Turn on portal access for this student's course before sending credentials.",
        "PORTAL_NOT_ENABLED"
      );
    }
    if (status === "ACTIVE" || status === "SUSPENDED") {
      // Not an error case worth blocking on, but "issue" and "resend" mean
      // different things to staff — point them at the right one rather than
      // silently rotating a working password.
      throw ApiError.conflict("This student already has a login. Use resend to send fresh credentials.");
    }
    if (!student.isActive) throw ApiError.badRequest("This student is inactive.");

    const result = await issueCredential(
      student,
      { instituteId, organizationId: req.user!.organizationId, userId: req.user!.id },
      await instituteNameFor(instituteId)
    );

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

portalAccessRouter.post("/students/:id/resend", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const student = await loadStudentForPortal(req.params.id as string, instituteId);

    if (!student.userId) throw ApiError.badRequest("This student doesn't have a login yet.");
    if (!student.course.portalEnabled) {
      throw ApiError.badRequest(
        "Portal access is off for this student's course, so a resent password wouldn't work.",
        "PORTAL_NOT_ENABLED"
      );
    }

    // Deliberately routed through the same helper as first issue: a resend
    // after a course change also re-points portalIssuedForCourseId, so staff
    // can't accidentally send a credential that won't authenticate.
    const result = await issueCredential(
      student,
      { instituteId, organizationId: req.user!.organizationId, userId: req.user!.id },
      await instituteNameFor(instituteId)
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
});

const updateEmailSchema = z.object({ email: z.string().email("A valid email is required") });

/** Changes the student's email and, when a login exists, the login's email in
 * the same transaction — the two are what the student types to sign in, so
 * they must never be allowed to drift apart. */
portalAccessRouter.patch(
  "/students/:id/email",
  validateBody(updateEmailSchema),
  async (req, res, next) => {
    try {
      const instituteId = req.tenantId!;
      const student = await loadStudentForPortal(req.params.id as string, instituteId);
      const email = (req.body as z.infer<typeof updateEmailSchema>).email.toLowerCase();

      if (email === student.email.toLowerCase()) {
        return res.json({ id: student.id, email: student.email });
      }

      const [studentClash, userClash] = await Promise.all([
        prisma.student.findUnique({ where: { email }, select: { id: true } }),
        prisma.user.findUnique({ where: { email }, select: { id: true } }),
      ]);
      if (studentClash && studentClash.id !== student.id) {
        throw ApiError.conflict("Another student already uses this email.");
      }
      if (userClash && userClash.id !== student.userId) {
        throw ApiError.conflict("Another account on TutorGO already uses this email.");
      }

      await prisma.$transaction(async (tx) => {
        await tx.student.update({ where: { id: student.id }, data: { email } });
        if (student.userId) {
          await tx.user.update({ where: { id: student.userId }, data: { email } });
        }
      });

      await auditLog({
        action: "STUDENT_EMAIL_CHANGED",
        instituteId,
        organizationId: req.user!.organizationId,
        userId: req.user!.id,
        targetType: "Student",
        targetId: student.id,
        metadata: { from: student.email, to: email, hadLogin: Boolean(student.userId) },
      });

      res.json({ id: student.id, email, loginUpdated: Boolean(student.userId) });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Bulk issue — "send credentials to everyone in 12th"
// ---------------------------------------------------------------------------

/**
 * Issues to every currently-PENDING student in a course. Deliberately NOT a
 * single transaction: one student with a colliding or malformed email must
 * not roll back the other forty. Each result is reported individually so the
 * UI can show exactly who was skipped and why.
 */
portalAccessRouter.post("/courses/:id/issue-all", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const courseId = req.params.id as string;

    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course || course.instituteId !== instituteId) throw ApiError.notFound("Course not found");
    if (!course.portalEnabled) {
      throw ApiError.badRequest(
        "Turn on portal access for this course before sending credentials.",
        "PORTAL_NOT_ENABLED"
      );
    }

    const candidates = await prisma.student.findMany({
      where: {
        instituteId,
        courseId,
        isActive: true,
        // PENDING is exactly "no login yet, or a login issued for a different
        // course" — expressed as a query so the batch never loads students it
        // has nothing to do for.
        OR: [{ userId: null }, { portalIssuedForCourseId: { not: courseId } }],
      },
      select: { id: true },
      orderBy: { name: "asc" },
    });

    const instituteName = await instituteNameFor(instituteId);
    const actor = { instituteId, organizationId: req.user!.organizationId, userId: req.user!.id };

    const results: { studentId: string; name: string; outcome: "ISSUED" | "FAILED"; message?: string }[] = [];

    // Sequential on purpose: each issue sends an email and writes an audit
    // row, and a class of 60 firing those in parallel is a good way to get
    // the institute's SMTP throttled.
    for (const { id } of candidates) {
      const student = await loadStudentForPortal(id, instituteId);
      try {
        await issueCredential(student, actor, instituteName);
        results.push({ studentId: id, name: student.name, outcome: "ISSUED" });
      } catch (err) {
        results.push({
          studentId: id,
          name: student.name,
          outcome: "FAILED",
          message: err instanceof ApiError ? err.message : "Could not issue credentials.",
        });
      }
    }

    res.json({
      issued: results.filter((r) => r.outcome === "ISSUED").length,
      failed: results.filter((r) => r.outcome === "FAILED").length,
      results,
    });
  } catch (err) {
    next(err);
  }
});
