// Site policy: every displayed date and time is Pacific (America/Los_Angeles)
// — never UTC, never the viewer's zone — so two people always read the same
// number. Backend timestamps are UTC but usually naive ("2026-08-18 18:06:44"
// or ISO without Z), so they get stamped UTC before converting. Date-only
// strings ("2026-08-13", week labels, changelog dates) are ALREADY Pacific
// calendar dates and format as-is — running them through a zone conversion
// would shift them back a day.

const TZ = "America/Los_Angeles";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HAS_ZONE = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;

export function utcDate(ts: string | number | Date): Date {
  if (ts instanceof Date) return ts;
  if (typeof ts === "number") return new Date(ts);
  let s = ts.trim();
  if (DATE_ONLY.test(s)) return new Date(`${s}T00:00:00`);
  if (!HAS_ZONE.test(s)) s = `${s.replace(" ", "T")}Z`;
  return new Date(s);
}

function fmt(
  ts: string | number | Date,
  base: Intl.DateTimeFormatOptions,
  opts: Intl.DateTimeFormatOptions,
  locale?: string,
): string {
  const dateOnly = typeof ts === "string" && DATE_ONLY.test(ts.trim());
  const d = utcDate(ts);
  if (isNaN(d.getTime())) return String(ts);
  // Explicit options replace the defaults wholesale, so a call site keeps
  // its exact format; the zone pin is the only thing always applied.
  const style = Object.keys(opts).length ? opts : base;
  // Calendar-date strings render as plain dates, no zone math.
  const zone = dateOnly ? {} : { timeZone: TZ };
  return d.toLocaleString(locale, { ...style, ...zone });
}

export function fmtDate(
  ts: string | number | Date,
  opts: Intl.DateTimeFormatOptions = {},
  locale?: string,
): string {
  return fmt(ts, { year: "numeric", month: "numeric", day: "numeric" }, opts, locale);
}

export function fmtTime(
  ts: string | number | Date,
  opts: Intl.DateTimeFormatOptions = {},
  locale?: string,
): string {
  return fmt(ts, { hour: "numeric", minute: "2-digit", second: "2-digit" }, opts, locale);
}

export function fmtDateTime(
  ts: string | number | Date,
  opts: Intl.DateTimeFormatOptions = {},
  locale?: string,
): string {
  return fmt(
    ts,
    {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    },
    opts,
    locale,
  );
}
