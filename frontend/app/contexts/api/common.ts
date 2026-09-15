export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";
export type KnownIdMappableEndpoints =
  | "cards"
  | "relics"
  | "potions"
  | "enchantments"
  | "events"
  | "powers"
  | "orbs"
  | "acts"
  | "modifiers"
  | "monsters"
  | "encounters";
