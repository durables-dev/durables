import { useQuery } from "@tanstack/react-query";
import { sessionQuery, type SessionUser } from "./session";

/**
 * The signed-in publisher, or null. Null while the session is read and when the read fails:
 * a session that cannot be read is shown as signed out.
 */
export function useSessionUser(): SessionUser | null {
  const { data } = useQuery(sessionQuery);
  return data?.user ?? null;
}
