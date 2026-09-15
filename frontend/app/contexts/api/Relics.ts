import { createContext } from "react";
import { CodexApiConfig } from "../ApiConfigContext";
import { useEntitiesEndpoint } from "./endpoint.client";
import { Relic } from "@/lib/api";

export const useRelics = (
  config?: CodexApiConfig,
): Record<string, Relic> | undefined => useEntitiesEndpoint("relics", config);

const RelicsContext = createContext<Record<string, Relic> | undefined>(
  undefined,
);
export default RelicsContext;
