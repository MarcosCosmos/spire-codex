import { Suspense } from "react";
import type { Encounter } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import EncountersClient from "./EncountersClient";
import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { api } from "@/lib/api";

export async function generateMetadata(): Promise<Metadata> {
  let count = "87";
  try {
    const stats = await api.getStatsBounded();
    count = String(stats.encounters);
  } catch {
    // Fall back to the baseline count if the API is unreachable at build time.
  }
  return buildPageMetadata({
    path: "/encounters",
    title: "Encounters - All Combat Encounters",
    description: `All ${count} Slay the Spire 2 (sts2) encounters, normal fights, elites, and bosses. Monster compositions, act placement, and room types.`,
  });
}

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default async function EncountersPage() {
  let encounters: Encounter[] = [];
  try {
    const res = await fetch(`${API}/api/encounters?lang=eng`, { next: { revalidate: 300 } });
    if (res.ok) encounters = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Encounters", href: "/encounters" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Encounters",
      description: "Browse every combat encounter in Slay the Spire 2.",
      path: "/encounters",
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Slay the Spire 2 (sts2) Encounters</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Browse every combat encounter in Slay the Spire 2. Filter by room type (Monster, Elite, Boss) and act to find specific fights and monster compositions.
      </p>

      <RecentlyAdded entityType="encounters" label="Encounter" pathPrefix="/encounters" />

      <Suspense>
        <EncountersClient initialEncounters={encounters} />
      </Suspense>
    </div>
  );
}
