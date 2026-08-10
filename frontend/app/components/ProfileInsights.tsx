"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler,
  type ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { cachedFetch } from "@/lib/fetch-cache";
import { fullCardUrl, imageUrl } from "@/lib/image-url";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const GRID = "rgba(140,140,150,0.14)";
const TICK = "#8b8b93";

interface ComparableRow {
  id: string;
  name?: string;
  label?: string;
  count: number;
  pct: number;
  community_pct?: number | null;
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

export interface Insights {
  total_runs: number;
  runs_walked: number;
  runs_capped?: boolean;
  deaths?: { encounters?: ComparableRow[]; events?: ComparableRow[] };
  rest_sites?: ComparableRow[];
  ancient_picks?: BoonRow[];
  event_divergence?: EventDivergence[];
  card_picks?: { over_picked: CardDelta[]; under_picked: CardDelta[] };
  map_danger?: { act: number; types: Record<string, DangerCell> }[];
  streaks?: { current_win_streak: number; best_win_streak: number };
  progression?: { month: string; runs: number; wins: number; win_rate: number }[];
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
}

const NODE_LABELS: Record<string, string> = {
  monster: "Monsters",
  elite: "Elites",
  boss: "Bosses",
  unknown: "Unknown rooms",
  rest_site: "Rest sites",
  shop: "Shops",
  treasure: "Treasure",
  ancient: "Ancients",
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
              <span className="block truncate text-sm text-[var(--text-primary)]">{info?.name || d.id.replace(/_/g, " ")}</span>
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

function ProgressionChart({ rows, lang }: { rows: NonNullable<Insights["progression"]>; lang: string }) {
  const labels = rows.map((r) => r.month);
  const data = {
    labels,
    datasets: [
      {
        label: t("Win rate", lang),
        data: rows.map((r) => r.win_rate),
        borderColor: "#d4af37",
        backgroundColor: "rgba(212,175,55,0.12)",
        fill: true,
        tension: 0.3,
        pointRadius: 3,
      },
    ],
  };
  const opts: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const r = rows[ctx.dataIndex];
            return `${r.win_rate}% (${r.wins}/${r.runs})`;
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: TICK, font: { size: 10 } } },
      y: {
        grid: { color: GRID },
        border: { display: false },
        ticks: { color: TICK, font: { size: 10 }, callback: (v) => `${v}%` },
        min: 0,
        suggestedMax: 60,
      },
    },
  };
  return (
    <div className="h-44">
      <Line data={data} options={opts} />
    </div>
  );
}

function DangerList({ rows, lang }: { rows: NonNullable<Insights["map_danger"]>; lang: string }) {
  const cells: { act: number; ptype: string; cell: DangerCell }[] = [];
  for (const act of rows) {
    for (const [ptype, cell] of Object.entries(act.types || {})) {
      if ((cell.visits || 0) >= 10 && (cell.death_rate || 0) > 0) {
        cells.push({ act: act.act, ptype, cell });
      }
    }
  }
  cells.sort((a, b) => b.cell.death_rate - a.cell.death_rate);
  const top = cells.slice(0, 8);
  if (top.length === 0) {
    return <p className="text-xs text-[var(--text-muted)]">{t("Not enough data yet.", lang)}</p>;
  }
  return (
    <div className="space-y-3">
      {top.map(({ act, ptype, cell }) => (
        <div key={`${act}-${ptype}`} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--text-primary)]">
              {t("Act", lang)} {act + 1} · {t(NODE_LABELS[ptype] || ptype, lang)}
            </span>
            <span className="text-xs text-[var(--text-tertiary)] tabular-nums">
              {cell.visits} {t("visits", lang)}
            </span>
          </div>
          <CompareBars you={cell.death_rate} community={cell.community_death_rate} lang={lang} />
        </div>
      ))}
    </div>
  );
}

// The full insights layout, shared between the signed-in profile tab and the
// public /players page (which passes the same payload shape).
export function InsightsPanels({ data, cards, lang }: { data: Insights; cards: Record<string, EntityInfo>; lang: string }) {
  const lp = useLangPrefix();
  const deathsEnc = (data.deaths?.encounters || []).slice(0, 8);
  const deathsEv = (data.deaths?.events || []).slice(0, 5);
  const restSites = data.rest_sites || [];
  const boons = (data.ancient_picks || [])
    .filter((b) => (b.offered ?? 0) >= 5 && b.take_rate != null)
    .sort((a, b) => Math.abs((b.take_rate! - (b.community_take_rate ?? b.take_rate!))) - Math.abs((a.take_rate! - (a.community_take_rate ?? a.take_rate!))))
    .slice(0, 8);
  const divergence = data.event_divergence || [];
  const records = data.records || {};
  const progression = (data.progression || []).filter((r) => r.runs > 0);
  const pct = data.percentiles;
  const streaks = data.streaks;

  return (
    <div className="space-y-4">
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

      {progression.length >= 2 && (
        <Section title={t("Win rate by month", lang)}>
          <ProgressionChart rows={progression} lang={lang} />
        </Section>
      )}

      {(deathsEnc.length > 0 || deathsEv.length > 0) && (
        <Section title={t("What kills you", lang)}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {deathsEnc.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">{t("Deadliest encounters", lang)}</p>
                <div className="space-y-1.5">
                  {deathsEnc.map((d) => (
                    <div key={d.id} className="flex items-center justify-between text-sm">
                      <span className="text-[var(--text-primary)] truncate">{d.name || d.id.replace(/_/g, " ")}</span>
                      <span className="text-xs text-[var(--text-tertiary)] tabular-nums shrink-0 ml-2">
                        {d.count} · {d.pct}%
                        {d.community_pct != null && (
                          <span className="text-[var(--text-muted)]"> ({t("Community", lang)} {d.community_pct}%)</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {deathsEv.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">{t("Deadliest events", lang)}</p>
                <div className="space-y-1.5">
                  {deathsEv.map((d) => (
                    <div key={d.id} className="flex items-center justify-between text-sm">
                      <span className="text-[var(--text-primary)] truncate">{d.name || d.id.replace(/_/g, " ")}</span>
                      <span className="text-xs text-[var(--text-tertiary)] tabular-nums shrink-0 ml-2">
                        {d.count} · {d.pct}%
                        {d.community_pct != null && (
                          <span className="text-[var(--text-muted)]"> ({t("Community", lang)} {d.community_pct}%)</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {(data.map_danger || []).length > 0 && (
        <Section title={t("Where you die", lang)}>
          <DangerList rows={data.map_danger!} lang={lang} />
        </Section>
      )}

      {restSites.length > 0 && (
        <Section title={t("Your campfire choices", lang)}>
          <div className="space-y-3">
            {restSites.map((r) => (
              <div key={r.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-primary)]">{r.label || r.id}</span>
                  <span className="text-xs text-[var(--text-tertiary)] tabular-nums">{r.count}</span>
                </div>
                <CompareBars you={r.pct} community={r.community_pct} lang={lang} />
              </div>
            ))}
          </div>
        </Section>
      )}

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

      {boons.length > 0 && (
        <Section title={t("Your boon take rates", lang)}>
          <div className="space-y-3">
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

      {divergence.length > 0 && (
        <Section title={t("Event choices where you differ", lang)}>
          <div className="space-y-3">
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

      {(records.fastest_win || records.longest_run || records.biggest_deck) && (
        <Section title={t("Your records", lang)}>
          <div className="space-y-2">
            {records.fastest_win && (
              <Link href={`${lp}/runs/${records.fastest_win.run_hash}`} className="flex items-center justify-between text-sm hover:bg-[var(--bg-card-hover)] rounded px-2 -mx-2 py-1 transition-colors">
                <span className="text-[var(--text-secondary)]">{t("Fastest win", lang)}</span>
                <span className="text-[var(--text-primary)] font-medium tabular-nums">{formatTime(records.fastest_win.run_time)}</span>
              </Link>
            )}
            {records.longest_run && (
              <Link href={`${lp}/runs/${records.longest_run.run_hash}`} className="flex items-center justify-between text-sm hover:bg-[var(--bg-card-hover)] rounded px-2 -mx-2 py-1 transition-colors">
                <span className="text-[var(--text-secondary)]">{t("Longest run", lang)}</span>
                <span className="text-[var(--text-primary)] font-medium tabular-nums">{formatTime(records.longest_run.run_time)}</span>
              </Link>
            )}
            {records.biggest_deck && (
              <Link href={`${lp}/runs/${records.biggest_deck.run_hash}`} className="flex items-center justify-between text-sm hover:bg-[var(--bg-card-hover)] rounded px-2 -mx-2 py-1 transition-colors">
                <span className="text-[var(--text-secondary)]">{t("Biggest deck", lang)}</span>
                <span className="text-[var(--text-primary)] font-medium tabular-nums">
                  {records.biggest_deck.size} {t("cards", lang)}
                </span>
              </Link>
            )}
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

export default function ProfileInsights() {
  const { lang } = useLanguage();
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const cards = useCardMap();

  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/auth/insights`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setData(d))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-[var(--bg-card)] rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data || !data.runs_walked) {
    return (
      <p className="text-sm text-[var(--text-secondary)] py-4">
        {t("No insights yet. Upload and claim runs to see how you play.", lang)}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--text-muted)]">
        {t("Your runs through the community lens. Every section compares you with all submitted runs.", lang)}
        {data.runs_capped ? ` ${t("Based on your most recent runs only.", lang)}` : ""}
      </p>
      <InsightsPanels data={data} cards={cards} lang={lang} />
    </div>
  );
}
