import { createProductionApp } from "./index";
import { fakeSignIn } from "./session/fake-sign-in";

// Local entry point, used by wrangler.toml and never by the production build. It builds its
// own copy of the production app and adds the local-only routes, so the production app is
// never changed and nothing here reaches src/index.ts.
const app = createProductionApp().route(
  "/api/session/providers/fake",
  fakeSignIn,
);

export default app;
