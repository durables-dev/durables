import type { NamedLineRef } from "../checks/facts";

// Shell text for the install and run commands, which a developer pastes into a POSIX shell.

/** A word the shell reads as itself, with nothing to expand or split. */
const plainShellWord = /^[A-Za-z0-9@%+=:,./_-]+$/;

/** A name the shell accepts for an environment variable. */
const shellVariableName = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The word as the shell should be given it: as is when plain, single-quoted otherwise. */
export const shellWord = (word: string) =>
  plainShellWord.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`;

/**
 * One line per environment variable the activity reads, in the order detection found them. A
 * name the shell can't export, such as one holding `$`, gets a comment asking for it instead.
 */
export const environmentLines = (
  configurationRead: readonly Pick<NamedLineRef, "name">[],
) =>
  configurationRead
    .map(({ name }) =>
      shellVariableName.test(name)
        ? `export ${name}=...`
        : `# Also set the environment variable ${name.replace(/\s/g, " ")}.`,
    )
    .join("\n");
