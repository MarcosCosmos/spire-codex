import { createContext } from "react";
import { CodexApiConfig } from "../ApiConfigContext";
import { useApiEndpointIdMapped } from "./endpoint.client";
import { Potion } from "@/lib/api";

export const usePotions = (
  config?: CodexApiConfig,
): Record<string, Potion> | undefined =>
  useApiEndpointIdMapped("potions", config);

const PotionsContext = createContext<Record<string, Potion> | undefined>(
  undefined,
);

export default PotionsContext;
