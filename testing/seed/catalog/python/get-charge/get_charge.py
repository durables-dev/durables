import asyncio
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

from temporalio import activity
from temporalio.exceptions import ApplicationError


@dataclass
class GetChargeInput:
    charge_id: str


@dataclass
class GetChargeResult:
    charge_id: str
    amount_cents: int
    currency: str
    status: str


def _get_charge(input: GetChargeInput) -> dict:
    url = os.environ["MOCK_PAYMENTS_URL"].rstrip("/") + "/charges/" + urllib.parse.quote(input.charge_id)
    request = urllib.request.Request(url, method="GET")
    request.add_header("Authorization", "Bearer " + os.environ["MOCK_PAYMENTS_API_KEY"])
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


@activity.defn(name="get_charge")
async def get_charge(input: GetChargeInput) -> GetChargeResult:
    charge = await asyncio.to_thread(_get_charge, input)
    return GetChargeResult(
        charge_id=charge["id"],
        amount_cents=charge["amount"],
        currency=charge["currency"],
        status=charge["status"],
    )
