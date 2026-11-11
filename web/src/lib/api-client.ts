import type { AppType } from "@durables/api";
import { hc } from "hono/client";

// The one typed client for the API (docs/adr/0010). Same origin, so cookies travel by default.
export const api = hc<AppType>("/");
