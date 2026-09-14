"use client";

import { usePathname } from "next/navigation";
import { LANG_PREFIXES } from "./languages";
import { useContext } from "react";
import { ApiConfigContext } from "@/app/contexts/ApiConfigContext";

export function inBeta(pathname: string): boolean {
  const parts = pathname.split("/");
  return (
    parts[1] === "beta" || (LANG_PREFIXES.has(parts[1]) && parts[2] === "beta")
  );
}

/** "beta" when the current path sits in the beta section
 *  (/beta/... or /<lang>/beta/...), else "stable". */
export function useChannel(beta?: boolean): "beta" | "stable" {
  const apiConfig = useContext(ApiConfigContext);
  return (beta ?? apiConfig.beta) ? "beta" : "stable";
}

/**
 * "/beta" inside the beta section, "" elsewhere. Prefix same-section hrefs
 * with it so navigation stays in beta; the locale prefix is added by the
 * Link from @/i18n/navigation, never by hand.
 */
export function useBetaPrefix(beta?: boolean): string {
  const apiConfig = useContext(ApiConfigContext);
  return (beta ?? apiConfig.beta) ? "/beta" : "";
}
