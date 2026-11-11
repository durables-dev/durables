import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

// The one MSW worker for component tests. test/setup.ts starts it; a test overrides its
// handlers with worker.use().
export const worker = setupWorker(...handlers);
