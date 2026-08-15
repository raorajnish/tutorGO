import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { ApiError } from "../lib/http.js";

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(ApiError.badRequest(result.error.issues.map((i) => i.message).join("; "), "VALIDATION_ERROR"));
    }
    req.body = result.data;
    next();
  };
}
