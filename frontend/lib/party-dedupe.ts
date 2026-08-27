// Party runs fan out to one leaderboard row per player, so boards that
// don't filter to players=single show the same run once per member.
// Collapse by (run_time, submitted_at truncated to the second): siblings
// are written milliseconds apart in one submit, so exact timestamps
// differ but the second doesn't.
export function dedupePartyRows<
  T extends { run_time: number; submitted_at: string },
>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = `${r.run_time}|${(r.submitted_at || "").slice(0, 19)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
