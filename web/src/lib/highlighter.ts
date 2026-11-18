import type { HighlighterCore, LanguageInput } from "shiki/core";

// Syntax highlighting for every code block (web/CONVENTIONS.md, Code display): Shiki core
// with the JavaScript regex engine. Shiki and each grammar load on first use, so a page
// without code never downloads them.

/**
 * The languages Durables highlights, named as the SDK catalog's `highlightLanguage` names them.
 * Anything else is shown as plain text.
 */
export type CodeLanguage =
  "python" | "typescript" | "csharp" | "go" | "java" | "ruby" | "php" | "rust";

/** One coloured run of text. `color` is a `var(--code-token-*)` reference to a token. */
export interface HighlightedToken {
  content: string;
  color?: string;
}

export type GrammarLoader = () => Promise<LanguageInput>;

const defaultGrammars: Record<CodeLanguage, GrammarLoader> = {
  python: () => import("shiki/langs/python.mjs"),
  typescript: () => import("shiki/langs/typescript.mjs"),
  csharp: () => import("shiki/langs/csharp.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  java: () => import("shiki/langs/java.mjs"),
  ruby: () => import("shiki/langs/ruby.mjs"),
  php: () => import("shiki/langs/php.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
};

const THEME = "durables";

// The theme's colours are CSS variables, defined as tokens in src/styles/tokens.css.
const FOREGROUND = "var(--code-foreground)";

export interface Highlighter {
  /** Starts loading `language` if it has not started. Resolves false if loading failed. */
  load: (language: CodeLanguage) => Promise<boolean>;
  /** Whether `language` has loaded and `highlight` can colour it. */
  isLoaded: (language: CodeLanguage) => boolean;
  /**
   * Splits `code` into coloured tokens, one array per line. Returns undefined until
   * `language` has loaded. A token without `color` is in the foreground colour.
   */
  highlight: (
    code: string,
    language: CodeLanguage,
  ) => HighlightedToken[][] | undefined;
}

const isCodeLanguage = (key: string): key is CodeLanguage =>
  Object.hasOwn(defaultGrammars, key);

/** Reads a language name and returns it when Durables highlights it. */
export function codeLanguage(
  name: string | undefined,
): CodeLanguage | undefined {
  const key = name?.toLowerCase();
  return key !== undefined && isCodeLanguage(key) ? key : undefined;
}

async function createCore(): Promise<HighlighterCore> {
  const [{ createHighlighterCore, createCssVariablesTheme }, engine] =
    await Promise.all([
      import("shiki/core"),
      import("shiki/engine/javascript"),
    ]);
  return createHighlighterCore({
    themes: [
      createCssVariablesTheme({
        name: THEME,
        variablePrefix: "--code-",
        variableDefaults: {},
        fontStyle: false,
      }),
    ],
    langs: [],
    engine: engine.createJavaScriptRegexEngine(),
  });
}

/**
 * Creates a highlighter. The app shares one (`highlighter`, below). Tests create their
 * own so each starts with nothing loaded.
 */
export function createHighlighter(
  grammars: Record<CodeLanguage, GrammarLoader> = defaultGrammars,
): Highlighter {
  let core: Promise<HighlighterCore> | undefined;
  let loadedCore: HighlighterCore | undefined;
  const loading = new Map<CodeLanguage, Promise<boolean>>();
  const loaded = new Set<CodeLanguage>();

  async function loadLanguage(language: CodeLanguage): Promise<boolean> {
    try {
      core ??= createCore();
      const [instance, grammar] = await Promise.all([
        core,
        grammars[language](),
      ]);
      await instance.loadLanguage(grammar);
      loadedCore = instance;
      loaded.add(language);
      return true;
    } catch {
      // A failed download leaves the code readable as plain text.
      return false;
    }
  }

  return {
    load(language) {
      let pending = loading.get(language);
      if (!pending) {
        pending = loadLanguage(language);
        loading.set(language, pending);
      }
      return pending;
    },
    isLoaded: (language) => loaded.has(language),
    highlight(code, language) {
      if (!loadedCore || !loaded.has(language)) {
        return undefined;
      }
      const { tokens } = loadedCore.codeToTokens(code, {
        lang: language,
        theme: THEME,
      });
      return tokens.map((line) =>
        line.map(({ content, color }) =>
          color && color !== FOREGROUND ? { content, color } : { content },
        ),
      );
    },
  };
}

/** The app's one highlighter. */
export const highlighter = createHighlighter();
