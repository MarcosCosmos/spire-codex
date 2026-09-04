import type { Metadata } from "next";
import SettingsClient from "./SettingsClient";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ lang?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  return buildPageMetadata({
    lang: _lang,
    path: "/settings",
    title: t("Settings", lang),
    description: "Manage your display name, email, and connected accounts.",
    offerLanguageAlternatives: false,
    noindex: true,
  });
}

export default function SettingsPage() {
  return <SettingsClient />;
}
