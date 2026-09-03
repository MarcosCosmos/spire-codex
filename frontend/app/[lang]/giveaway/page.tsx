import { isValidLang } from "@/lib/languages";
import GiveawayClient from "@/app/giveaway/GiveawayClient";

export { generateMetadata } from "@/app/giveaway/page";

export default async function LangGiveawayPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  return <GiveawayClient />;
}
