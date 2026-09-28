/**
 * An error a service raises on purpose, with the HTTP status and body fields it
 * maps to. app.ts turns it into `{ error: message, ...details }`.
 */
export class ServiceError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export class BadRequestError extends ServiceError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(400, message, details);
  }
}
