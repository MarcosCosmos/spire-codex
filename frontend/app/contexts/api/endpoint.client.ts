import { CodexApiConfig } from "@/app/contexts/ApiConfigContext";
import { cachedFetch } from "@/lib/fetch-cache";
import { useChannel } from "@/lib/use-lang-prefix";
import { useState, useEffect } from "react";
import { API, KnownEntitiesEndpoints } from "./common";

/**
 * For endpoints that expose a list of uniquely IDed entities of a particular type
 * Internally it will try to resolve the API config from ApiConfigContext, but can be overridden e.g. when needed to correctly target data for a specific run (though the targetting is currently limited)
 */
export const useEntitiesEndpoint = <T extends { id: string }>(
  endpoint: KnownEntitiesEndpoints,
  config?: CodexApiConfig,
): Record<string, T> | undefined {
  const payload = useApiEndpoint<T[]>(endpoint, config);
  return (
    payload && Object.fromEntries(payload.map((entry) => [entry.id, entry]))
  );
}

export const useApiEndpoint = <T>(
  endpoint: string,
  config?: CodexApiConfig,
): T | undefined => {
  const [result, setResult] = useState<T>();
  const channel = useChannel(config?.beta);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const payload = await cachedFetch<T>(
        `${API}/api/${endpoint}?channel=${channel}`,
      );
      if (!cancelled) {
        setResult(payload);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint, channel]);
  return result;
};
