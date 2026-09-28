import asyncio
import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass

from temporalio import activity
from temporalio.exceptions import ApplicationError


@dataclass
class CreateCustomerInput:
    email: str
    name: str


@dataclass
class CreateCustomerResult:
    customer_id: str


def _post_customer(input: CreateCustomerInput, idempotency_key: str) -> dict:
    url = os.environ["MOCK_PAYMENTS_URL"].rstrip("/") + "/customers"
    body = json.dumps({"email": input.email, "name": input.name}).encode("utf-8")
    request = urllib.request.Request(url, data=body, method="POST")
    request.add_header("Content-Type", "application/json")
    request.add_header("Authorization", "Bearer " + os.environ["MOCK_PAYMENTS_API_KEY"])
    request.add_header("Idempotency-Key", idempotency_key)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        if error.code == 422:
            raise ApplicationError(
                "Invalid customer details",
                type="InvalidCustomer",
                non_retryable=True,
            )
        raise


@activity.defn(name="create_customer")
async def create_customer(input: CreateCustomerInput) -> CreateCustomerResult:
    info = activity.info()
    # The same key on every retry of this activity, so a retry returns the customer already created.
    idempotency_key = f"{info.workflow_id}-{info.activity_id}"
    customer = await asyncio.to_thread(_post_customer, input, idempotency_key)
    return CreateCustomerResult(customer_id=customer["id"])
