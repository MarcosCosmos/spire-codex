import KnowledgeDemonBody from "./KnowledgeDemonBody";
import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    path: "/knowledge-demon",
    title: "Discord Bot - Knowledge Demon",
    description: "Knowledge Demon, a Discord bot for Slay the Spire 2 (sts2) communities. Slash commands for cards, relics, monsters, events, plus moderation and news feeds.",
  });
}

export default function KnowledgeDemonPage() {
  return <KnowledgeDemonBody lang="eng" />;
}
