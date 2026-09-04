import type { Metadata } from "next";
import {
  generateMetadata as baseGenerateMetadata,
  default as GuideDetailPage,
} from "@/app/guides/[slug]/page";

type Props = { params: Promise<{ lang?: string; slug: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const meta = await baseGenerateMetadata(props);
  return { ...meta, robots: { index: false, follow: false } };
}

export default GuideDetailPage;
