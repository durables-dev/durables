import type { FastifyPluginAsync } from "fastify";
import type { ActivitySearchFilters, SearchSdk } from "../model/search.js";
import { searchActivities } from "../services/search.js";

type SearchQuery = { sdk?: string; idempotent?: string; hasCompensation?: string };

export const searchRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: SearchQuery }>("/search/activities", async (request) => {
    return searchActivities(filtersFromQuery(request.query));
  });
};

/**
 * Each parameter is optional. An empty `sdk` is unset. A checkbox filter is set
 * only by `true`.
 */
// Parameters aren't validated: an unknown sdk is passed through and matches nothing.
// POC-SHORTCUT: SC-016
function filtersFromQuery(query: SearchQuery): ActivitySearchFilters {
  return {
    ...(query.sdk ? { sdk: query.sdk as SearchSdk } : {}),
    ...(query.idempotent === "true" ? { idempotent: true as const } : {}),
    ...(query.hasCompensation === "true" ? { hasCompensation: true as const } : {}),
  };
}
