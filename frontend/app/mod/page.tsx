import ModBody from "./ModBody";
import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    path: "/mod",
    title: "Steam Workshop Mod",
    description: "The Spire Codex mod for Slay the Spire 2 (sts2), installed from the Steam Workshop. Automatic run uploads, post-run community insights in game, ancient pick tips, and a route planner.",
  });
}

export default function ModPage() {
  return <ModBody lang="eng" />;
}
