import type { Session } from "../auth/auth";

/**
 * The detection preview's rate-limit key: the signed-in publisher's provider identity, so
 * each publisher has their own limit whatever their IP or however many sessions they hold.
 */
export const previewLimitKey = ({
  provider,
  providerAccountId,
}: Pick<Session, "provider" | "providerAccountId">): string =>
  `${provider}:${providerAccountId}`;
