import { getApiEndpoint } from "../endpoint.server";
import { RawRun, Run } from "./types";
import { cleanRun } from "./util";

async function getRun(hash: string): Promise<Run | undefined> {
  try {
    const raw = await getApiEndpoint<RawRun>(`runs/shared/${hash}`);
    return raw && cleanRun(raw);
  } catch {
    return;
  }
}
