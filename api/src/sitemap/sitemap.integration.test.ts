import { env, exports } from "cloudflare:workers";
import { expect, test } from "vitest";
import { seedAccount, seedListing, seedVersion } from "../storage/seed";

// The sitemap over HTTP, against real local D1. Other tests' rows stay, so each assertion
// looks only for the addresses this test wrote.

const seedActivity = async (versions: { version: string; at: string }[]) => {
  const { handle } = await seedAccount(env.DB);
  const name = `activity-${crypto.randomUUID().slice(0, 8)}`;
  await seedListing(env.DB, { handle, name });
  for (const { version, at } of versions) {
    await seedVersion(env.DB, {
      handle,
      name,
      version,
      title: "Charge card",
      sdk: "Python",
      integrations: ["Stripe"],
      publishedAt: new Date(at),
    });
  }
  return { handle, name };
};

const fetchSitemap = () =>
  exports.default.fetch("https://durables.dev/sitemap.xml");

test("answers XML that crawlers may cache for an hour", async () => {
  const response = await fetchSitemap();

  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe(
    "application/xml; charset=utf-8",
  );
  expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
  const body = await response.text();
  expect(body).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset /);
  expect(body.trimEnd()).toMatch(/<\/urlset>$/);
});

test("lists the site's pages on the request's origin, and not the contribute flow", async () => {
  const body = await (await fetchSitemap()).text();

  for (const path of ["/", "/search", "/terms", "/privacy", "/security"]) {
    expect(body).toContain(`<url><loc>https://durables.dev${path}</loc></url>`);
  }
  expect(body).not.toContain("/contribute");
});

test("lists each listing once, at its highest version number, dated by that version", async () => {
  const { handle, name } = await seedActivity([
    { version: "1.2.0", at: "2026-03-01T00:00:00Z" },
    { version: "1.10.0", at: "2026-02-01T00:00:00Z" },
    { version: "1.9.3", at: "2026-04-01T00:00:00Z" },
  ]);

  const body = await (await fetchSitemap()).text();

  expect(body).toContain(
    `<url><loc>https://durables.dev/${handle}/${name}@1.10.0</loc><lastmod>2026-02-01</lastmod></url>`,
  );
  expect(body.split(`/${handle}/${name}@`)).toHaveLength(2);
});
