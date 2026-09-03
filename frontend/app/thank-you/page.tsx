import ThankYouBody from "./ThankYouBody";
import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    path: "/thank-you",
    title: "Thank You",
    description: "Thanks to the Spire Codex community, Ko-fi supporters, contributors, bug reporters, and everyone who's helped grow this Slay the Spire 2 project.",
  });
}

export default function ThankYouPage() {
  return <ThankYouBody lang="eng" />;
}
