import type { RequestIdVariables } from "hono/request-id";
import type { Auth } from "./auth/auth";
import type { Storage } from "./storage/storage";

/** The bindings and per-request values every handler and middleware sees. */
export interface AppEnv {
  Bindings: CloudflareBindings;
  Variables: RequestIdVariables & {
    storage: Storage;
    auth: Auth;
    /** The detection preview's rate limit (ADR 0006). */
    previewLimit: RateLimit;
  };
}
