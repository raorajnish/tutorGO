import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireInstitute, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { MAX_UPLOAD_BYTES, deleteAsset, uploadAsset } from "../services/uploads.js";

export const studyResourcesRouter = Router();

/// Teaching staff — the same bar as scheduling lectures/tests for a course.
/// RECEPTION is deliberately out: this is course content, not front-desk ops.
const MANAGE_ROLES = ["OWNER", "ADMIN", "FACULTY"] as const;

studyResourcesRouter.use(authenticate, requireInstitute, requireRoles(...MANAGE_ROLES));

const resourceSelect = {
  id: true,
  courseId: true,
  subjectId: true,
  title: true,
  description: true,
  kind: true,
  assetUrl: true,
  assetName: true,
  externalUrl: true,
  createdAt: true,
  course: { select: { id: true, name: true, code: true } },
  subject: { select: { id: true, name: true, shortCode: true } },
  uploadedBy: { select: { id: true, fullName: true } },
} as const;

studyResourcesRouter.get("/", async (req, res, next) => {
  try {
    const courseId = typeof req.query.courseId === "string" ? req.query.courseId : undefined;
    const subjectId = typeof req.query.subjectId === "string" ? req.query.subjectId : undefined;

    const resources = await prisma.studyResource.findMany({
      where: {
        instituteId: req.tenantId!,
        ...(courseId ? { courseId } : {}),
        ...(subjectId ? { subjectId } : {}),
      },
      select: resourceSelect,
      orderBy: { createdAt: "desc" },
    });

    res.json(resources);
  } catch (err) {
    next(err);
  }
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

/** Two-step upload, same shape as tests.ts's question-paper route: the file
 * goes up first and returns a handle, then POST / creates the row that
 * references it. Keeps the create route as plain JSON whether the resource
 * is a file or a link. */
studyResourcesRouter.post("/upload", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) throw ApiError.badRequest("No file was uploaded.");
    // `public`, like test papers — course material where an unguessable URL
    // is acceptable exposure. Financial documents (payment proofs) are the
    // ones that need `authenticated`; see services/uploads.ts.
    const asset = await uploadAsset(req.file, {
      instituteId: req.tenantId!,
      folder: "study-resources",
      visibility: "public",
    });
    res.status(201).json(asset);
  } catch (err) {
    next(err);
  }
});

const createSchema = z
  .object({
    courseId: z.string().min(1, "Course is required"),
    subjectId: z.string().nullable().optional(),
    title: z.string().trim().min(1, "Title is required").max(200),
    description: z.string().trim().max(1000).nullable().optional(),
    kind: z.enum(["FILE", "LINK"]),
    externalUrl: z.string().trim().url("Enter a valid URL").nullable().optional(),
    assetUrl: z.string().nullable().optional(),
    assetName: z.string().nullable().optional(),
    assetPublicId: z.string().nullable().optional(),
  })
  .refine((v) => (v.kind === "LINK" ? !!v.externalUrl : !!v.assetUrl && !!v.assetPublicId), {
    message: "A link resource needs a URL, and a file resource needs an uploaded file",
    path: ["kind"],
  });

studyResourcesRouter.post("/", validateBody(createSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createSchema>;
    const instituteId = req.tenantId!;

    // Course and subject are both re-checked against this institute rather
    // than trusted from the body — the standing tenant-isolation rule.
    const course = await prisma.course.findUnique({ where: { id: body.courseId } });
    if (!course || course.instituteId !== instituteId) throw ApiError.badRequest("Course not found");

    if (body.subjectId) {
      const link = await prisma.courseSubject.findUnique({
        where: { courseId_subjectId: { courseId: body.courseId, subjectId: body.subjectId } },
      });
      // A subject that isn't taught on this course would produce material
      // no student on it can ever be shown — a silent dead end, so it's
      // rejected rather than stored.
      if (!link) throw ApiError.badRequest("That subject isn't taught on the selected course");
    }

    const resource = await prisma.studyResource.create({
      data: {
        instituteId,
        courseId: body.courseId,
        subjectId: body.subjectId || null,
        title: body.title,
        description: body.description || null,
        kind: body.kind,
        externalUrl: body.kind === "LINK" ? body.externalUrl : null,
        assetUrl: body.kind === "FILE" ? body.assetUrl : null,
        assetName: body.kind === "FILE" ? body.assetName : null,
        assetPublicId: body.kind === "FILE" ? body.assetPublicId : null,
        uploadedByUserId: req.user!.id,
      },
      select: resourceSelect,
    });

    res.status(201).json(resource);
  } catch (err) {
    next(err);
  }
});

studyResourcesRouter.delete("/:id", async (req, res, next) => {
  try {
    const resource = await prisma.studyResource.findUnique({ where: { id: req.params.id as string } });
    if (!resource || resource.instituteId !== req.tenantId!) throw ApiError.notFound("Resource not found");

    // The stored asset goes with the row — same discipline as everywhere
    // else uploads are removed, so storage never accumulates orphans.
    if (resource.assetPublicId) await deleteAsset(resource.assetPublicId).catch(() => {});
    await prisma.studyResource.delete({ where: { id: resource.id } });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
