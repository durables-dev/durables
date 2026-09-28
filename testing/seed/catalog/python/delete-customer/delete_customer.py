import asyncio
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

from temporalio import activity


@dataclass
class DeleteCustomerInput:
    customer_id: str


@dataclass
class DeleteCustomerResult:
    customer_id: str
    already_deleted: bool


def _delete_customer(input: DeleteCustomerInput) -> bool:
    url = os.environ["MOCK_PAYMENTS_URL"].rstrip("/") + "/customers/" + urllib.parse.quote(input.customer_id)
    request = urllib.request.Request(url, method="DELETE")
    request.add_header("Authorization", "Bearer " + os.environ["MOCK_PAYMENTS_API_KEY"])
    try:
        with urllib.request.urlopen(request, timeout=10):
            return False
    except urllib.error.HTTPError as error:
        if error.code == 404:
            # Already gone, for example deleted by an earlier attempt that timed out: treat it as done.
            return True
        raise


@activity.defn(name="delete_customer")
async def delete_customer(input: DeleteCustomerInput) -> DeleteCustomerResult:
    already_deleted = await asyncio.to_thread(_delete_customer, input)
    return DeleteCustomerResult(customer_id=input.customer_id, already_deleted=already_deleted)
