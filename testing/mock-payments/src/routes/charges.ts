import type { FastifyPluginAsync } from "fastify";
import type { Store } from "../store.js";

// POST /charges: what charge_card.py sends. Amounts are integer minor units.

/** The fixed test card that always declines. */
export const DECLINE_CARD = "4000000000000002";

type ChargeBody = { amount: number; currency: string; card_number: string };

export const chargesRoutes = (store: Store): FastifyPluginAsync => async (app) => {
  app.post<{ Body: ChargeBody }>(
    "/charges",
    {
      schema: {
        body: {
          type: "object",
          required: ["amount", "currency", "card_number"],
          properties: {
            amount: { type: "integer" },
            currency: { type: "string" },
            card_number: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { amount, currency, card_number } = request.body;
      if (card_number === DECLINE_CARD) return reply.code(402).send({ error: "card_declined" });
      const { charge, replayed } = store.charge(idempotencyKey(request.headers), { amount, currency });
      return reply.code(replayed ? 200 : 201).send(charge);
    },
  );
};

function idempotencyKey(headers: Record<string, string | string[] | undefined>): string | undefined {
  const value = headers["idempotency-key"];
  return Array.isArray(value) ? value[0] : value;
}
