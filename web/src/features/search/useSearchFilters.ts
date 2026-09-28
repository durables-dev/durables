import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import type { ActivitySearchFilters, SearchSdk } from "../../api/types";

const SDKS: readonly SearchSdk[] = ["python", "typescript", "dotnet"];

/**
 * The filters, kept in the page's query string under api's own parameter names
 * (`sdk`, `idempotent`, `hasCompensation`), so the page survives a reload.
 */
export function useSearchFilters(): [ActivitySearchFilters, (filters: ActivitySearchFilters) => void] {
  const [params, setParams] = useSearchParams();
  const sdk = params.get("sdk");
  const idempotent = params.get("idempotent") === "true";
  const hasCompensation = params.get("hasCompensation") === "true";

  const filters = useMemo<ActivitySearchFilters>(
    () => ({
      ...(sdk && (SDKS as readonly string[]).includes(sdk) ? { sdk: sdk as SearchSdk } : {}),
      ...(idempotent ? { idempotent: true as const } : {}),
      ...(hasCompensation ? { hasCompensation: true as const } : {}),
    }),
    [sdk, idempotent, hasCompensation],
  );

  const setFilters = useCallback(
    (next: ActivitySearchFilters) => {
      const query = new URLSearchParams();
      if (next.sdk) query.set("sdk", next.sdk);
      if (next.idempotent) query.set("idempotent", "true");
      if (next.hasCompensation) query.set("hasCompensation", "true");
      setParams(query, { replace: true });
    },
    [setParams],
  );

  return [filters, setFilters];
}
