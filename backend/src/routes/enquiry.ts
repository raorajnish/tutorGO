import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireInstitute, requireModule, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { auditLog } from "../services/audit.js";

export const enquiryRouter = Router();

enquiryRouter.use(authenticate, requireInstitute, requireModule("ENQUIRY"));

const MANAGE_ROLES = ["OWNER", "ADMIN", "RECEPTION"] as const;
const EDIT_ROLES = ["OWNER", "ADMIN", "RECEPTION", "FACULTY"] as const;

const STATUS_ENUM = z.enum(["NEW", "CONTACTED", "CONVERTED", "LOST"]);
const SOURCE_ENUM = z.enum(["WALK_IN", "REFERRAL", "SOCIAL", "PHONE", "OTHER"]);

enquiryRouter.get("/", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const enquiries = await prisma.enquiry.findMany({
      where: {
        instituteId,
        status: status && STATUS_ENUM.safeParse(status).success ? (status as z.infer<typeof STATUS_ENUM>) : undefined,
        OR: search
          ? [{ name: { contains: search, mode: "insensitive" } }, { phone: { contains: search, mode: "insensitive" } }]
          : undefined,
      },
      include: { course: { select: { id: true, name: true, code: true } } },
      orderBy: { createdAt: "desc" },
    });

    res.json(enquiries);
  } catch (err) {
    next(err);
  }
});

async function assertCourseInInstitute(courseId: string | null | undefined, instituteId: string) {
  if (!courseId) return;
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || course.instituteId !== instituteId) throw ApiError.badRequest("Course not found");
}

const MAX_NOTE_LENGTH = 300;
const noteSchema = z.string().max(MAX_NOTE_LENGTH, `Note must be ${MAX_NOTE_LENGTH} characters or fewer`);

const createEnquirySchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  courseId: z.string().optional(),
  source: SOURCE_ENUM.default("OTHER"),
  nextFollowUpDate: z.coerce.date().optional(),
  notes: noteSchema.optional(),
});

enquiryRouter.post("/", requireRoles(...MANAGE_ROLES), validateBody(createEnquirySchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createEnquirySchema>;
    const instituteId = req.tenantId!;
    await assertCourseInInstitute(body.courseId, instituteId);

    const enquiry = await prisma.enquiry.create({
      data: { instituteId, ...body },
      include: { course: { select: { id: true, name: true, code: true } } },
    });

    await auditLog({
      action: "ENQUIRY_CREATED",
      instituteId,
      organizationId: req.user!.organizationId,
      userId: req.user!.id,
      targetType: "Enquiry",
      targetId: enquiry.id,
    });

    res.status(201).json(enquiry);
  } catch (err) {
    next(err);
  }
});

const updateEnquirySchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  courseId: z.string().nullable().optional(),
  source: SOURCE_ENUM.optional(),
  nextFollowUpDate: z.coerce.date().nullable().optional(),
  notes: noteSchema.nullable().optional(),
});

async function loadOpenEnquiry(id: string, instituteId: string) {
  const enquiry = await prisma.enquiry.findUnique({ where: { id } });
  if (!enquiry || enquiry.instituteId !== instituteId) throw ApiError.notFound("Enquiry not found");
  return enquiry;
}

enquiryRouter.patch("/:id", requireRoles(...EDIT_ROLES), validateBody(updateEnquirySchema), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const body = req.body as z.infer<typeof updateEnquirySchema>;
    const enquiry = await loadOpenEnquiry(req.params.id as string, instituteId);
    if (body.courseId) await assertCourseInInstitute(body.courseId, instituteId);

    const updated = await prisma.enquiry.update({
      where: { id: enquiry.id },
      data: body,
      include: { course: { select: { id: true, name: true, code: true } } },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

const contactedSchema = z.object({
  note: noteSchema.optional(),
  nextFollowUpDate: z.coerce.date().nullable().optional(),
});

enquiryRouter.post("/:id/contacted", requireRoles(...MANAGE_ROLES), validateBody(contactedSchema), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const body = req.body as z.infer<typeof contactedSchema>;
    const enquiry = await loadOpenEnquiry(req.params.id as string, instituteId);
    if (enquiry.status === "CONVERTED" || enquiry.status === "LOST") {
      throw ApiError.badRequest("This enquiry is already closed");
    }

    const [updated] = await prisma.$transaction([
      prisma.enquiry.update({
        where: { id: enquiry.id },
        data: { status: "CONTACTED", nextFollowUpDate: body.nextFollowUpDate ?? enquiry.nextFollowUpDate },
      }),
      prisma.enquiryActivity.create({
        data: {
          enquiryId: enquiry.id,
          type: "CONTACTED",
          note: body.note,
          nextFollowUpDate: body.nextFollowUpDate,
          createdByName: req.user!.fullName,
        },
      }),
    ]);

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

const lostSchema = z.object({ note: noteSchema.optional() });

enquiryRouter.post("/:id/lost", requireRoles(...MANAGE_ROLES), validateBody(lostSchema), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const body = req.body as z.infer<typeof lostSchema>;
    const enquiry = await loadOpenEnquiry(req.params.id as string, instituteId);
    if (enquiry.status === "CONVERTED") throw ApiError.badRequest("This enquiry has already converted");

    const [updated] = await prisma.$transaction([
      prisma.enquiry.update({ where: { id: enquiry.id }, data: { status: "LOST" } }),
      prisma.enquiryActivity.create({
        data: { enquiryId: enquiry.id, type: "LOST", note: body.note, createdByName: req.user!.fullName },
      }),
    ]);

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

enquiryRouter.get("/:id/activities", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const enquiry = await loadOpenEnquiry(req.params.id as string, instituteId);
    const activities = await prisma.enquiryActivity.findMany({
      where: { enquiryId: enquiry.id },
      orderBy: { createdAt: "desc" },
    });
    res.json(activities);
  } catch (err) {
    next(err);
  }
});

enquiryRouter.delete("/:id", requireRoles(...MANAGE_ROLES), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const enquiry = await loadOpenEnquiry(req.params.id as string, instituteId);
    await prisma.enquiry.delete({ where: { id: enquiry.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
