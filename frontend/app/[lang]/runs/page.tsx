import type { Metadata } from "next";
import {
  generateMetadata as baseGenerateMetadata,
  default as BrowseRunsPage,
} from "@/app/runs/page";

type Props = { params: Promise<{ lang?: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const meta = await baseGenerateMetadata(props);
  return { ...meta, robots: { index: false, follow: false } };
}

export default BrowseRunsPage;
