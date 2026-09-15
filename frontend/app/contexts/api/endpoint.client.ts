"use client";
import { CodexApiConfig } from "@/app/contexts/ApiConfigContext";
import { cachedFetch } from "@/lib/fetch-cache";
import { useChannel } from "@/lib/use-lang-prefix";
import { useState, useEffect } from "react";
import { API, KnownIdMappableEndpoints } from "./common";
import { useGameLocale } from "@/lib/i18n";

/**
 * For endpoints that expose a list of uniquely IDed entities of a particular type
 * Internally it will try to resolve the API config from ApiConfigContext, but can be overridden e.g. when needed to correctly target data for a specific run (though the targetting is currently limited)
 * Note: it doesn't cache to a state at the mapped value level because in principle react compiler will observe it not being updated and memo that, so the internal state should be enough
 */
export const useApiEndpointIdMapped = <T extends { id: string }>(
  endpoint: KnownIdMappableEndpoints,
  config?: CodexApiConfig,
  enabled?: boolean,
): Record<string, T> | undefined => {
  const payload = useApiEndpoint<T[]>(endpoint, config, enabled);
  return (
    payload && Object.fromEntries(payload.map((entry) => [entry.id, entry]))
  );
};

export const useApiEndpoint = <T>(
  endpoint: string,
  config?: CodexApiConfig,
  enabled: boolean = true,
): T | undefined => {
  const [result, setResult] = useState<T>();
  const channel = useChannel(config?.beta);
  const lang = useGameLocale();
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    (async () => {
      const payload = await cachedFetch<T>(
        `${API}/api/${endpoint}?lang=${lang}&channel=${channel}`,
      );
      if (!cancelled) {
        setResult(payload);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint, lang, channel, enabled]);
  return result;
};
