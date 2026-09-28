import { request } from "./client";
import type { ReadmeTemplate } from "./types";

export function getReadmeTemplate(): Promise<ReadmeTemplate> {
  return request<ReadmeTemplate>("GET", "/readme-template");
}
