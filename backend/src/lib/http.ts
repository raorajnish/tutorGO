export class ApiError extends Error {
  status: number;
  code: string;
  /// Extra structured data the client needs alongside the message — e.g. the
  /// maintenance window's endAt/message on a MAINTENANCE_ACTIVE 503, so the
  /// frontend doesn't need a second request to render the maintenance page.
  details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, code = "BAD_REQUEST") {
    return new ApiError(400, code, message);
  }

  static unauthorized(message = "Unauthorized", code = "UNAUTHORIZED") {
    return new ApiError(401, code, message);
  }

  static forbidden(message = "Forbidden", code = "FORBIDDEN") {
    return new ApiError(403, code, message);
  }

  static notFound(message = "Not found", code = "NOT_FOUND") {
    return new ApiError(404, code, message);
  }

  static conflict(message: string, code = "CONFLICT") {
    return new ApiError(409, code, message);
  }

  static tooManyRequests(message = "Too many requests — try again shortly", code = "RATE_LIMITED") {
    return new ApiError(429, code, message);
  }
}
