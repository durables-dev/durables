import { request } from "./client";
import type { RubricEntry } from "./types";

export async function getRubric(): Promise<RubricEntry[]> {
  const { entries } = await request<{ entries: RubricEntry[] }>("GET", "/rubric");
  return entries;
}
