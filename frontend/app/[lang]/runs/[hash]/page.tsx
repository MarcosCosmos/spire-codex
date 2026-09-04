import type { Metadata } from "next";
import {
  generateMetadata as baseGenerateMetadata,
  default as SharedRunPage,
} from "@/app/runs/[hash]/page";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ lang?: string; hash: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const meta = await baseGenerateMetadata(props);
  return { ...meta, robots: { index: false, follow: false } };
}

export default SharedRunPage;
