import AboutPage from "@/app/about/page";
import { isValidLang } from "@/lib/languages";

export { generateMetadata } from "@/app/about/layout";

export default async function LangAboutPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;

  return <AboutPage />;
}
