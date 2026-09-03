import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/jsonld";
import SubmitRunClient from "@/app/leaderboards/submit/SubmitRunClient";
import { isValidLang } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

export const dynamic = "force-dynamic";

export { generateMetadata } from "@/app/leaderboards/submit/page";

export default async function LangSubmitRunPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  const jsonLd = buildBreadcrumbJsonLd([
    { name: t("Home", lang), href: `/${lang}` },
    { name: t("Leaderboards", lang), href: `/${lang}/leaderboards` },
    { name: t("Submit a Run", lang), href: `/${lang}/leaderboards/submit` },
  ]);
  return (
    <>
      <JsonLd data={jsonLd} />
      <SubmitRunClient />
    </>
  );
}
