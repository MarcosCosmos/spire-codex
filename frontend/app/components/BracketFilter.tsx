import Link from "next/link";
import {
  CONTENT_BRACKETS,
  PLAYER_BRACKETS,
  MODE_BRACKETS,
  normalizeBracket,
  splitBracket,
  combineBracket,
  stripVersion,
  type ContentBracket,
} from "@/lib/content-brackets";
import VersionSelectNav from "@/app/components/VersionSelectNav";

/**
 * Bracket pill rows (All / Asc 10 / win-rate tiers, plus player count) for
 * tier-list and other run-derived pages. Server component: each bracket is its
 * own indexable URL. `extraParams` carries the page's other filters
 * (color/pool/sort/act) so switching bracket preserves them; "all" omits the
 * param to keep the canonical URL clean.
 *
 * All three content axes compose (snapshot v27 materializes every
 * player x skill x mode combination, and the version composes onto those), so
 * picking Standard on top of Solo + A10 narrows the slice instead of
 * replacing it.
 */
export default function BracketFilter({
  basePath,
  current,
  extraParams,
}: {
  basePath: string;
  current: string;
  extraParams?: Record<string, string | undefined>;
}) {
  const active = normalizeBracket(current);
  const { player, skill, mode, version } = splitBracket(active);

  const hrefFor = (bracketValue: string) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams ?? {})) {
      if (v) params.set(k, v);
    }
    if (bracketValue !== "all") params.set("bracket", bracketValue);
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  };

  const pillCls = (isActive: boolean) =>
    `text-xs px-3 py-1.5 rounded-md border transition-colors ${
      isActive
        ? "bg-[var(--accent-gold)]/10 border-[var(--accent-gold)]/40 text-[var(--accent-gold)]"
        : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]"
    }`;

  const base = stripVersion(active);
  const playerOpts = [{ key: "", label: "All" }, ...PLAYER_BRACKETS];
  const modeOpts = [{ key: "", label: "All" }, ...MODE_BRACKETS];
  return (
    <div className="mb-5 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 text-xs text-[var(--text-muted)]">Bracket</span>
        {CONTENT_BRACKETS.map((b) => {
          const targetSkill = b.key === "all" ? "" : b.key;
          return (
            <Link
              key={b.key}
              href={hrefFor(combineBracket(player, targetSkill, mode, version))}
              className={pillCls(skill === targetSkill)}
            >
              {b.label}
            </Link>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 text-xs text-[var(--text-muted)]">Players</span>
        {playerOpts.map((b) => (
          <Link
            key={b.key || "all"}
            href={hrefFor(combineBracket(b.key, skill, mode, version))}
            className={pillCls(player === b.key)}
          >
            {b.label}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 text-xs text-[var(--text-muted)]">Mode</span>
        {modeOpts.map((m) => (
          <Link
            key={m.key || "all"}
            href={hrefFor(combineBracket(player, skill, m.key, version))}
            className={pillCls(mode === m.key)}
          >
            {m.label}
          </Link>
        ))}
      </div>
      {/* Game version is a third axis: it composes with the player and
          skill selections instead of replacing them. */}
      <VersionSelectNav
        basePath={basePath}
        current={active}
        extraParams={extraParams}
        base={base === "all" ? "" : base}
      />
    </div>
  );
}
