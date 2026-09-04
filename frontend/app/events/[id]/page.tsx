import type { Metadata } from "next";
import EventDetail from "./EventDetail";
import { fetchEventVotes } from "@/lib/event-votes";
import { stripTags, stripTagsFlat, clipMetaDescription, buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_GAME_NAME, LANG_HREFLANG, isValidLang } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { imageUrl } from "@/lib/image-url";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ lang?: string; id: string }> };

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, lang } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/events/${id}${lang ? `?lang=${lang}` : ""}`);
    if (!res.ok) return { title: "Event Not Found" };
    const entity = await res.json();
    const desc = stripTagsFlat(entity.description || "");
    const name = entity.name || entity.title || id;
    const gameName = LANG_GAME_NAME[getLangOrDefault(lang)];
    const title = `${name} - Event`;
    const meta = buildPageMetadata({
      lang,
      path: `/events/${id}`,
      title,
      description: clipMetaDescription(
        `${gameName} ${entity.type} event${entity.act ? ` (${entity.act})` : ""}, ${name}${desc ? `: ${desc}` : ""}`,
      ),
      ogType: "article",
    });
    return {
      ...meta,
      openGraph: {
        ...meta.openGraph,
        images: entity.image_url ? [{ url: imageUrl(entity.image_url) }] : undefined,
      },
    };
  } catch {
    return { title: "Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id, lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const prefix = langPrefix(_lang);
  let jsonLd = null;
  let event = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/events/${id}${_lang ? `?lang=${_lang}` : ""}`);
    if (res.ok) {
      event = await res.json();
      const desc = stripTags(event.description || "");
      const name = event.name || event.title || id;
      const detailJsonLd = buildDetailPageJsonLd({
        name,
        description: desc || `${name} event from Slay the Spire 2`,
        path: `${prefix}/events/${id}`,
        imageUrl: event.image_url ? imageUrl(event.image_url) : undefined,
        category: "Event",
        breadcrumbs: [
          { name: t("Home", lang), href: prefix || "/" },
          { name: t("Events", lang), href: `${prefix}/events` },
          { name, href: `${prefix}/events/${id}` },
        ],
        inLanguage: LANG_HREFLANG[lang],
      });
      const faqQuestions = [
        { question: `What happens in the ${name} event in Slay the Spire 2?`, answer: desc || `${name} is an event in Slay the Spire 2.` },
        { question: `What type of event is ${name}?`, answer: `${name} is a ${event.type} event${event.act ? ` found in ${event.act}` : ""}.` },
      ];
      if (event.options?.length) {
        faqQuestions.push({ question: `What choices does ${name} offer?`, answer: `${name} offers ${event.options.length} choice(s): ${event.options.map((o: { title: string }) => o.title).join(", ")}.` });
      }
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!event) redirectMissingEntity("events", id, _lang);
  // Server-render the community choice distribution (unique, crawlable data).
  const voteStats = event ? await fetchEventVotes(id) : null;
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <EventDetail initialEvent={event} voteStats={voteStats} />
    </>
  );
}
