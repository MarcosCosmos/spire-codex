import { createContext } from "react";
import { CodexApiConfig } from "../ApiConfigContext";
import { useApiEndpointIdMapped } from "./endpoint.client";
import { Relic } from "@/lib/api";

export const useRelics = (
  config?: CodexApiConfig,
): Record<string, Relic> | undefined =>
  useApiEndpointIdMapped("relics", config);

const RelicsContext = createContext<Record<string, Relic> | undefined>(
  undefined,
);
export default RelicsContext;
