import { describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

const KEY = "sk_test_example";
const auth = { authorization: `Bearer ${KEY}` };
const card = { amount: 1999, currency: "usd", card_number: "4242424242424242" };

describe("mock payments", () => {
  it("rejects a missing or wrong key with 401", async () => {
    const app = buildServer(KEY, { logger: false });
    expect((await app.inject({ method: "POST", url: "/charges", payload: card })).statusCode).toBe(401);
    const wrong = await app.inject({ method: "POST", url: "/charges", payload: card, headers: { authorization: "Bearer nope" } });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toEqual({ error: "invalid_api_key" });
  });

  it("creates a charge, and replays it for a repeated idempotency key", async () => {
    const app = buildServer(KEY, { logger: false });
    const headers = { ...auth, "idempotency-key": "wf-1-1" };
    const first = await app.inject({ method: "POST", url: "/charges", payload: card, headers });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ status: "succeeded", amount: 1999, currency: "usd" });
    expect(first.json().id).toMatch(/^ch_/);
    const again = await app.inject({ method: "POST", url: "/charges", payload: card, headers });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual(first.json());
  });

  it("declines the fixed decline card with 402", async () => {
    const app = buildServer(KEY, { logger: false });
    const declined = await app.inject({
      method: "POST",
      url: "/charges",
      payload: { ...card, card_number: "4000000000000002" },
      headers: auth,
    });
    expect(declined.statusCode).toBe(402);
    expect(declined.json()).toEqual({ error: "card_declined" });
  });

  it("refunds a known charge, replays a repeated key, and 404s an unknown charge", async () => {
    const app = buildServer(KEY, { logger: false });
    const charge = (await app.inject({ method: "POST", url: "/charges", payload: card, headers: auth })).json();
    const headers = { ...auth, "idempotency-key": "wf-1-2" };
    const payload = { charge_id: charge.id, amount: 1999 };
    const refund = await app.inject({ method: "POST", url: "/refunds", payload, headers });
    expect(refund.statusCode).toBe(201);
    expect(refund.json()).toMatchObject({ status: "succeeded", charge_id: charge.id, amount: 1999 });
    expect(refund.json().id).toMatch(/^re_/);
    const again = await app.inject({ method: "POST", url: "/refunds", payload, headers });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual(refund.json());
    const missing = await app.inject({ method: "POST", url: "/refunds", payload: { charge_id: "ch_demo_0001", amount: 1 }, headers: auth });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: "charge_not_found" });
  });
});
