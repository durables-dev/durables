import type { ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ClientErrorStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "../app-env";
import { problem, ProblemError, problemResponse } from "./problem";

const isClientError = (status: number): status is ClientErrorStatusCode =>
  status >= 400 && status < 500;

/** app.notFound: an unknown API route answers 404 Problem Details. */
export const notFound: NotFoundHandler = (c) =>
  problemResponse(
    c,
    problem({ status: 404, detail: "No API route matches this path." }),
  );

/**
 * app.onError: a ProblemError becomes its own response, and a 4xx HTTPException from Hono's
 * middleware keeps its status. Anything else is unexpected and becomes a bare 500. The client
 * never sees the error's message or stack.
 */
export const onError: ErrorHandler<AppEnv> = (error, c) => {
  if (error instanceof ProblemError) {
    return problemResponse(c, error.problem);
  }
  if (error instanceof HTTPException && isClientError(error.status)) {
    return problemResponse(c, problem({ status: error.status }));
  }
  console.error({
    message: "Unexpected error",
    requestId: c.var.requestId,
    error: { name: error.name, message: error.message, stack: error.stack },
  });
  return problemResponse(c, problem({ status: 500 }));
};
