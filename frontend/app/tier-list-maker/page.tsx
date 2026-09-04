import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import TierListHome from "./TierListHome";

type Props = { params: Promise<{ lang?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  return buildPageMetadata({
    lang,
    path: "/tier-list-maker",
    title: "Tier List Maker",
    description:
      "Build and share Slay the Spire 2 tier lists. Drag and drop cards, relics, potions, and monsters into custom tiers.",
  });
}

export default function Page() {
  return <TierListHome />;
}
