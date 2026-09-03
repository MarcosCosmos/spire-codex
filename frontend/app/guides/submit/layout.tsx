import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    path: "/guides/submit",
    title: "Submit a Guide",
    description: "Submit a community strategy guide for Slay the Spire 2 (sts2). Share character guides, boss strategies, and deck-building tips with the Spire Codex community.",
  });
}

export default function GuideSubmitLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
