import { useEntitiesEndpoint } from "./endpoint.client";
import { CodexApiConfig } from "../ApiConfigContext";
import { createContext } from "react";
import { Enchantment } from "@/lib/api";

export const useEnchantments = (
  config?: CodexApiConfig,
): Record<string, Enchantment> | undefined =>
  useEntitiesEndpoint("enchantments", config);

const EnchantmentsContext = createContext<
  Record<string, Enchantment> | undefined
>(undefined);

export default EnchantmentsContext;
