import asyncio
import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass

from temporalio import activity
from temporalio.exceptions import ApplicationError


@dataclass
class RefundChargeInput:
    charge_id: str
    amount_cents: int


@dataclass
class RefundChargeResult:
    refund_id: str
    status: str


def _post_refund(input: RefundChargeInput, idempotency_key: str) -> dict:
    url = os.environ["MOCK_PAYMENTS_URL"].rstrip("/") + "/refunds"
    body = json.dumps(
        {
            "charge_id": input.charge_id,
            "amount": input.amount_cents,
        }
    ).encode("utf-8")
    request = urllib.request.Request(url, data=body, method="POST")
    request.add_header("Content-Type", "application/json")
    request.add_header("Authorization", "Bearer " + os.environ["MOCK_PAYMENTS_API_KEY"])
    request.add_header("Idempotency-Key", idempotency_key)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        if error.code == 404:
            raise ApplicationError(
                "Charge not found",
                type="ChargeNotFound",
                non_retryable=True,
            )
        raise


@activity.defn(name="refund_charge")
async def refund_charge(input: RefundChargeInput) -> RefundChargeResult:
    info = activity.info()
    # The same key on every retry of this activity, so a retried refund is not refunded twice.
    idempotency_key = f"{info.workflow_id}-{info.activity_id}"
    refund = await asyncio.to_thread(_post_refund, input, idempotency_key)
    return RefundChargeResult(refund_id=refund["id"], status=refund["status"])
