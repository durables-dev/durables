import { useContext } from "react";
import { CurrentUserContext, type CurrentUser } from "./CurrentUserProvider";

export function useCurrentUser(): CurrentUser {
  const user = useContext(CurrentUserContext);
  if (!user) throw new Error("useCurrentUser must be used inside CurrentUserProvider");
  return user;
}
