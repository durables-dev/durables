import { z } from "zod";

// Activity pages live at /:handle/:name, so a handle can never be one of web's top-level
// routes (web/CONVENTIONS.md). Adding a top-level route means adding it here.
export const reservedHandles = new Set([
  "api",
  "search",
  "contribute",
  "terms",
  "privacy",
  "security",
]);

// The format rule itself is the sign-in epic's to set; this placeholder only enforces
// the reserved words so both surfaces share one list from the start.
export const handleSchema = z
  .string()
  .refine((handle) => !reservedHandles.has(handle.toLowerCase()), {
    message: "This handle is reserved.",
  });
