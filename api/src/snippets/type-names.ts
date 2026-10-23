// Reading the names a generated file must import to use a detected type, such as
// `ChargeRequest` in `list[ChargeRequest] | None`.

/**
 * The first part of each name in a type, in order and each once, leaving out the language's
 * own types. `models` is the part of `models.ChargeRequest` that has to be imported.
 *
 * `identifier` must be global and match a name only where it starts, never after a dot.
 */
export const importedNames = (
  type: string | null,
  identifier: RegExp,
  builtIn: ReadonlySet<string>,
) =>
  unique(type === null ? [] : (type.match(identifier) ?? [])).filter(
    (name) => !builtIn.has(name),
  );

/** The names each once, keeping the first of each. */
export const unique = (names: readonly string[]) => [...new Set(names)];

/** The names sorted by code unit, so capitals come first, as Python's isort orders them. */
export const sortedNames = (names: readonly string[]) =>
  [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
