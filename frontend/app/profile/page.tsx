import type { Metadata } from "next";
import ProfileClient from "./ProfileClient";
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
    path: "/profile",
    title: t("Profile", lang),
    description: "View your runs, upload run files, and see your personal stats.",
    offerLanguageAlternatives: false,
    noindex: true,
  });
}

export default function ProfilePage() {
  return <ProfileClient />;
}
