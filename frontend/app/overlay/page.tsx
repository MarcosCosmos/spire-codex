import OverlayBody from "./OverlayBody";
import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    path: "/overlay",
    title: "Overwolf Overlay",
    description: "Spire Codex Overlay, the Overwolf companion for Slay the Spire 2 (sts2). In-game card, relic, and monster lookups plus one-click run uploads.",
  });
}

export default function OverlayPage() {
  return <OverlayBody lang="eng" />;
}
