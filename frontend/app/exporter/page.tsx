import ExporterBody from "./ExporterBody";
import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    path: "/exporter",
    title: "Art Exporter",
    description: "The Spire Codex Art Exporter for Slay the Spire 2 (sts2), free on the Steam Workshop. It renders card art at every upgrade level, characters and monsters, animations, backgrounds, and full texture dumps straight from the running game.",
  });
}

export default function ExporterPage() {
  return <ExporterBody lang="eng" />;
}
