import { getChannel } from "@/lib/getLangPrefix";
import { CodexApiConfig } from "../ApiConfigContext";
import { API_INTERNAL, KnownEntitiesEndpoints } from "./common";

/**
 * For endpoints that expose a list of uniquely IDed entities of a particular type
 * Internally it will try to resolve the API config from ApiConfigContext, but can be overridden e.g. when needed to correctly target data for a specific run (though the targetting is currently limited)
 */
export const getEntitiesEndpoint = async <T extends { id: string }>(
  endpoint: KnownEntitiesEndpoints,
  config?: CodexApiConfig,
): Promise<Record<string, T> | undefined> => {
  const payload = await getApiEndpoint<T[]>(endpoint, config);
  return (
    payload && Object.fromEntries(payload.map((entry) => [entry.id, entry]))
  );
};

export const getApiEndpoint = async <T>(
  endpoint: string,
  config?: CodexApiConfig,
): Promise<T | undefined> => {
  const channel = getChannel(config?.beta ?? false);
  const res = await fetch(`${API_INTERNAL}/api/${endpoint}?channel=${channel}`);
  return res.ok ? ((await res.json()) as T) : undefined;
};
