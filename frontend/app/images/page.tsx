"use client";

import { useState, useEffect, useRef } from "react";
import { imageUrl } from "@/lib/image-url";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface ImageEntry {
  filename: string;
  url: string;
}

interface Category {
  id: string;
  name: string;
  count: number;
  images: ImageEntry[];
  formats?: string[];
  // Present on the full-dump categories (game/<version>/ on the CDN):
  // `images` is only a preview and the contents page through /browse.
  browse?: { version: string; category: string };
}

interface BrowsePage {
  path: string;
  folders: string[];
  total: number;
  offset: number;
  limit: number;
  images: ImageEntry[];
}

const FORMAT_LABELS: Record<string, string> = {
  png: "PNG",
  webp: "WebP",
  gif: "GIF",
  jpg: "JPG",
  jpeg: "JPEG",
};

function DownloadSplitButton({
  categoryId,
  formats,
  betaVersion,
}: {
  categoryId: string;
  formats: string[];
  betaVersion?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", onClickOutside);
      return () => document.removeEventListener("mousedown", onClickOutside);
    }
  }, [open]);

  const hasMultipleFormats = formats.length > 1;
  // Append `?version=` for beta categories so the zip pulls from the
  // user-selected ingest dir, not whatever `latest` points at.
  const betaQuery = categoryId.startsWith("beta-") && betaVersion
    ? `version=${encodeURIComponent(betaVersion)}`
    : "";
  const downloadUrl = `${API}/api/images/${categoryId}/download${betaQuery ? `?${betaQuery}` : ""}`;

  return (
    <div ref={ref} className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
      <a
        href={downloadUrl}
        className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-[var(--accent-gold)] text-[var(--bg-primary)] hover:opacity-90 transition-opacity ${
          hasMultipleFormats ? "rounded-l-full" : "rounded-full"
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
        </svg>
        Download ZIP
      </a>
      {hasMultipleFormats && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setOpen((v) => !v);
            }}
            aria-haspopup="true"
            aria-expanded={open}
            aria-label="Choose download format"
            className="inline-flex items-center px-2 py-1 rounded-r-full text-xs font-medium bg-[var(--accent-gold)] text-[var(--bg-primary)] hover:opacity-90 transition-opacity border-l border-[var(--bg-primary)]/20"
          >
            <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {open && (
            <div className="absolute right-0 top-full mt-1 z-10 min-w-[140px] rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-lg py-1">
              {formats.map((ext) => (
                <a
                  key={ext}
                  href={`${downloadUrl}${betaQuery ? "&" : "?"}format=${ext}`}
                  onClick={() => setOpen(false)}
                  className="block px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  {FORMAT_LABELS[ext] ?? ext.toUpperCase()} only
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ImageTile({ img }: { img: ImageEntry }) {
  const label = img.filename.replace(/\.(png|webp|gif|jpe?g)$/i, "").replace(/_/g, " ");
  return (
    <div className="group rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--border-accent)] transition-all overflow-hidden">
      <div className="flex items-center justify-center p-2">
        <img
          src={imageUrl(img.url)}
          alt={label}
          crossOrigin="anonymous"
          loading="lazy"
          className="max-w-full object-contain group-hover:scale-105 transition-transform duration-300"
        />
      </div>
      <div className="px-1.5 pb-1.5 text-center">
        <span className="text-[10px] text-[var(--text-muted)] truncate block" title={img.filename}>
          {label}
        </span>
      </div>
    </div>
  );
}

// Folder-aware pager for the full-dump categories: the contents live on the
// CDN and page through /api/images/game/<version>/<category>/browse, so even
// the six-figure card cross-product trees stay navigable.
function GameBrowser({ version, category }: { version: string; category: string }) {
  const [path, setPath] = useState("");
  const [page, setPage] = useState<BrowsePage | null>(null);
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setImages([]);
    fetch(
      `${API}/api/images/game/${version}/${category}/browse?path=${encodeURIComponent(path)}&offset=0&limit=200`
    )
      .then((r) => r.json())
      .then((data: BrowsePage) => {
        setPage(data);
        setImages(data.images ?? []);
      })
      .finally(() => setLoading(false));
  }, [version, category, path]);

  function loadMore() {
    if (!page) return;
    setLoading(true);
    fetch(
      `${API}/api/images/game/${version}/${category}/browse?path=${encodeURIComponent(path)}&offset=${images.length}&limit=200`
    )
      .then((r) => r.json())
      .then((data: BrowsePage) => setImages((prev) => [...prev, ...(data.images ?? [])]))
      .finally(() => setLoading(false));
  }

  const crumbs = path ? path.split("/") : [];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-3 text-xs">
        <button
          type="button"
          onClick={() => setPath("")}
          className={`px-2 py-0.5 rounded ${path === "" ? "text-[var(--accent-gold)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
        >
          {category}
        </button>
        {crumbs.map((seg, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className="text-[var(--text-muted)]">/</span>
            <button
              type="button"
              onClick={() => setPath(crumbs.slice(0, i + 1).join("/"))}
              className={`px-1 py-0.5 rounded ${i === crumbs.length - 1 ? "text-[var(--accent-gold)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
            >
              {seg}
            </button>
          </span>
        ))}
        {page && (
          <span className="ml-auto text-[var(--text-muted)]">
            {page.total} files{page.folders.length > 0 ? `, ${page.folders.length} folders` : ""}
          </span>
        )}
      </div>

      {page && page.folders.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {page.folders.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setPath(path ? `${path}/${f}` : f)}
              className="px-2.5 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-xs text-[var(--text-secondary)] hover:border-[var(--border-accent)] hover:text-[var(--text-primary)] transition-colors"
            >
              {f}/
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
        {images.map((img) => (
          <ImageTile key={img.url} img={img} />
        ))}
      </div>

      {loading && <div className="text-center py-4 text-xs text-[var(--text-muted)]">Loading...</div>}
      {!loading && page && images.length < page.total && (
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={loadMore}
            className="px-4 py-1.5 rounded-full text-xs font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]/50 hover:text-[var(--text-primary)] transition-colors"
          >
            Load more ({images.length} of {page.total})
          </button>
        </div>
      )}
    </div>
  );
}

export default function ImagesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [betaVersions, setBetaVersions] = useState<string[]>([]);
  // Land on the main game's art by default; the dropdown swaps to a beta
  // ingest on demand.
  const [selectedBetaVersion, setSelectedBetaVersion] = useState<string>("main");

  // Hydrate the version dropdown from /api/images/beta/versions, then
  // honor whatever's in the ?version= query string. Persisting selection
  // in the URL makes the view shareable, link Discord at a specific
  // beta's art without needing app state.
  useEffect(() => {
    fetch(`${API}/api/images/beta/versions`)
      .then((r) => r.json())
      .then((data: { versions: string[]; latest: string | null }) => {
        setBetaVersions(data.versions ?? []);
        const fromUrl = typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("version")
          : null;
        if (fromUrl && data.versions?.includes(fromUrl)) {
          setSelectedBetaVersion(fromUrl);
        }
      })
      .catch(() => {
        // If versions endpoint isn't available yet (old backend), fall back gracefully.
        setBetaVersions([]);
      });
  }, []);

  // Refetch categories whenever the selected beta version changes, the
  // backend swaps `beta/cards` -> `beta/<version>/cards` server-side.
  useEffect(() => {
    setLoading(true);
    const url = selectedBetaVersion
      ? `${API}/api/images?version=${encodeURIComponent(selectedBetaVersion)}`
      : `${API}/api/images`;
    fetch(url)
      .then((r) => r.json())
      .then((data: Category[]) => setCategories(data))
      .finally(() => setLoading(false));
  }, [selectedBetaVersion]);

  // Reflect selection in URL so refresh / share-link works. "main" is the
  // default, so it stays out of the URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (selectedBetaVersion && selectedBetaVersion !== "main") {
      url.searchParams.set("version", selectedBetaVersion);
    } else {
      url.searchParams.delete("version");
    }
    window.history.replaceState({}, "", url.toString());
  }, [selectedBetaVersion]);

  function toggleCategory(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Images</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        Browse and download game assets. Click a category to view, or download as a zip pack.
      </p>

      {/* Version picker: main by default, archived beta ingests on demand. */}
      {betaVersions.length > 0 && (
        <div className="flex items-center gap-2 mb-8 text-sm">
          <label htmlFor="beta-version" className="text-[var(--text-muted)]">
            Game version:
          </label>
          <select
            id="beta-version"
            value={selectedBetaVersion}
            onChange={(e) => setSelectedBetaVersion(e.target.value)}
            className="px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-md text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]/50 cursor-pointer"
          >
            {betaVersions.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <span className="text-xs text-[var(--text-muted)]">
            (main = current production game; vX.Y.Z = archived Steam beta)
          </span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-[var(--text-muted)]">Loading...</div>
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => {
            const isOpen = expanded.has(cat.id);
            return (
              <div
                key={cat.id}
                className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] overflow-hidden"
              >
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors"
                  onClick={() => toggleCategory(cat.id)}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block transition-transform text-[var(--text-muted)] text-xs ${isOpen ? "rotate-90" : ""}`}
                    >
                      &gt;
                    </span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      {cat.name}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {cat.count} images
                    </span>
                  </div>

                  {cat.browse ? (
                    <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                      {cat.browse.version}
                    </span>
                  ) : (
                    <DownloadSplitButton
                      categoryId={cat.id}
                      betaVersion={selectedBetaVersion}
                      formats={
                        cat.formats ??
                        Array.from(
                          new Set(
                            cat.images
                              .map((img) => img.filename.split(".").pop()?.toLowerCase())
                              .filter((ext): ext is string => Boolean(ext))
                          )
                        ).sort()
                      }
                    />
                  )}
                </div>

                {isOpen && (
                  <div className="border-t border-[var(--border-subtle)] px-4 pb-4 pt-3">
                    {cat.browse ? (
                      <GameBrowser version={cat.browse.version} category={cat.browse.category} />
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                        {cat.images.map((img) => (
                          <ImageTile key={img.filename} img={img} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
