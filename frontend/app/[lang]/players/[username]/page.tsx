import type { Metadata } from "next";
import {
  generateMetadata as baseGenerateMetadata,
  default as PlayerPage,
} from "@/app/players/[username]/page";

type Props = { params: Promise<{ lang?: string; username: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const meta = await baseGenerateMetadata(props);
  return { ...meta, robots: { index: false, follow: false } };
}

export default PlayerPage;
