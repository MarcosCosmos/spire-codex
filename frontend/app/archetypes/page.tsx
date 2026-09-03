import {
  generateMetadata,
  default as ArchetypesPage,
} from "@/app/[lang]/archetypes/page";

// Redeclared rather than re-exported: Next only accepts a statically
// analyzable literal for route segment config. Keep in sync with the
// [lang] module this re-exports.
export const revalidate = 600;

export { generateMetadata };
export default ArchetypesPage;
