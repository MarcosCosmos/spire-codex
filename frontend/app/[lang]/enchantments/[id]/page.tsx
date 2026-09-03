import type { Metadata } from "next";
import EnchantmentDetail from "@/app/enchantments/[id]/EnchantmentDetail";
import { stripTags } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { isValidLang, LANG_HREFLANG, type LangCode } from "@/lib/languages";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { imageUrl } from "@/lib/image-url";
import { cardsForEnchantment } from "@/lib/card-enchantments";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ lang: string; id: string }> };

export { generateMetadata } from "@/app/enchantments/[id]/page";

export default async function Page({ params }: Props) {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return null;
  const langCode = lang as LangCode;
  const enchantmentCards = cardsForEnchantment(id);
  let jsonLd = null;
  let data = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/enchantments/${id}?lang=${lang}`);
    if (res.ok) {
      data = await res.json();
      const desc = stripTags(data.description || "");
      const name = data.name || id;
      const detailJsonLd = buildDetailPageJsonLd({
        name, description: desc || name, path: `/${lang}/enchantments/${id}`,
        imageUrl: data.image_url ? imageUrl(data.image_url) : undefined, category: "Enchantment",
        breadcrumbs: [{ name: "Home", href: `/${lang}` }, { name: "Enchantments", href: `/${lang}/enchantments` }, { name, href: `/${lang}/enchantments/${id}` }],
        inLanguage: LANG_HREFLANG[langCode],
      });
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd([
        { question: `What does the ${name} enchantment do in Slay the Spire 2?`, answer: desc || name },
        { question: `Can ${name} be stacked in Slay the Spire 2?`, answer: `${name} is an enchantment in Slay the Spire 2.` },
      ])];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!data) redirectMissingEntity("enchantments", id, lang);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <EnchantmentDetail
        initialEnchantment={data}
        cardIds={enchantmentCards.cardIds}
        totalCards={enchantmentCards.total}
      />
    </>
  );
}
