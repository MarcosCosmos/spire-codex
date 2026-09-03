import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    path: "/changelog",
    title: "Changelog - Update History",
    description: "Slay the Spire 2 update history and Spire Codex changelog. Track game patches, balance changes, and new content additions.",
  });
}

export default function Layout({ children }: { children: React.ReactNode }) {
  // Client-rendered changelog page, emit JSON-LD from the server
  // layout so the structured data appears in initial HTML for crawlers.
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Changelog", href: "/changelog" },
    ]),
    buildCollectionPageJsonLd({
      name: "Spire Codex Changelog",
      description:
        "Slay the Spire 2 update history and Spire Codex changelog, patches, balance changes, and new content additions.",
      path: "/changelog",
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      {children}
    </>
  );
}
