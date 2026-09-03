import type { Metadata } from "next";
import EventDetail from "./EventDetail";
import { fetchEventVotes } from "@/lib/event-votes";
import { stripTags, stripTagsFlat, clipMetaDescription, buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_GAME_NAME, isValidLang } from "@/lib/languages";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { imageUrl } from "@/lib/image-url";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ lang?: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, lang } = await params;
  if (lang && !isValidLang(lang)) return {};
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
  const { id } = await params;
  let jsonLd = null;
  let event = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/events/${id}`);
    if (res.ok) {
      event = await res.json();
      const desc = stripTags(event.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: event.name,
        description: desc || `${event.name} event from Slay the Spire 2`,
        path: `/events/${id}`,
        imageUrl: event.image_url ? imageUrl(event.image_url) : undefined,
        category: "Event",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Events", href: "/events" },
          { name: event.name, href: `/events/${id}` },
        ],
      });
      const faqQuestions = [
        { question: `What happens in the ${event.name} event in Slay the Spire 2?`, answer: desc || `${event.name} is an event in Slay the Spire 2.` },
        { question: `What type of event is ${event.name}?`, answer: `${event.name} is a ${event.type} event${event.act ? ` found in ${event.act}` : ""}.` },
      ];
      if (event.options?.length) {
        faqQuestions.push({ question: `What choices does ${event.name} offer?`, answer: `${event.name} offers ${event.options.length} choice(s): ${event.options.map((o: { title: string }) => o.title).join(", ")}.` });
      }
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!event) redirectMissingEntity("events", id);
  // Server-render the community choice distribution (unique, crawlable data).
  const voteStats = event ? await fetchEventVotes(id) : null;
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <EventDetail initialEvent={event} voteStats={voteStats} />
    </>
  );
}
