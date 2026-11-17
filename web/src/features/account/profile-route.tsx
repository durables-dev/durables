import { ProfilePage } from "./profile-page";

// Route module: what React Router's lazy() loads for "/profile", the signed-in owner's own
// profile. The address names no one: the reads answer for the session's account only.
export function Component() {
  return <ProfilePage />;
}
