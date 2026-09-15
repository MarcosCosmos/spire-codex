import { createContext } from "react";
import { CodexApiConfig } from "../ApiConfigContext";
import { useApiEndpointIdMapped } from "./endpoint.client";
import { Card } from "@/lib/api";

export const useCards = (
  config?: CodexApiConfig,
): Record<string, Card> | undefined => useApiEndpointIdMapped("cards", config);

const CardsContext = createContext<Record<string, Card> | undefined>(undefined);
export default CardsContext;
