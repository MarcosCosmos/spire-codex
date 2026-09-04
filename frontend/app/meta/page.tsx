import { redirect } from "next/navigation";
import { isValidLang } from "@/lib/languages";

type Props = { params: Promise<{ lang?: string }> };

// Redirects to the stats page. Keep the language prefix so non-English
// visitors land on the localized stats view instead of the canonical
// English one.
export default async function MetaPage({ params }: Props) {
  const { lang } = await params;
  redirect(lang && isValidLang(lang) ? `/${lang}/leaderboards/stats` : "/leaderboards/stats");
}
