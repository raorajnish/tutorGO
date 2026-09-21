import { Router } from "express";
import { authenticate, requireInstitute } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

export const tenantSearchRouter = Router();

tenantSearchRouter.use(authenticate, requireInstitute);

tenantSearchRouter.get("/", async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    const user = req.user!;
    const instituteId = (req as any).instituteId as string;

    if (q.length < 2) {
      return res.json({ students: [], staff: [], enquiries: [], batches: [] });
    }

    const isFaculty = user.role === "FACULTY";
    const isReception = user.role === "RECEPTION";
    const isAccountant = user.role === "ACCOUNTANT";
    const isAdminOrOwner = user.role === "OWNER" || user.role === "ADMIN" || user.role === "SUPERADMIN";

    // 1. Query Students (name, studentCode, phone, parentPhone)
    const studentWhere: any = {
      instituteId,
      isActive: true,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { studentCode: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
        { parentPhone: { contains: q, mode: "insensitive" } },
      ],
    };

    if (isFaculty) {
      studentWhere.batches = {
        some: {
          batch: {
            lectures: {
              some: {
                facultyId: user.id,
              },
            },
          },
        },
      };
    }

    const studentsPromise = prisma.student.findMany({
      where: studentWhere,
      take: 4,
      select: {
        id: true,
        name: true,
        studentCode: true,
        phone: true,
      },
    });

    // 2. Query Staff (Allowed for OWNER, ADMIN, ACCOUNTANT)
    const canSearchStaff = isAdminOrOwner || isAccountant;
    const staffPromise = canSearchStaff
      ? prisma.user.findMany({
          where: {
            instituteId,
            isActive: true,
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
            ],
          },
          take: 4,
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        })
      : Promise.resolve([]);

    // 3. Query Enquiries (Allowed for OWNER, ADMIN, RECEPTION)
    const canSearchEnquiries = isAdminOrOwner || isReception;
    const enquiriesPromise = canSearchEnquiries
      ? prisma.enquiry.findMany({
          where: {
            instituteId,
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
            ],
          },
          take: 4,
          select: {
            id: true,
            name: true,
            phone: true,
            status: true,
          },
        })
      : Promise.resolve([]);

    // 4. Query Batches
    const batchWhere: any = {
      instituteId,
      isActive: true,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { course: { code: { contains: q, mode: "insensitive" } } },
        { course: { name: { contains: q, mode: "insensitive" } } },
      ],
    };

    if (isFaculty) {
      batchWhere.lectures = {
        some: {
          facultyId: user.id,
        },
      };
    }

    const batchesPromise = prisma.batch.findMany({
      where: batchWhere,
      take: 4,
      select: {
        id: true,
        name: true,
        course: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });

    const [students, staff, enquiries, batches] = await Promise.all([
      studentsPromise,
      staffPromise,
      enquiriesPromise,
      batchesPromise,
    ]);

    return res.json({
      students,
      staff,
      enquiries,
      batches,
    });
  } catch (err) {
    next(err);
  }
});
