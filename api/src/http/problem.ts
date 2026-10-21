import type { Context } from "hono";
import type {
  ClientErrorStatusCode,
  ServerErrorStatusCode,
} from "hono/utils/http-status";

// RFC 9457 Problem Details: the body of every API error response (api/CONVENTIONS.md).
// app.onError, app.notFound and the validation hook all answer through problemResponse.

export const problemContentType = "application/problem+json";

export type ProblemStatus = ClientErrorStatusCode | ServerErrorStatusCode;

/** One failing request field, so web can show the message beside it. */
export interface FieldError {
  field: string;
  message: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: ProblemStatus;
  detail?: string;
  errors?: FieldError[];
}

export interface ProblemInit {
  status: ProblemStatus;
  type?: string;
  title?: string;
  detail?: string;
  errors?: FieldError[];
}

const titles: Partial<Record<ProblemStatus, string>> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  413: "Content Too Large",
  422: "Unprocessable Content",
  429: "Too Many Requests",
  500: "Internal Server Error",
};

/** Builds a Problem Details body. With no type, it is about:blank and the title is the status phrase. */
export const problem = ({
  status,
  type,
  title,
  detail,
  errors,
}: ProblemInit): ProblemDetails => ({
  type: type ?? "about:blank",
  title: title ?? titles[status] ?? "Error",
  status,
  ...(detail === undefined ? {} : { detail }),
  ...(errors === undefined ? {} : { errors }),
});

/** The one way an error response is written. */
export const problemResponse = (c: Context, details: ProblemDetails) =>
  c.body(JSON.stringify(details), details.status, {
    "Content-Type": problemContentType,
  });

/**
 * An anticipated failure. Throw it from a handler or middleware; app.onError turns it into
 * its Problem Details response.
 */
export class ProblemError extends Error {
  readonly problem: ProblemDetails;

  constructor(init: ProblemInit) {
    const details = problem(init);
    super(details.detail ?? details.title);
    this.name = "ProblemError";
    this.problem = details;
  }
}
