// Party runs fan out to one leaderboard row per player, so boards that
// don't filter to players=single show the same run once per member.
// Collapse by (run_time, submitted_at), which party members share.
export function dedupePartyRows<
  T extends { run_time: number; submitted_at: string },
>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = `${r.run_time}|${r.submitted_at}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
