/**
 * The root namespaces of PHP's own extensions that declare namespaced classes, such as
 * `Random\Randomizer`, `PgSql\Connection` and `Dom\HTMLDocument`. Taken from the PHP manual's
 * class and namespace reference for PHP 8.1 to 8.5, compared without regard to case, as PHP
 * compares namespaces.
 */
export const phpBuiltinNamespaces: ReadonlySet<string> = new Set([
  "dom",
  "ffi",
  "ftp",
  "imap",
  "ldap",
  "odbc",
  "pdo",
  "pgsql",
  "pspell",
  "random",
  "soap",
  "uri",
]);

/**
 * Whether a name a PHP `use` imports, as written there, such as `DateTimeImmutable` or
 * `Stripe\StripeClient`, is part of PHP itself rather than a Composer package.
 *
 * It is a rule plus a short list. A name in the global namespace, with no namespace
 * separator, is PHP's own: Composer packages declare their classes, functions and constants in
 * a namespace. A name under one of PHP's own extension namespaces is PHP's too.
 */
export const isPhpBuiltin = (name: string) => {
  const path = name.replace(/^\\/, "");
  const separator = path.indexOf("\\");
  if (separator === -1) {
    return true;
  }
  return phpBuiltinNamespaces.has(path.slice(0, separator).toLowerCase());
};
