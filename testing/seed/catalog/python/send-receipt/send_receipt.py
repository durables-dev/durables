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
class SendReceiptInput:
    charge_id: str
    email: str


@dataclass
class SendReceiptResult:
    receipt_id: str


def _post_receipt(input: SendReceiptInput) -> dict:
    charge = urllib.parse.quote(input.charge_id)
    url = os.environ["MOCK_PAYMENTS_URL"].rstrip("/") + "/charges/" + charge + "/receipts"
    body = json.dumps({"email": input.email}).encode("utf-8")
    request = urllib.request.Request(url, data=body, method="POST")
    request.add_header("Content-Type", "application/json")
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


@activity.defn(name="send_receipt")
async def send_receipt(input: SendReceiptInput) -> SendReceiptResult:
    # Each attempt emails a new receipt: a retry after a timeout can send the customer a second one.
    receipt = await asyncio.to_thread(_post_receipt, input)
    return SendReceiptResult(receipt_id=receipt["id"])
