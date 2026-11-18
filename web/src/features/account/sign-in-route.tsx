import { useSearchParams } from "react-router";
import { readSignInAddress } from "./sign-in-address";
import { SignInPage } from "./sign-in-page";

// Route module: what React Router's lazy() loads for "/sign-in". The address may name the
// page to return to after signing in, and whether the last sign-in did not finish.
export function Component() {
  const [params] = useSearchParams();
  const { failed, returnTo } = readSignInAddress(params);

  return <SignInPage failed={failed} returnTo={returnTo} />;
}
