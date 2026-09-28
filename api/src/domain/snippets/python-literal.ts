// Converts a JSON value to Python source: null → None, true → True, and so on.

export function toPythonLiteral(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "None";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(toPythonLiteral).join(", ")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}: ${toPythonLiteral(item)}`).join(", ")}}`;
  }
  return JSON.stringify(String(value));
}
