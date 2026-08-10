"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Chart as ChartJS,
  BarElement,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler,
  type ChartOptions,
} from "chart.js";
import { Chart } from "react-chartjs-2";
import { cachedFetch } from "@/lib/fetch-cache";
import { CDN_BASE, fullCardUrl, imageUrl } from "@/lib/image-url";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";

ChartJS.register(BarElement, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const GRID = "rgba(140,140,150,0.14)";
const TICK = "#8b8b93";

const MODE_COLORS: Record<string, string> = {
  solo: "#e8b830",
  coop: "#3873a9",
  daily: "#23935b",
  custom: "#6b5b8a",
};

const REST_COLORS: Record<string, string> = {
  SMITH: "#e8b830",
  HEAL: "#23935b",
  MEND: "#3aa8a0",
  DIG: "#c5894a",
  CLONE: "#6b5b8a",
  COOK: "#f07c1e",
  LIFT: "#d53b27",
  HATCH: "#3873a9",
  KINDLE: "#bf5a85",
};

interface ComparableRow {
  id: string;
  name?: string;
  label?: string;
  count: number;
  pct: number;
  community_pct?: number | null;
  pct_low_hp?: number;
  community_pct_low_hp?: number | null;
}

interface BoonRow {
  id: string;
  name: string;
  count: number;
  take_rate?: number;
  offered?: number;
  community_take_rate?: number | null;
}

interface CardDelta {
  id: string;
  your_pick_rate: number;
  community_pick_rate: number;
  gap: number;
  offered: number;
  picked: number;
}

interface EventDivergence {
  event_id: string;
  event_name: string | null;
  option_id: string;
  option_label: string | null;
  your_pct: number;
  community_pct: number;
  gap: number;
  visits: number;
}

interface DangerCell {
  visits: number;
  avg_dmg_pct: number;
  death_rate: number;
  community_death_rate?: number | null;
}

interface ActivityWeek {
  week: string;
  runs: number;
  wins: number;
  win_rate: number;
  solo: number;
  coop: number;
  daily: number;
  custom: number;
}

interface CharacterRow {
  id: string;
  name?: string;
  runs: number;
  wins: number;
  win_rate: number;
  share: number;
  community_win_rate?: number | null;
  community_share?: number | null;
}

export interface PersonalBest {
  run_hash: string;
  character: string;
  run_time: number;
  ascension: number;
  floors_reached: number;
}

export interface PersonalBests {
  fastest_solo?: PersonalBest;
  fastest_multi?: PersonalBest;
  highest_ascension?: PersonalBest;
  todays_daily?: PersonalBest;
  fastest_daily?: PersonalBest;
}

export interface DailyEntry {
  run_hash: string;
  username: string | null;
  character: string;
  run_time: number;
  ascension: number;
  is_current_user: boolean;
}

export interface DailyBoard {
  runs: DailyEntry[];
  user_rank: number | null;
  total_today: number;
}

export interface Insights {
  total_runs: number;
  total_wins?: number;
  total_losses?: number;
  win_rate?: number;
  by_character?: CharacterRow[];
  runs_walked: number;
  runs_capped?: boolean;
  deaths?: { encounters?: ComparableRow[]; events?: ComparableRow[] };
  rest_sites?: ComparableRow[];
  ancient_picks?: BoonRow[];
  event_divergence?: EventDivergence[];
  card_picks?: { over_picked: CardDelta[]; under_picked: CardDelta[] };
  map_danger?: { act: number; types: Record<string, DangerCell> }[];
  streaks?: { current_win_streak: number; best_win_streak: number };
  activity?: ActivityWeek[];
  percentiles?: {
    win_rate: number;
    win_rate_percentile: number;
    runs: number;
    runs_percentile: number;
    players: number;
  } | null;
  records?: {
    fastest_win?: { run_time: number; run_hash: string } | null;
    longest_run?: { run_time: number; run_hash: string } | null;
    biggest_deck?: { size: number; run_hash: string } | null;
  };
}

export interface EntityInfo {
  id: string;
  name: string;
  image_url: string | null;
  color?: string | null;
}

const CHARACTER_HEX: Record<string, string> = {
  ironclad: "#d53b27",
  silent: "#23935b",
  defect: "#3873a9",
  necrobinder: "#bf5a85",
  regent: "#f07c1e",
};

const CHARACTERS = ["ironclad", "silent", "defect", "necrobinder", "regent"] as const;

// Scope switcher: All + one chip per character. Selecting re-fetches the
// whole insights payload filtered to that character's runs.
export function CharacterPicker({ value, onChange, lang }: { value: string | null; onChange: (c: string | null) => void; lang: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
          value === null
            ? "border-[var(--accent-gold)] text-[var(--accent-gold)] bg-[var(--accent-gold)]/10"
            : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        }`}
      >
        {t("All", lang)}
      </button>
      {CHARACTERS.map((c) => {
        const hex = CHARACTER_HEX[c];
        const active = value === c.toUpperCase();
        const label = c.charAt(0).toUpperCase() + c.slice(1);
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(active ? null : c.toUpperCase())}
            title={label}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
            style={{
              borderColor: active ? hex : "var(--border-subtle)",
              color: active ? hex : "var(--text-secondary)",
              backgroundColor: active ? `${hex}1a` : "transparent",
            }}
          >
            <img
              src={`${CDN_BASE}/ui/characters/character_icon_${c}.webp`}
              alt={label}
              crossOrigin="anonymous"
              loading="lazy"
              className="w-3.5 h-3.5 object-contain"
            />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Card-pool pill: the character whose pool the card belongs to, so players
// grinding several characters can tell which one a pick-delta is about.
function CharacterPill({ color }: { color: string | null | undefined }) {
  const key = (color || "").toLowerCase();
  const hex = CHARACTER_HEX[key];
  if (!hex) return null;
  const label = key.charAt(0).toUpperCase() + key.slice(1);
  return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 rounded-full border shrink-0"
      style={{ borderColor: hex, backgroundColor: `${hex}26` }}
      title={label}
    >
      <img
        src={`${CDN_BASE}/ui/characters/character_icon_${key}.webp`}
        alt={label}
        crossOrigin="anonymous"
        loading="lazy"
        className="w-3.5 h-3.5 object-contain"
      />
    </span>
  );
}

const DANGER_TYPES = ["monster", "elite", "boss", "unknown"] as const;
const DANGER_LABELS: Record<string, string> = {
  monster: "Monsters",
  elite: "Elites",
  boss: "Bosses",
  unknown: "Unknown rooms",
};

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4">
      <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
}

// The "you vs everyone" primitive: two thin bars on one scale.
function CompareBars({ you, community, lang }: { you: number; community: number | null | undefined; lang: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2">
        <span className="w-16 text-[10px] text-[var(--text-tertiary)]">{t("You", lang)}</span>
        <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-primary)] overflow-hidden">
          <div className="h-full rounded-full bg-[var(--accent-gold)]" style={{ width: `${Math.min(you, 100)}%` }} />
        </div>
        <span className="w-12 text-right text-[10px] tabular-nums text-[var(--text-primary)]">{you}%</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-16 text-[10px] text-[var(--text-tertiary)]">{t("Community", lang)}</span>
        <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-primary)] overflow-hidden">
          <div className="h-full rounded-full bg-[var(--accent-gold)] opacity-40" style={{ width: `${Math.min(community ?? 0, 100)}%` }} />
        </div>
        <span className="w-12 text-right text-[10px] tabular-nums text-[var(--text-tertiary)]">
          {community != null ? `${community}%` : "—"}
        </span>
      </div>
    </div>
  );
}

// Savant-style percentile slider: a track with a positioned, color-coded dot.
function PercentileSlider({ label, valueText, percentile, lang }: { label: string; valueText: string; percentile: number; lang: string }) {
  const hue = Math.round((percentile / 100) * 120); // red 0 → green 120
  const color = `hsl(${hue}, 65%, 52%)`;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="text-[var(--text-primary)] font-medium tabular-nums">{valueText}</span>
      </div>
      <div className="relative h-2 rounded-full bg-[var(--bg-primary)]">
        <div className="absolute inset-y-0 left-0 rounded-full opacity-25" style={{ width: `${percentile}%`, backgroundColor: color }} />
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full border-2 border-[var(--bg-card)] flex items-center justify-center text-[8px] font-bold text-white"
          style={{ left: `${Math.min(Math.max(percentile, 3), 97)}%`, backgroundColor: color }}
        >
          {percentile}
        </div>
      </div>
      <p className="text-[10px] text-[var(--text-muted)]">
        {t("Better than", lang)} {percentile}% {t("of ranked players", lang)}
      </p>
    </div>
  );
}

function GapBadge({ gap }: { gap: number }) {
  const cls = gap > 0 ? "text-green-400" : gap < 0 ? "text-red-400" : "text-[var(--text-muted)]";
  return (
    <span className={`text-xs font-medium tabular-nums ${cls}`}>
      {gap > 0 ? "+" : ""}
      {gap.toFixed(1)}%
    </span>
  );
}

function CardDeltaList({ rows, cards, lang }: { rows: CardDelta[]; cards: Record<string, EntityInfo>; lang: string }) {
  const lp = useLangPrefix();
  if (rows.length === 0) {
    return <p className="text-xs text-[var(--text-muted)]">{t("Not enough data yet.", lang)}</p>;
  }
  return (
    <div className="space-y-1">
      {rows.map((d) => {
        const info = cards[d.id];
        return (
          <Link
            key={d.id}
            href={`${lp}/cards/${d.id.toLowerCase()}`}
            className="flex items-center gap-3 py-1.5 hover:bg-[var(--bg-card-hover)] rounded px-2 -mx-2 transition-colors"
          >
            <span className="flex-shrink-0 w-10 h-[52px] flex items-center justify-center">
              <img
                src={fullCardUrl(d.id.toLowerCase(), false, "stable", lang)}
                alt={info?.name || d.id}
                crossOrigin="anonymous"
                loading="lazy"
                className="max-w-full max-h-full object-contain drop-shadow"
                onError={(e) => {
                  // mad_science has no full render; fall back to the portrait.
                  const el = e.currentTarget;
                  if (info?.image_url && !el.dataset.fellBack) {
                    el.dataset.fellBack = "1";
                    el.src = imageUrl(info.image_url);
                  }
                }}
              />
            </span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="truncate text-sm text-[var(--text-primary)]">{info?.name || d.id.replace(/_/g, " ")}</span>
                <CharacterPill color={info?.color} />
              </span>
              <span className="block text-[10px] text-[var(--text-muted)] tabular-nums">
                {t("You", lang)} {d.your_pick_rate}% · {t("Community", lang)} {d.community_pick_rate}% · {d.picked}/{d.offered} {t("offers", lang)}
              </span>
            </span>
            <GapBadge gap={d.gap} />
          </Link>
        );
      })}
    </div>
  );
}

// Weekly stacked run counts by mode, with the week's win rate as a line on
// the right axis. Weeks are the real cadence of play; months hid too much.
function ActivityChart({ rows, lang }: { rows: ActivityWeek[]; lang: string }) {
  const labels = rows.map((r) => r.week.slice(5));
  const modeKeys = ["solo", "coop", "daily", "custom"] as const;
  const modeLabels: Record<string, string> = {
    solo: t("Solo", lang),
    coop: t("Co-op", lang),
    daily: t("Daily", lang),
    custom: t("Custom", lang),
  };
  const data = {
    labels,
    datasets: [
      ...modeKeys
        .filter((k) => rows.some((r) => r[k] > 0))
        .map((k) => ({
          type: "bar" as const,
          label: modeLabels[k],
          data: rows.map((r) => r[k]),
          backgroundColor: MODE_COLORS[k],
          stack: "runs",
          yAxisID: "y",
          borderRadius: 2,
        })),
      {
        type: "line" as const,
        label: t("Win rate", lang),
        data: rows.map((r) => r.win_rate),
        borderColor: "#e0ddd8",
        backgroundColor: "#e0ddd8",
        yAxisID: "y1",
        tension: 0.3,
        pointRadius: 2.5,
        borderWidth: 1.5,
      },
    ],
  };
  const opts: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) =>
            ctx.dataset.yAxisID === "y1"
              ? `${ctx.dataset.label}: ${ctx.parsed.y}%`
              : `${ctx.dataset.label}: ${ctx.parsed.y}`,
        },
      },
    },
    scales: {
      x: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { color: TICK, font: { size: 9 }, maxRotation: 0, autoSkip: true } },
      y: { stacked: true, position: "left", grid: { color: GRID }, border: { display: false }, ticks: { color: TICK, font: { size: 10 }, precision: 0 } },
      y1: {
        position: "right",
        min: 0,
        max: 100,
        grid: { display: false },
        border: { display: false },
        ticks: { color: TICK, font: { size: 10 }, callback: (v) => `${v}%` },
      },
    },
  };
  return (
    <div>
      <div className="h-48">
        <Chart type="bar" data={data} options={opts} />
      </div>
      <div className="flex flex-wrap gap-3 mt-2">
        {modeKeys
          .filter((k) => rows.some((r) => r[k] > 0))
          .map((k) => (
            <span key={k} className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
              <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: MODE_COLORS[k] }} />
              {modeLabels[k]}
            </span>
          ))}
        <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
          <span className="w-2.5 h-0.5" style={{ background: "#e0ddd8" }} />
          {t("Win rate", lang)}
        </span>
      </div>
    </div>
  );
}

// Compact act x node-type table: your death rate per cell, community's under
// it. Red when you die there more than the community, green when less.
function DangerTable({ rows, lang }: { rows: NonNullable<Insights["map_danger"]>; lang: string }) {
  const acts = rows.filter((a) => Object.values(a.types || {}).some((c) => (c.visits || 0) >= 10));
  if (acts.length === 0) {
    return <p className="text-xs text-[var(--text-muted)]">{t("Not enough data yet.", lang)}</p>;
  }
  const cols = DANGER_TYPES.filter((ty) => acts.some((a) => (a.types?.[ty]?.visits || 0) >= 10));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left font-normal text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] pb-2" />
            {cols.map((ty) => (
              <th key={ty} className="text-right font-normal text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] pb-2 pl-4">
                {t(DANGER_LABELS[ty], lang)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {acts.map((a) => (
            <tr key={a.act} className="border-t border-[var(--border-subtle)]">
              <td className="py-1.5 text-[var(--text-secondary)]">
                {t("Act", lang)} {a.act + 1}
              </td>
              {cols.map((ty) => {
                const cell = a.types?.[ty];
                if (!cell || (cell.visits || 0) < 10) {
                  return (
                    <td key={ty} className="py-1.5 pl-4 text-right text-[var(--text-muted)]">
                      —
                    </td>
                  );
                }
                const comm = cell.community_death_rate;
                const worse = comm != null && cell.death_rate > comm;
                const better = comm != null && cell.death_rate < comm;
                return (
                  <td key={ty} className="py-1.5 pl-4 text-right tabular-nums">
                    <span className={worse ? "text-red-400" : better ? "text-green-400" : "text-[var(--text-primary)]"}>
                      {cell.death_rate}%
                    </span>
                    {comm != null && <span className="block text-[10px] text-[var(--text-muted)]">{comm}%</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// One 100%-stacked campfire distribution bar with per-segment colors.
function RestStack({ rows, pctKey, dim }: { rows: ComparableRow[]; pctKey: "pct" | "pct_low_hp"; dim?: boolean }) {
  return (
    <div className={`flex h-3 rounded-full overflow-hidden bg-[var(--bg-primary)] ${dim ? "opacity-50" : ""}`}>
      {rows.map((r) => {
        const w = pctKey === "pct" ? r.pct : r.pct_low_hp;
        if (!w || w <= 0) return null;
        return <div key={r.id} style={{ width: `${w}%`, background: REST_COLORS[r.id] || "#596068" }} title={`${r.label || r.id}: ${w}%`} />;
      })}
    </div>
  );
}

function RestSection({ mine, lang }: { mine: ComparableRow[]; lang: string }) {
  // Community distribution rebuilt from the community_pct fields riding on
  // the personal rows (same ids, same order).
  const commAll: ComparableRow[] = mine.map((r) => ({ ...r, pct: r.community_pct ?? 0 }));
  const hasLowHp = mine.some((r) => (r.pct_low_hp ?? 0) > 0);
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">{t("All campfire visits", lang)}</p>
        <div className="flex items-center gap-2">
          <span className="w-16 text-[10px] text-[var(--text-tertiary)]">{t("You", lang)}</span>
          <div className="flex-1"><RestStack rows={mine} pctKey="pct" /></div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-16 text-[10px] text-[var(--text-tertiary)]">{t("Community", lang)}</span>
          <div className="flex-1"><RestStack rows={commAll} pctKey="pct" dim /></div>
        </div>
      </div>
      {hasLowHp && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">{t("Arriving below half HP", lang)}</p>
          <div className="flex items-center gap-2">
            <span className="w-16 text-[10px] text-[var(--text-tertiary)]">{t("You", lang)}</span>
            <div className="flex-1"><RestStack rows={mine} pctKey="pct_low_hp" /></div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16 text-[10px] text-[var(--text-tertiary)]">{t("Community", lang)}</span>
            <div className="flex-1">
              <RestStack rows={mine.map((r) => ({ ...r, pct_low_hp: r.community_pct_low_hp ?? 0 }))} pctKey="pct_low_hp" dim />
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        {mine.map((r) => (
          <span key={r.id} className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
            <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: REST_COLORS[r.id] || "#596068" }} />
            {r.label || r.id} {r.pct}%
            <span className="text-[var(--text-tertiary)]">({r.community_pct ?? "—"}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function DeathColumn({ title, rows, lang }: { title: string; rows: ComparableRow[]; lang: string }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">{title}</p>
      <div className="space-y-1.5">
        {rows.map((d) => (
          <div key={d.id} className="flex items-center justify-between text-sm">
            <span className="text-[var(--text-primary)] truncate">{d.name || d.id.replace(/_/g, " ")}</span>
            <span className="text-xs text-[var(--text-tertiary)] tabular-nums shrink-0 ml-2">
              {d.count} · {d.pct}%
              {d.community_pct != null && (
                <span className="text-[var(--text-muted)]"> ({d.community_pct}%)</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function displayCharacter(id: string): string {
  const bare = id.replace(/^CHARACTER\./, "").replace(/_/g, " ").toLowerCase();
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}

function BestTile({ href, value, label, sub, rank }: { href: string; value: string; label: string; sub?: string; rank?: { rank: number; total: number } | null }) {
  return (
    <Link href={href} className="bg-[var(--bg-primary)] rounded-lg p-3 text-center hover:bg-[var(--bg-card-hover)] transition-colors">
      <p className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mt-0.5">{label}</p>
      {(sub || rank) && (
        <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
          {sub}
          {rank?.rank ? (
            <span className="text-[var(--accent-gold)]"> #{rank.rank.toLocaleString()}<span className="text-[var(--text-muted)]"> / {rank.total.toLocaleString()}</span></span>
          ) : null}
        </p>
      )}
    </Link>
  );
}

// The full merged overview+insights layout, shared between the signed-in
// profile tab and the public /players page. `bests`, `personalRanks`, and
// `daily` are self-only extras; the public page simply omits them.
export function InsightsPanels({
  data,
  cards,
  lang,
  bests,
  personalRanks,
  daily,
}: {
  data: Insights;
  cards: Record<string, EntityInfo>;
  lang: string;
  bests?: PersonalBests | null;
  personalRanks?: Record<string, { rank: number; total: number } | null>;
  daily?: DailyBoard | null;
}) {
  const lp = useLangPrefix();
  const deathsEnc = data.deaths?.encounters || [];
  const bosses = deathsEnc.filter((d) => d.id.endsWith("_BOSS")).slice(0, 5);
  const elites = deathsEnc.filter((d) => d.id.endsWith("_ELITE")).slice(0, 5);
  const fights = deathsEnc.filter((d) => !d.id.endsWith("_BOSS") && !d.id.endsWith("_ELITE")).slice(0, 5);
  const restSites = data.rest_sites || [];
  const boons = (data.ancient_picks || [])
    .filter((b) => (b.offered ?? 0) >= 5 && b.take_rate != null)
    .sort((a, b) => Math.abs((b.take_rate! - (b.community_take_rate ?? b.take_rate!))) - Math.abs((a.take_rate! - (a.community_take_rate ?? a.take_rate!))))
    .slice(0, 8);
  const divergence = data.event_divergence || [];
  const records = data.records || {};
  const activity = (data.activity || []).filter((r) => r.runs > 0);
  const pct = data.percentiles;
  const streaks = data.streaks;
  const hasRecords = records.fastest_win || records.longest_run || records.biggest_deck;
  const hasBests = bests && Object.values(bests).some(Boolean);
  const characters = (data.by_character || []).filter((c) => c.runs > 0);
  const losses = data.total_losses ?? (data.total_wins != null ? data.total_runs - data.total_wins : null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          [t("Runs", lang), data.total_runs],
          [t("Wins", lang), data.total_wins ?? 0],
          [t("Losses", lang), losses ?? 0],
          [t("Win rate", lang), `${data.win_rate ?? 0}%`],
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4 text-center">
            <p className="text-2xl font-bold text-[var(--accent-gold)] tabular-nums">{value}</p>
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mt-1">{label}</p>
          </div>
        ))}
      </div>

      {(pct || streaks) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pct && (
            <Section title={t("How you rank", lang)}>
              <div className="space-y-4">
                <PercentileSlider label={t("Win rate", lang)} valueText={`${pct.win_rate}%`} percentile={pct.win_rate_percentile} lang={lang} />
                <PercentileSlider label={t("Runs submitted", lang)} valueText={`${pct.runs}`} percentile={pct.runs_percentile} lang={lang} />
              </div>
            </Section>
          )}
          {streaks && (
            <Section title={t("Streaks", lang)}>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[var(--bg-primary)] rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-[var(--accent-gold)] tabular-nums">{streaks.current_win_streak}</p>
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mt-1">{t("Current win streak", lang)}</p>
                </div>
                <div className="bg-[var(--bg-primary)] rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-[var(--accent-gold)] tabular-nums">{streaks.best_win_streak}</p>
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mt-1">{t("Best win streak", lang)}</p>
                </div>
              </div>
            </Section>
          )}
        </div>
      )}

      {(hasRecords || hasBests) && (
        <Section title={t("Personal Bests", lang)}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {bests?.fastest_solo && (
              <BestTile href={`${lp}/runs/${bests.fastest_solo.run_hash}`} value={formatTime(bests.fastest_solo.run_time)} label={t("Fastest Solo", lang)} sub={`${displayCharacter(bests.fastest_solo.character)} A${bests.fastest_solo.ascension}`} rank={personalRanks?.fastest_solo} />
            )}
            {bests?.fastest_multi && (
              <BestTile href={`${lp}/runs/${bests.fastest_multi.run_hash}`} value={formatTime(bests.fastest_multi.run_time)} label={t("Fastest Co-op", lang)} sub={`${displayCharacter(bests.fastest_multi.character)} A${bests.fastest_multi.ascension}`} rank={personalRanks?.fastest_multi} />
            )}
            {bests?.highest_ascension && (
              <BestTile href={`${lp}/runs/${bests.highest_ascension.run_hash}`} value={`A${bests.highest_ascension.ascension}`} label={t("Highest Ascension", lang)} sub={displayCharacter(bests.highest_ascension.character)} rank={personalRanks?.highest_ascension} />
            )}
            {bests?.fastest_daily && (
              <BestTile href={`${lp}/runs/${bests.fastest_daily.run_hash}`} value={formatTime(bests.fastest_daily.run_time)} label={t("Fastest Daily (All Time)", lang)} sub={displayCharacter(bests.fastest_daily.character)} rank={personalRanks?.fastest_daily} />
            )}
            {!bests?.fastest_solo && records.fastest_win && (
              <BestTile href={`${lp}/runs/${records.fastest_win.run_hash}`} value={formatTime(records.fastest_win.run_time)} label={t("Fastest win", lang)} />
            )}
            {records.longest_run && (
              <BestTile href={`${lp}/runs/${records.longest_run.run_hash}`} value={formatTime(records.longest_run.run_time)} label={t("Longest run", lang)} />
            )}
            {records.biggest_deck && (
              <BestTile href={`${lp}/runs/${records.biggest_deck.run_hash}`} value={`${records.biggest_deck.size} ${t("cards", lang)}`} label={t("Biggest deck", lang)} />
            )}
          </div>
        </Section>
      )}

      {characters.length > 0 && (
        <Section title={t("Characters", lang)}>
          <div className="space-y-3">
            {characters.map((c) => {
              const hex = CHARACTER_HEX[c.id.toLowerCase()] || "var(--text-muted)";
              return (
                <div key={c.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium" style={{ color: hex }}>
                      {c.name || displayCharacter(c.id)}
                    </span>
                    <span className="text-xs text-[var(--text-tertiary)] tabular-nums">
                      {c.runs} {t("runs", lang)} · {c.share}%
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="w-16 text-[10px] text-[var(--text-tertiary)]">{t("You", lang)}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-primary)] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(c.win_rate, 100)}%`, backgroundColor: hex }} />
                      </div>
                      <span className="w-12 text-right text-[10px] tabular-nums text-[var(--text-primary)]">{c.win_rate}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-16 text-[10px] text-[var(--text-tertiary)]">{t("Community", lang)}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-primary)] overflow-hidden">
                        <div className="h-full rounded-full opacity-40" style={{ width: `${Math.min(c.community_win_rate ?? 0, 100)}%`, backgroundColor: hex }} />
                      </div>
                      <span className="w-12 text-right text-[10px] tabular-nums text-[var(--text-tertiary)]">
                        {c.community_win_rate != null ? `${c.community_win_rate}%` : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {daily && daily.runs.length > 0 && (
        <Section title={t("Today's Daily Climb", lang)}>
          <div className="space-y-1">
            {daily.runs.map((entry, i) => (
              <Link
                key={entry.run_hash}
                href={`${lp}/runs/${entry.run_hash}`}
                className={`flex items-center gap-3 text-sm px-2 -mx-2 py-1.5 rounded transition-colors ${
                  entry.is_current_user
                    ? "bg-[var(--accent-gold)]/10 hover:bg-[var(--accent-gold)]/15"
                    : "hover:bg-[var(--bg-card-hover)]"
                }`}
              >
                <span className="w-5 text-right text-xs text-[var(--text-tertiary)] tabular-nums">{i + 1}</span>
                <span className={`flex-1 truncate ${entry.is_current_user ? "text-[var(--accent-gold)] font-medium" : "text-[var(--text-primary)]"}`}>
                  {entry.username || t("Anonymous", lang)}
                </span>
                <span className="text-xs tabular-nums" style={{ color: CHARACTER_HEX[entry.character.toLowerCase()] || "var(--text-tertiary)" }}>
                  {displayCharacter(entry.character)}
                </span>
                <span className="text-xs text-[var(--text-primary)] tabular-nums font-medium">{formatTime(entry.run_time)}</span>
              </Link>
            ))}
            {daily.user_rank != null && daily.user_rank > 10 && (
              <div className="flex items-center gap-3 text-sm px-2 -mx-2 py-1.5 rounded bg-[var(--accent-gold)]/10">
                <span className="w-5 text-right text-xs text-[var(--text-tertiary)] tabular-nums">{daily.user_rank}</span>
                <span className="flex-1 text-[var(--accent-gold)] font-medium">{t("You", lang)}</span>
              </div>
            )}
          </div>
        </Section>
      )}

      {activity.length >= 2 && (
        <Section title={t("Weekly activity", lang)}>
          <ActivityChart rows={activity} lang={lang} />
        </Section>
      )}

      {(bosses.length > 0 || elites.length > 0 || fights.length > 0) && (
        <Section title={t("What kills you", lang)}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <DeathColumn title={t("Bosses", lang)} rows={bosses} lang={lang} />
            <DeathColumn title={t("Elites", lang)} rows={elites} lang={lang} />
            <DeathColumn title={t("Monsters", lang)} rows={fights} lang={lang} />
          </div>
        </Section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(data.map_danger || []).length > 0 && (
          <Section title={t("Where you die", lang)}>
            <DangerTable rows={data.map_danger!} lang={lang} />
          </Section>
        )}
        {restSites.length > 0 && (
          <Section title={t("Your campfire choices", lang)}>
            <RestSection mine={restSites} lang={lang} />
          </Section>
        )}
      </div>

      {data.card_picks && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Section title={t("Cards you take more than most", lang)}>
            <CardDeltaList rows={data.card_picks.over_picked || []} cards={cards} lang={lang} />
          </Section>
          <Section title={t("Cards you take less than most", lang)}>
            <CardDeltaList rows={data.card_picks.under_picked || []} cards={cards} lang={lang} />
          </Section>
        </div>
      )}

      {divergence.length > 0 && (
        <Section title={t("Event choices where you differ", lang)}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            {divergence.map((d) => (
              <div key={`${d.event_id}-${d.option_id}`} className="space-y-1">
                <div className="flex items-center justify-between text-sm gap-2">
                  <span className="min-w-0 truncate">
                    <Link href={`${lp}/events/${d.event_id.toLowerCase()}`} className="text-[var(--text-primary)] hover:text-[var(--accent-gold)] transition-colors">
                      {d.event_name || d.event_id.replace(/_/g, " ")}
                    </Link>
                    <span className="text-[var(--text-muted)]"> · {d.option_label || d.option_id.replace(/_/g, " ")}</span>
                  </span>
                  <GapBadge gap={d.gap} />
                </div>
                <CompareBars you={d.your_pct} community={d.community_pct} lang={lang} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {boons.length > 0 && (
        <Section title={t("Your boon take rates", lang)}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            {boons.map((b) => (
              <div key={b.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-primary)]">{b.name || b.id.replace(/_/g, " ")}</span>
                  <span className="text-xs text-[var(--text-tertiary)] tabular-nums">
                    {b.count}/{b.offered} {t("offers", lang)}
                  </span>
                </div>
                <CompareBars you={b.take_rate!} community={b.community_take_rate} lang={lang} />
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

export function useCardMap(): Record<string, EntityInfo> {
  const [cards, setCards] = useState<Record<string, EntityInfo>>({});
  useEffect(() => {
    let alive = true;
    cachedFetch<EntityInfo[]>(`${API}/api/cards`)
      .then((rows) => {
        if (!alive) return;
        const m: Record<string, EntityInfo> = {};
        for (const c of rows) m[c.id.toUpperCase()] = c;
        setCards(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return cards;
}

export default function ProfileInsights({
  bests,
  personalRanks,
  daily,
}: {
  bests?: PersonalBests | null;
  personalRanks?: Record<string, { rank: number; total: number } | null>;
  daily?: DailyBoard | null;
} = {}) {
  const { lang } = useLanguage();
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [character, setCharacter] = useState<string | null>(null);
  const cards = useCardMap();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const q = character ? `?character=${encodeURIComponent(character)}` : "";
    fetch(`${API}/api/auth/insights${q}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setData(d))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [character]);

  if (loading && !data) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-[var(--bg-card)] rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!character && (!data || !data.runs_walked)) {
    return (
      <p className="text-sm text-[var(--text-secondary)] py-4">
        {t("No insights yet. Upload and claim runs to see how you play.", lang)}
      </p>
    );
  }

  return (
    <div className={`space-y-4 ${loading ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--text-muted)]">
          {t("Your runs through the community lens. Every section compares you with all submitted runs.", lang)}
          {data?.runs_capped ? ` ${t("Based on your most recent runs only.", lang)}` : ""}
        </p>
        <CharacterPicker value={character} onChange={setCharacter} lang={lang} />
      </div>
      {data && data.runs_walked ? (
        <InsightsPanels
          data={data}
          cards={cards}
          lang={lang}
          bests={character ? undefined : bests}
          personalRanks={character ? undefined : personalRanks}
          daily={character ? undefined : daily}
        />
      ) : (
        <p className="text-sm text-[var(--text-secondary)] py-4">{t("Not enough data yet.", lang)}</p>
      )}
    </div>
  );
}
