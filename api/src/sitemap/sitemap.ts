import { Hono } from "hono";
import type { AppEnv } from "../app-env";
import type { LatestAddress } from "../storage/storage";

/** The site's own pages a search engine should index. The contribute flow needs a sign-in. */
const pages = ["/", "/search", "/terms", "/privacy", "/security"] as const;

// Crawlers fetch the sitemap rarely; an hour keeps a new listing from waiting long.
const sitemapCacheControl = "public, max-age=3600";

const escapeXml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const entry = (loc: string, lastmod?: Date) =>
  `  <url><loc>${escapeXml(loc)}</loc>${
    lastmod === undefined
      ? ""
      : `<lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>`
  }</url>`;

const listingPath = ({ handle, name, version }: LatestAddress) =>
  `/${encodeURIComponent(handle)}/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;

/**
 * The sitemap, mounted at /sitemap.xml: the site's pages, then each listing at its highest
 * version. Addresses are absolute, on the origin the request came to.
 */
export const sitemap = new Hono<AppEnv>().get("/", async (c) => {
  const origin = new URL(c.req.url).origin;
  const addresses = await c.var.storage.listLatestAddresses();
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...pages.map((path) => entry(`${origin}${path}`)),
    ...addresses.map((address) =>
      entry(`${origin}${listingPath(address)}`, address.publishedAt),
    ),
    "</urlset>",
    "",
  ].join("\n");
  c.header("Cache-Control", sitemapCacheControl);
  return c.body(body, 200, {
    "Content-Type": "application/xml; charset=utf-8",
  });
});
