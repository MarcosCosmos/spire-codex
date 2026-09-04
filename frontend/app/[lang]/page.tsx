import { SUPPORTED_LANGS } from "@/lib/languages";

export { generateMetadata, default } from "@/app/page";

export function generateStaticParams() {
  return SUPPORTED_LANGS.map((lang) => ({ lang }));
}

// Redeclared rather than re-exported: Next only accepts a statically
// analyzable literal for route segment config. ISR, not force-dynamic:
// rendering this tree per request cost ~1.2s of server time on every
// localized home hit (the English home, prerendered, serves in ~50ms).
// The data fetches were already cached at 300s; now the page itself
// prerenders for all 13 languages and revalidates on the same clock, so
// freshness is unchanged and the render cost is paid once per window
// instead of per visitor. The canonical route revalidates at 60s instead
// since it has no static-param prerender to amortize the cost over.
export const revalidate = 300;
