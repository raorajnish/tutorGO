import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/http.js";
import { Prisma } from "../generated/prisma/client.js";

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound("Route not found"));
}

/**
 * Translates the handful of Prisma failures that represent a legitimate
 * client-side outcome rather than a server fault.
 *
 * Without this every one of them became a generic 500 "Something went wrong" —
 * so a double-clicked delete (the second click finds nothing to delete) read as
 * a server crash to the user, and buried a real signal in the logs. Anything
 * not listed here stays a 500 on purpose: an unrecognised database error IS a
 * bug, and should look like one.
 *
 * Messages are deliberately generic. Prisma's own error text names tables,
 * columns and constraint identifiers, which is internal schema detail that
 * should never reach a client — the full error is still logged server-side.
 */
function fromPrisma(err: Prisma.PrismaClientKnownRequestError): ApiError | null {
  switch (err.code) {
    case "P2025":
      // "An operation failed because it depends on one or more records that
      // were required but not found." Usually a stale UI acting on something
      // already deleted, or the losing side of two concurrent requests.
      return ApiError.notFound("That record no longer exists — refresh and try again.");

    case "P2002":
      // Unique constraint. Routes that can anticipate this (a duplicate course
      // code, a repeated email) check for it first and raise a specific
      // message; this is the backstop for the ones that race past that check.
      return ApiError.conflict("That already exists — use a different value.", "DUPLICATE");

    case "P2003":
      // Foreign key constraint — almost always deleting a row something else
      // still points at.
      return ApiError.badRequest(
        "This is still referenced by other records — remove those first.",
        "IN_USE"
      );

    case "P2014":
      // A change that would break a required relation.
      return ApiError.badRequest("That change would break a required link between records.", "INVALID_RELATION");

    case "P2000":
      return ApiError.badRequest("One of the values is too long.", "VALUE_TOO_LONG");

    default:
      return null;
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = fromPrisma(err);
    if (mapped) {
      // Still logged: a P2002 that a route should have caught earlier is worth
      // seeing, even though the client gets a clean 409.
      console.warn(`Prisma ${err.code}:`, err.message);
      return res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
  }

  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
}
