export { generateMetadata, default } from "@/app/leaderboards/page";

// Redeclared rather than re-exported: Next only accepts a statically
// analyzable literal for route segment config. Keep in sync with the
// canonical module this re-exports.
export const dynamic = "force-dynamic";
