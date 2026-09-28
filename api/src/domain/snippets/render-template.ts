// The in-house placeholder filler for snippet templates. Placeholders are {{name}}.
//
// Two layout rules keep generated files tidy:
// - A placeholder alone on its line, filled with "", removes the whole line.
// - A multi-line value placed alone on its line keeps that line's indentation
//   on every line.

const PLACEHOLDER = /\{\{(\w+)\}\}/g;
const ALONE = /^([ \t]*)\{\{(\w+)\}\}[ \t]*$/;

export function renderTemplate(template: string, values: Record<string, string>): string {
  const value = (key: string): string => {
    if (!(key in values)) throw new Error(`Template placeholder {{${key}}} has no value`);
    return values[key];
  };

  const out: string[] = [];
  for (const line of template.split("\n")) {
    const alone = ALONE.exec(line);
    if (alone) {
      const [, indent, key] = alone;
      const filled = value(key);
      if (filled === "") continue;
      out.push(...filled.split("\n").map((part) => (part === "" ? "" : indent + part)));
    } else {
      out.push(line.replace(PLACEHOLDER, (_, key: string) => value(key)));
    }
  }
  return out.join("\n");
}
