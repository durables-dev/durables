import { request } from "./client";
import type { Check, Declarations, Detection } from "./types";

export function detectActivity(code: string): Promise<Detection> {
  return request<Detection>("POST", "/activities/detect", { code });
}

export async function checkActivity(code: string, declarations: Declarations): Promise<Check[]> {
  const { checks } = await request<{ checks: Check[] }>("POST", "/activities/check", { code, declarations });
  return checks;
}
