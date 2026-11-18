// The words of the Delete your account dialog that depend on the owner.

/** The first bullet: how many listed activities leave search. */
export function listedActivitiesLeaveSearch(listedCount: number): string {
  return listedCount === 1
    ? "Your 1 listed activity leaves search."
    : `Your ${String(listedCount)} listed activities leave search.`;
}

/** Whether the confirmation field holds the handle exactly: same case, nothing around it. */
export function confirmsHandle(typed: string, handle: string): boolean {
  return typed === handle;
}
