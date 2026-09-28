import { request } from "./client";
import type { Me } from "./types";

export function getMe(): Promise<Me> {
  return request<Me>("GET", "/me");
}
