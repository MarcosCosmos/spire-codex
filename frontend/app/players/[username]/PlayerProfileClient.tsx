"use client";

import { useState, useEffect } from "react";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import { InsightsPanels, useCardMap, type Insights } from "@/app/components/ProfileInsights";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type PlayerInsights = Insights & { username?: string; total_wins?: number; win_rate?: number };

export default function PlayerProfileClient({ username }: { username: string }) {
  const { lang } = useLanguage();
  const [data, setData] = useState<PlayerInsights | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "missing">("loading");
  const cards = useCardMap();

  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/players/${encodeURIComponent(username)}/insights`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        setData(d);
        setStatus(d ? "ok" : "missing");
      })
      .catch(() => alive && setStatus("missing"));
    return () => {
      alive = false;
    };
  }, [username]);

  if (status === "loading") {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-3">
        <div className="h-8 w-56 bg-[var(--bg-card)] rounded animate-pulse" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-[var(--bg-card)] rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (status === "missing" || !data) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-3">{username}</h1>
        <p className="text-[var(--text-secondary)]">{t("Player not found, or this profile is private.", lang)}</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">
          {data.username || username}
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          {data.total_runs} {t("runs", lang)}
          {data.win_rate != null ? ` · ${data.win_rate}% ${t("win rate", lang)}` : ""}
          {" · "}
          {t("Compared with all community-submitted runs.", lang)}
        </p>
      </div>
      <InsightsPanels data={data} cards={cards} lang={lang} />
    </div>
  );
}
