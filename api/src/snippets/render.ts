// Fills in a snippet template (api/CONVENTIONS.md, src/snippets/). Templates are plain text
// with {{name}} placeholders. A placeholder alone on its line is a block: its value is indented
// to match the placeholder, and an empty value removes the line. Any other placeholder is
// replaced in place and takes a single line.

/** Values for a template's placeholders, by name. */
export type TemplateValues = Readonly<Record<string, string>>;

/** A placeholder, such as `{{activity}}`. Group 1 is its name. */
const placeholder = /\{\{(\w+)\}\}/g;

/** A line holding nothing but a placeholder. Group 1 is the indentation, group 2 the name. */
const blockLine = /^([ \t]*)\{\{(\w+)\}\}[ \t]*$/;

const valueFor = (values: TemplateValues, name: string) => {
  const value = values[name];
  if (value === undefined) {
    throw new Error(`The snippet template needs a value for {{${name}}}`);
  }
  return value;
};

const renderLine = (line: string, values: TemplateValues): string[] => {
  const block = blockLine.exec(line);
  if (block !== null) {
    const [, indent = "", name = ""] = block;
    const value = valueFor(values, name);
    return value === ""
      ? []
      : value
          .split("\n")
          .map((valueLine) => (valueLine === "" ? "" : indent + valueLine));
  }
  return [
    line.replace(placeholder, (_, name: string) => {
      const value = valueFor(values, name);
      if (value.includes("\n")) {
        throw new Error(`{{${name}}} sits inside a line and takes one line`);
      }
      return value;
    }),
  ];
};

/**
 * The template with every placeholder filled in. The template's final line break is dropped,
 * so a snippet never ends with an empty line. Throws when a placeholder has no value.
 */
export const render = (template: string, values: TemplateValues) =>
  template
    .replace(/\r?\n$/, "")
    .split(/\r?\n/)
    .flatMap((line) => renderLine(line, values))
    .join("\n");
