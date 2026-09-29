import type { FastifyPluginAsync } from "fastify";
import type { Store } from "../store.js";

// POST /refunds: what refund_charge.py sends. No demo step calls it; step 12
// only registers refund_charge in the worker.

type RefundBody = { charge_id: string; amount: number };

export const refundsRoutes = (store: Store): FastifyPluginAsync => async (app) => {
  app.post<{ Body: RefundBody }>(
    "/refunds",
    {
      schema: {
        body: {
          type: "object",
          required: ["charge_id", "amount"],
          properties: {
            charge_id: { type: "string" },
            amount: { type: "integer" },
          },
        },
      },
    },
    async (request, reply) => {
      const { charge_id, amount } = request.body;
      if (!store.getCharge(charge_id)) return reply.code(404).send({ error: "charge_not_found" });
      const { refund, replayed } = store.refund(idempotencyKey(request.headers), { charge_id, amount });
      return reply.code(replayed ? 200 : 201).send(refund);
    },
  );
};

function idempotencyKey(headers: Record<string, string | string[] | undefined>): string | undefined {
  const value = headers["idempotency-key"];
  return Array.isArray(value) ? value[0] : value;
}
