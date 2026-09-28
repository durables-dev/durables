import { Context } from "@temporalio/activity";
import { ApplicationFailure } from "@temporalio/common";

export interface CaptureChargeInput {
  chargeId: string;
  amountCents: number;
}

export interface CaptureChargeResult {
  chargeId: string;
  status: string;
}

export async function captureCharge(input: CaptureChargeInput): Promise<CaptureChargeResult> {
  const { workflowExecution, activityId } = Context.current().info;
  // The same key on every retry of this activity, so a retried capture is not captured twice.
  const idempotencyKey = `${workflowExecution?.workflowId}-${activityId}`;
  const url = `${process.env.MOCK_PAYMENTS_URL}/charges/${encodeURIComponent(input.chargeId)}/capture`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MOCK_PAYMENTS_API_KEY}`,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ amount: input.amountCents }),
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status === 409) {
    throw ApplicationFailure.nonRetryable(`Charge ${input.chargeId} cannot be captured`, "ChargeNotCapturable");
  }
  if (!response.ok) {
    throw new Error(`The payments API answered ${response.status}`);
  }

  const charge = (await response.json()) as { id: string; status: string };
  return { chargeId: charge.id, status: charge.status };
}
