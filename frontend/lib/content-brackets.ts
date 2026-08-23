// Content brackets: the skill/quality filter shown on tier lists and other
// run-derived content. "All" and "Asc 10" map to existing run brackets; the
// win-rate tiers are an A10-gated quality ladder (A10 runs from players above
// that overall win rate). Keep the keys in sync with _BRACKET_KEYS in
// backend/app/services/run_entity_stats.py.
export interface ContentBracket {
  key: string;
  param: string | null; // value sent as ?bracket= to the API; null = all runs
  label: string;
}

export const CONTENT_BRACKETS: ContentBracket[] = [
  { key: "all", param: null, label: "All" },
  { key: "a10", param: "a10", label: "A10" },
  { key: "wr30", param: "wr30", label: "A10 >30% WR" },
  { key: "wr50", param: "wr50", label: "A10 >50% WR" },
  { key: "wr75", param: "wr75", label: "A10 >75% WR" },
];

// Exact player-count brackets. A separate axis from the content/skill brackets
// above (they share the single ?bracket= slot, so they're mutually exclusive),
// kept out of CONTENT_BRACKETS so the content-bracket pill rows and charts don't
// render them. Keys match _run_extra_brackets in run_entity_stats.py.
export const PLAYER_BRACKETS: ContentBracket[] = [
  { key: "solo", param: "solo", label: "Solo" },
  { key: "2p", param: "2p", label: "2P" },
  { key: "3p", param: "3p", label: "3P" },
  { key: "4p", param: "4p", label: "4P" },
];

// Game-mode brackets: a third composing axis (snapshot v27). Picking a mode
// narrows the player/skill selection rather than replacing it. "All" is the
// absence of a mode key.
export const MODE_BRACKETS: ContentBracket[] = [
  { key: "standard", param: "standard", label: "Standard" },
  { key: "daily", param: "daily", label: "Daily" },
  { key: "custom", param: "custom", label: "Custom" },
];

// Both axes are valid ?bracket= values, so normalizeBracket must recognize them.
const _BY_KEY = new Map(
  [...CONTENT_BRACKETS, ...PLAYER_BRACKETS, ...MODE_BRACKETS].map((b) => [b.key, b]),
);

const _PLAYER_KEYS = new Set(PLAYER_BRACKETS.map((b) => b.key));
const _SKILL_KEYS = new Set(
  CONTENT_BRACKETS.filter((b) => b.key !== "all").map((b) => b.key),
);
const _MODE_KEYS = new Set(MODE_BRACKETS.map((b) => b.key));

export interface BracketAxes {
  player: string;
  skill: string;
  mode: string;
  version: string;
}

/** Classify each colon-separated segment onto its axis. Unknown segments
 * make the whole value invalid (callers fall back to "all"). Order-tolerant
 * on the way in; canonical on the way out. */
function parseAxes(raw: string): BracketAxes | null {
  const axes: BracketAxes = { player: "", skill: "", mode: "", version: "" };
  for (const part of raw.split(":")) {
    if (_PLAYER_KEYS.has(part)) axes.player = part;
    else if (_SKILL_KEYS.has(part)) axes.skill = part;
    else if (_MODE_KEYS.has(part)) axes.mode = part;
    else if (isVersionBracket(part)) axes.version = part;
    else if (part !== "all") return null;
  }
  return axes;
}

/**
 * A game-version bracket ("v0.107.1"): the snapshot keeps a per-version
 * slice for every release version, both standalone and composed onto any
 * other bracket key ("solo:wr50:v0.107.1"), so versions combine with the
 * player and skill axes everywhere.
 */
export function isVersionBracket(raw: string | undefined | null): boolean {
  return !!raw && /^v\d+(\.\d+)*$/.test(raw);
}

/** The bracket value minus any trailing version segment ("" for a bare
 * version or "all"). */
export function stripVersion(raw: string | undefined | null): string {
  const { player, skill, mode } = splitBracket(raw);
  const base = combineBracket(player, skill, mode);
  return base === "all" ? "" : base;
}

/**
 * A "player:skill" composite (e.g. "solo:wr50") combines a player-count bracket
 * with a content/skill bracket. Only the entity cache (tier list + metrics)
 * materializes these, so BracketFilter offers them only in composite mode.
 */
export function isCompositeBracket(raw: string | undefined | null): boolean {
  if (!raw || !raw.includes(":")) return false;
  const axes = parseAxes(raw);
  if (!axes) return false;
  // Two or more content axes selected (version alone doesn't count).
  return [axes.player, axes.skill, axes.mode].filter(Boolean).length >= 2;
}

/** Split a bracket value into its player + skill + version axes. A single
 * bracket maps to whichever axis owns it; "all"/unknown gives all empty. */
export function splitBracket(raw: string | undefined | null): BracketAxes {
  const b = normalizeBracket(raw);
  if (b === "all") return { player: "", skill: "", mode: "", version: "" };
  return parseAxes(b) ?? { player: "", skill: "", mode: "", version: "" };
}

/** Combine player + skill + version selections into one ?bracket= value.
 * Any subset works: the axes compose in canonical player:skill:version
 * order, and all-empty collapses to "all". */
export function combineBracket(
  player: string,
  skill: string,
  mode = "",
  version = "",
): string {
  return [player, skill, mode, version].filter(Boolean).join(":") || "all";
}

/** Normalize a raw ?bracket= value to a known bracket key, a player:skill
 * composite, a game version, or any of those with a trailing version
 * ("all" if unknown). */
export function normalizeBracket(raw: string | undefined | null): string {
  if (!raw) return "all";
  const axes = parseAxes(raw);
  if (!axes) return "all";
  return combineBracket(axes.player, axes.skill, axes.mode, axes.version);
}

/** The ?bracket= API value for a bracket key (null = all runs, no param). A
 * composite passes through unchanged (its API value is the composite itself). */
export function bracketParam(key: string | undefined | null): string | null {
  // The normalized key IS the API value for everything except "all".
  const n = normalizeBracket(key);
  return n === "all" ? null : n;
}

/**
 * /api/runs/list filters for a bracket, for the run-browse table (which has no
 * precomputed brackets and filters per run instead). Mirrors the bracket
 * definition: the win-rate tiers are A10-gated, so they pin ascension_min=10
 * and add a per-submitter winrate floor (0-100). "All" sends nothing.
 */
export function bracketListParams(key: string | undefined | null): {
  ascension_min?: number;
  winrate_min?: number;
} {
  // Only the skill axis maps to list filters; a composed player/version
  // segment rides on its own params (players= / build_id=) at the callers.
  switch (splitBracket(key).skill || normalizeBracket(key)) {
    case "a10":
      return { ascension_min: 10 };
    case "wr30":
      return { ascension_min: 10, winrate_min: 30 };
    case "wr50":
      return { ascension_min: 10, winrate_min: 50 };
    case "wr75":
      return { ascension_min: 10, winrate_min: 75 };
    default:
      return {};
  }
}
