import { afterEach, describe, expect, test, vi } from "vitest";
import { finalizeDueDeletions } from "./final-deletion";

// The job's own logic, with the storage replaced by a stand-in that records what it is asked.
// final-deletion.integration.test.ts runs the same job against real local D1.

const now = new Date("2030-06-01T03:00:00Z");

/** A storage stand-in: the given accounts are due, and finalizing one runs `finalize`. */
const storageWith = (
  due: string[],
  finalize: (accountId: string) => Promise<boolean> = () =>
    Promise.resolve(true),
) => ({
  listAccountsDueForFinalDeletion: vi.fn<
    (requestedAtOrBefore: Date) => Promise<string[]>
  >(() => Promise.resolve(due)),
  finalizeAccountDeletion: vi.fn(finalize),
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("finalizeDueDeletions", () => {
  test("asks for the deletions requested 30 days or more before the run", async () => {
    const storage = storageWith([]);

    await finalizeDueDeletions(storage, now);

    expect(storage.listAccountsDueForFinalDeletion).toHaveBeenCalledWith(
      new Date("2030-05-02T03:00:00Z"),
    );
  });

  test("finalizes each due account through the shared final-deletion step", async () => {
    const storage = storageWith(["account-a", "account-b"]);

    const run = await finalizeDueDeletions(storage, now);

    expect(storage.finalizeAccountDeletion.mock.calls).toEqual([
      ["account-a"],
      ["account-b"],
    ]);
    expect(run).toEqual({ finalized: ["account-a", "account-b"], failed: [] });
  });

  test("does nothing when no account is due", async () => {
    const storage = storageWith([]);

    const run = await finalizeDueDeletions(storage, now);

    expect(storage.finalizeAccountDeletion).not.toHaveBeenCalled();
    expect(run).toEqual({ finalized: [], failed: [] });
  });

  test("a failure on one account does not stop the others, and is logged", async () => {
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const storage = storageWith(
      ["account-a", "account-b", "account-c"],
      (accountId) =>
        accountId === "account-b"
          ? Promise.reject(new Error("D1_ERROR: database is locked"))
          : Promise.resolve(true),
    );

    const run = await finalizeDueDeletions(storage, now);

    expect(storage.finalizeAccountDeletion).toHaveBeenCalledTimes(3);
    expect(run).toEqual({
      finalized: ["account-a", "account-c"],
      failed: ["account-b"],
    });
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith({
      message: "Final deletion failed for an account",
      runAt: now.toISOString(),
      accountId: "account-b",
      error: { name: "Error", message: "D1_ERROR: database is locked" },
    });
  });

  test("does not count an account the final-deletion step left unchanged", async () => {
    // Restored between listing and finalizing: the shared step refuses it and writes nothing.
    const storage = storageWith(["account-a"], () => Promise.resolve(false));

    const run = await finalizeDueDeletions(storage, now);

    expect(run).toEqual({ finalized: [], failed: [] });
  });
});
