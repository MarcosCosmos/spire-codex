import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    path: "/images",
    title: "Images - Game Art & Assets",
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
