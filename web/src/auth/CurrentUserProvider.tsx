import { createContext, useEffect, useState, type ReactNode } from "react";
import { getMe } from "../api/accounts";
import { setUserHandle } from "../api/client";
import type { Me } from "../api/types";

/** The two hardcoded users api knows. The first is the publisher. */
export const KNOWN_HANDLES = ["kisasa", "demo-consumer"] as const;

const STORAGE_KEY = "durables.userHandle";

export type CurrentUser = {
  handle: string;
  me: Me | null;
  switchTo(handle: string): void;
};

export const CurrentUserContext = createContext<CurrentUser | null>(null);

// POC-SHORTCUT: SC-002
export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [handle, setHandle] = useState<string>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const initial = stored && (KNOWN_HANDLES as readonly string[]).includes(stored) ? stored : KNOWN_HANDLES[0];
    setUserHandle(initial);
    return initial;
  });
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    setUserHandle(handle);
    localStorage.setItem(STORAGE_KEY, handle);
    let cancelled = false;
    setMe(null);
    getMe()
      .then((result) => !cancelled && setMe(result))
      .catch(() => !cancelled && setMe(null));
    return () => {
      cancelled = true;
    };
  }, [handle]);

  return (
    <CurrentUserContext.Provider value={{ handle, me, switchTo: setHandle }}>{children}</CurrentUserContext.Provider>
  );
}
