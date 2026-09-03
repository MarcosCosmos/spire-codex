import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { isValidLang } from "@/lib/languages";
import GiveawayClient from "./GiveawayClient";

/** Shared with app/[lang]/giveaway/page.tsx, which re-exports this directly. */
export async function generateMetadata(
  { params }: { params?: Promise<{ lang?: string }> } = {},
): Promise<Metadata> {
  const lang = (await params)?.lang;
  if (lang && !isValidLang(lang)) return {};
  return buildPageMetadata({
    lang,
    path: "/giveaway",
    title: "Shadowbox Giveaway",
    description:
      "Enter to win a Slay the Spire 2 shadowbox. Sign in with Steam, get the mod, and upload a run. No purchase necessary. US residents only. July 7 to August 7, 2026.",
  });
}

export default function GiveawayPage() {
  return <GiveawayClient />;
}
