import asyncio
import json
import os
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Optional

from temporalio import activity


@dataclass
class ExportChargesInput:
    created_after: str
    page_size: int


@dataclass
class ExportChargesResult:
    charge_ids: list[str]


def _get_page(input: ExportChargesInput, cursor: Optional[str]) -> dict:
    query = {"created_after": input.created_after, "limit": str(input.page_size)}
    if cursor:
        query["starting_after"] = cursor
    url = os.environ["MOCK_PAYMENTS_URL"].rstrip("/") + "/charges?" + urllib.parse.urlencode(query)
    request = urllib.request.Request(url, method="GET")
    request.add_header("Authorization", "Bearer " + os.environ["MOCK_PAYMENTS_API_KEY"])
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read())


@activity.defn(name="export_charges")
async def export_charges(input: ExportChargesInput) -> ExportChargesResult:
    # A retry resumes from the last heartbeat: the cursor and the IDs collected so far.
    details = activity.info().heartbeat_details
    cursor: Optional[str] = details[0] if details else None
    charge_ids: list[str] = list(details[1]) if details else []
    while True:
        page = await asyncio.to_thread(_get_page, input, cursor)
        charge_ids.extend(charge["id"] for charge in page["data"])
        if not page["has_more"]:
            return ExportChargesResult(charge_ids=charge_ids)
        cursor = page["data"][-1]["id"]
        activity.heartbeat(cursor, charge_ids)
