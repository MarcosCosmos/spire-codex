import type { Metadata } from "next";
import LiveClient from "@/app/live/LiveClient";
import { getLangOrDefault } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

type Props = { params: Promise<{ lang?: string }> };

// noindex, like the base route: this is an internal tool, so it needs no
// canonical or hreflang wiring — only the title is localized.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  return {
    title: t("Live", lang),
    robots: { index: false, follow: false },
  };
}

export default function LivePage() {
  return <LiveClient />;
}
