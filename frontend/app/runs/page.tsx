import type { Metadata } from "next";
import BrowseRunsClient from "./BrowseRunsClient";
import { getLangOrDefault } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import { buildPageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ lang?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  return buildPageMetadata({
    lang: _lang,
    path: "/runs",
    title: t("Browse Runs", lang),
    description: t("runs_tagline", lang),
    // The run list is the same English game data whatever the locale
    // chrome, and localized variants previously generated a "Duplicate
    // without user-selected canonical" cluster in GSC — this route used
    // to force-redirect /<lang>/runs to /runs to avoid that. Canonical
    // now folds back to the English page instead of a redirect, and the
    // [lang] variant (see app/[lang]/runs/page.tsx) adds noindex on top,
    // so it renders (translated chrome, untranslated data) without being
    // counted as a competing indexable duplicate. Drop both once UI
    // translation coverage makes each locale genuinely distinct.
    offerLanguageAlternatives: false,
  });
}

export default function BrowseRunsPage() {
  return (
    <>
      <BrowseRunsClient />
    </>
  );
}
