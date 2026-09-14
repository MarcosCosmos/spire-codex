import { useListEndpoint } from "./common";
import { CodexApiConfig } from "../ApiConfigContext";
import { createContext } from "react";

export interface EnchantmentData {
  card_type: string | null;
  is_stackable: boolean;
  image_url: string | null;
}
export const useEnchantments = (
  config?: CodexApiConfig,
): Record<string, EnchantmentData> | undefined =>
  useListEndpoint("enchantments", config);

const EnchantmentsContext = createContext<
  Record<string, EnchantmentData> | undefined
>(undefined);

export default EnchantmentsContext;
