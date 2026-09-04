import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";

/** Shared with app/[lang]/images/layout.tsx, which re-exports this directly. */
export async function generateMetadata(
  { params }: { params?: Promise<{ lang?: string }> } = {},
): Promise<Metadata> {
  const lang = (await params)?.lang;
  return buildPageMetadata({
    lang,
    path: "/images",
    title: t("Images", getLangOrDefault(lang)),
    description: "Browse and download Slay the Spire 2 game assets, card portraits, relic icons, monster sprites, character art, and more.",
  });
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Images", href: "/images" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Images & Game Art",
      description:
        "Browse and download Slay the Spire 2 game assets, card portraits, relic icons, monster sprites, character art, and more.",
      path: "/images",
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      {children}
    </>
  );
}
