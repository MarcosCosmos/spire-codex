import { createContext } from "react";
import { CodexApiConfig } from "../ApiConfigContext";
import { useEntitiesEndpoint } from "./endpoint.client";
import { Card } from "@/lib/api";

export const useCards = (
  config?: CodexApiConfig,
): Record<string, Card> | undefined => useEntitiesEndpoint("cards", config);

const CardsContext = createContext<Record<string, Card> | undefined>(undefined);
export default CardsContext;
