import type { CommunityStats } from "./StatsClient";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

// Server-fetch the unfiltered stats payload so the initial HTML carries real
// numbers — Google stamped /leaderboards/stats Soft 404 because the only
// crawlable content was the client "Loading..." state. 5-min data cache; the
// client refetches live data on mount either way, so a failure here just
// falls back to the old client-only behaviour.
export async function fetchInitialStats(): Promise<CommunityStats | null> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/runs/stats`, {
      next: { revalidate: 300 },
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
