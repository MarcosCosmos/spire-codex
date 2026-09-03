import type { Metadata } from "next";
import BrowseRunsClient from "@/app/runs/BrowseRunsClient";
import { langOrDefault } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import { SITE_URL } from "@/lib/seo";

type Props = { params: Promise<{ lang?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang } = await params;
  const lang = langOrDefault(_lang);
  const title = `${t("Browse Runs", lang)} - Slay the Spire 2 (sts2) | Spire Codex`;
  const description = t("runs_tagline", lang);
  return {
    title,
    description,
    // No hreflang alternates: the run list is the same English game data
    // regardless of locale chrome (same reasoning as /runs/<hash>), so
    // localized variants /<lang>/runs read to Google as near-duplicates
    // of the canonical /runs. That was generating "Duplicate without
    // user-selected canonical" pages in GSC before this collapsed to a
    // blanket redirect; restoring translated chrome here still canonicals
    // back to /runs rather than self-canonicalizing per locale.
    alternates: { canonical: `${SITE_URL}/runs` },
  };
}

export default async function BrowseRunsPage() {
  return <BrowseRunsClient />;
}
