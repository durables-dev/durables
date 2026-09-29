import { pathToFileURL } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { chargesRoutes } from "./routes/charges.js";
import { refundsRoutes } from "./routes/refunds.js";
import { createStore } from "./store.js";

// The mock payments API: a stand-in for a real payment provider, which the
// charge_card and refund_charge activities call in the demo.
//
//   npm start          (from testing/mock-payments, or as the compose service)
//
// External system is faked: charges and refunds live in an in-memory store, and
// the only credential accepted is one fixed API key, read from
// MOCK_PAYMENTS_API_KEY. A restart forgets every charge.
// POC-SHORTCUT: SC-017
export function buildServer(apiKey: string, options: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? true });
  const store = createStore();

  app.addHook("onRequest", async (request, reply) => {
    if (request.headers.authorization !== `Bearer ${apiKey}`) {
      return reply.code(401).send({ error: "invalid_api_key" });
    }
  });

  app.register(chargesRoutes(store));
  app.register(refundsRoutes(store));
  return app;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const apiKey = process.env.MOCK_PAYMENTS_API_KEY ?? "sk_test_durables";
  const port = Number(process.env.PORT ?? 4000);
  const host = process.env.HOST ?? "0.0.0.0";
  buildServer(apiKey)
    .listen({ port, host })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
