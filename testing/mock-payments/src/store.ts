import { randomBytes } from "node:crypto";

// The mock provider's whole state, held in memory. A restart empties it.

export type Charge = { id: string; status: "succeeded"; amount: number; currency: string };
export type Refund = { id: string; status: "succeeded"; charge_id: string; amount: number };

export type Store = {
  /** Creates a charge, or returns the one already made with this idempotency key. */
  charge(key: string | undefined, fields: { amount: number; currency: string }): { charge: Charge; replayed: boolean };
  getCharge(id: string): Charge | undefined;
  /** Creates a refund, or returns the one already made with this idempotency key. */
  refund(key: string | undefined, fields: { charge_id: string; amount: number }): { refund: Refund; replayed: boolean };
};

export function createStore(): Store {
  const charges = new Map<string, Charge>();
  const refunds = new Map<string, Refund>();
  // Idempotency keys are scoped per resource, so a charge key never replays a refund.
  const chargeKeys = new Map<string, Charge>();
  const refundKeys = new Map<string, Refund>();

  return {
    charge(key, fields) {
      const existing = key === undefined ? undefined : chargeKeys.get(key);
      if (existing) return { charge: existing, replayed: true };
      const charge: Charge = { id: newId("ch"), status: "succeeded", amount: fields.amount, currency: fields.currency };
      charges.set(charge.id, charge);
      if (key !== undefined) chargeKeys.set(key, charge);
      return { charge, replayed: false };
    },

    getCharge(id) {
      return charges.get(id);
    },

    refund(key, fields) {
      const existing = key === undefined ? undefined : refundKeys.get(key);
      if (existing) return { refund: existing, replayed: true };
      const refund: Refund = { id: newId("re"), status: "succeeded", charge_id: fields.charge_id, amount: fields.amount };
      refunds.set(refund.id, refund);
      if (key !== undefined) refundKeys.set(key, refund);
      return { refund, replayed: false };
    },
  };
}

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}
