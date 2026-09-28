import asyncio
import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass

from temporalio import activity
from temporalio.exceptions import ApplicationError


@dataclass
class CreateChargeInput:
    amount_cents: int
    currency: str
    card_number: str


@dataclass
class CreateChargeResult:
    charge_id: str
    status: str


def _post_charge(input: CreateChargeInput) -> dict:
    url = os.environ["MOCK_PAYMENTS_URL"].rstrip("/") + "/charges"
    body = json.dumps(
        {
            "amount": input.amount_cents,
            "currency": input.currency,
            "card_number": input.card_number,
        }
    ).encode("utf-8")
    request = urllib.request.Request(url, data=body, method="POST")
    request.add_header("Content-Type", "application/json")
    request.add_header("Authorization", "Bearer " + os.environ["MOCK_PAYMENTS_API_KEY"])
    # No idempotency key is sent, so every attempt creates a new charge.
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        if error.code == 402:
            raise ApplicationError(
                "Card declined",
                type="CardDeclined",
                non_retryable=True,
            )
        raise


@activity.defn(name="create_charge")
async def create_charge(input: CreateChargeInput) -> CreateChargeResult:
    charge = await asyncio.to_thread(_post_charge, input)
    return CreateChargeResult(charge_id=charge["id"], status=charge["status"])
