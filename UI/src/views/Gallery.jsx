import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Bar } from 'react-chartjs-2';
import {
  Images,
  ExternalLink,
  Grid3X3,
  LayoutGrid,
  Maximize2,
  X,
  Filter,
  Columns,
  Loader2,
} from 'lucide-react';
import { useReport } from '../context/useReport';
import { strings } from '../lib/strings';
import { PageLayout, PageHeader, Card } from '../components';
import { PALETTE_CATEGORICAL } from '../utils/chartPalette';
import { registerChartJsBase, barOptionsHorizontal } from '../utils/chartJsDefaults';

registerChartJsBase();

function resolveImageSrc(raw, pageUrl) {
  let s = (raw || '').trim();
  if (!s) return null;
  if (s.startsWith('//')) s = `https:${s}`;
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) return s;
  try {
    return new URL(s, pageUrl).href;
  } catch {
    return null;
  }
}

function collectFromLinks(links) {
  const map = new Map();
  const add = (rawSrc, pageUrl, kind) => {
    const src = resolveImageSrc(rawSrc, pageUrl);
    if (!src || src.startsWith('data:text')) return;
    if (!map.has(src)) {
      map.set(src, { src, refs: [] });
    }
    const entry = map.get(src);
    if (!entry.refs.some((r) => r.pageUrl === pageUrl && r.kind === kind)) {
      entry.refs.push({ pageUrl, kind });
    }
  };

  for (const link of links || []) {
    const pageUrl = link?.url;
    if (!pageUrl) continue;
    const pa = link.page_analysis && typeof link.page_analysis === 'object' ? link.page_analysis : {};
    const list = Array.isArray(pa.image_urls) ? pa.image_urls : [];
    for (const u of list) {
      add(u, pageUrl, 'content');
    }
    add(link.og_image, pageUrl, 'og');
    add(link.twitter_image, pageUrl, 'twitter');
  }
  return Array.from(map.values());
}

function GalleryTile({ item, onOpen, masonry = false }) {
  const vg = strings.views.gallery;
  const kl = vg.kindLabels;
  const sj = strings.common;
  const [broken, setBroken] = useState(false);
  const primary = item.refs[0];
  const kinds = [...new Set(item.refs.map((r) => r.kind))];

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={`group text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
        masonry
          ? 'block w-full mb-3 break-inside-avoid rounded-xl overflow-hidden border border-default bg-brand-800/60'
          : 'relative rounded-xl overflow-hidden border border-default bg-brand-800/60'
      }`}
    >
      <div className="relative">
        <div
          className={
            masonry
              ? 'bg-brand-950'
              : 'aspect-[4/3] bg-brand-950 flex items-center justify-center'
          }
        >
          {!broken ? (
            <img
              src={item.src}
              alt=""
              loading="lazy"
              decoding="async"
              className={
                masonry
                  ? 'w-full h-auto max-w-full block transition-transform duration-300 group-hover:scale-[1.02]'
                  : 'w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]'
              }
              onError={() => setBroken(true)}
            />
          ) : (
            <div
              className={`p-4 text-center text-xs text-muted-foreground ${masonry ? 'min-h-[100px] flex flex-col items-center justify-center' : ''}`}
            >
              {vg.previewUnavailable}
              <div className="mt-2 font-mono text-[10px] break-all opacity-70 line-clamp-4">{item.src}</div>
            </div>
          )}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-1 text-[10px] text-white/90 font-medium truncate">
            <Maximize2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{primary?.pageUrl || sj.emDash}</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {kinds.map((k) => (
              <span key={k} className="text-[9px] px-1.5 py-0.5 rounded bg-white/15 text-white/95">
                {kl[k] || k}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}

const GRID_GAP_PX = 12;

function getColumnCount(width, density) {
  if (!width || width < 0) return 2;
  if (density === 'sm') {
    if (width >= 1280) return 6;
    if (width >= 1024) return 5;
    if (width >= 768) return 4;
    if (width >= 640) return 3;
    return 2;
  }
  if (density === 'lg') {
    if (width >= 1024) return 3;
    if (width >= 640) return 2;
    return 1;
  }
  if (width >= 1024) return 4;
  if (width >= 640) return 3;
  return 2;
}

function VirtualGalleryGrid({ items, onOpen, density }) {
  const parentRef = useRef(null);
  const [layout, setLayout] = useState(() => ({
    width: typeof window !== 'undefined' ? Math.min(window.innerWidth, 1400) : 800,
    cols: 4,
  }));

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      setLayout({ width: w, cols: getColumnCount(w, density) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [density]);

  const { cols, width } = layout;
  const rowHeight = useMemo(() => {
    if (cols < 1) return 200;
    const cellW = (width - GRID_GAP_PX * (cols - 1)) / cols;
    const cellH = cellW * (3 / 4);
    return cellH + GRID_GAP_PX;
  }, [width, cols]);

  const rowCount = cols > 0 ? Math.ceil(items.length / cols) : 0;

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 3,
  });

  if (items.length === 0) return null;

  return (
    <div
      ref={parentRef}
      className="overflow-auto max-h-[min(72vh,calc(100vh-13rem))] rounded-xl border border-default bg-brand-900/20 -mx-1 px-1"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((vRow) => {
          const start = vRow.index * cols;
          const rowItems = items.slice(start, start + cols);
          return (
            <div
              key={vRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${vRow.size}px`,
                transform: `translateY(${vRow.start}px)`,
              }}
            >
              <div
                className="grid gap-3"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                }}
              >
                {rowItems.map((item) => (
                  <GalleryTile key={item.src} item={item} onOpen={onOpen} masonry={false} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MASONRY_CHUNK = 48;

export default function Gallery({ searchQuery = '' }) {
  const vg = strings.views.gallery;
  const { data, loading } = useReport();
  const [density, setDensity] = useState('md'); // sm | md | lg
  const [layoutMode, setLayoutMode] = useState('grid'); // grid | masonry
  const [kindFilter, setKindFilter] = useState('all'); // all | content | og | twitter
  const [lightbox, setLightbox] = useState(null);
  const [masonryLimit, setMasonryLimit] = useState(MASONRY_CHUNK);
  const masonrySentinelRef = useRef(null);

  const items = useMemo(() => collectFromLinks(data?.links), [data?.links]);

  const kindBreakdown = useMemo(() => {
    let onPage = 0;
    let og = 0;
    let twitter = 0;
    items.forEach((item) => {
      const kinds = new Set(item.refs.map((r) => r.kind));
      if (kinds.has('content')) onPage += 1;
      if (kinds.has('og')) og += 1;
      if (kinds.has('twitter')) twitter += 1;
    });
    return {
      labels: vg.wcBreakdownLabels,
      values: [onPage, og, twitter],
    };
  }, [items, vg.wcBreakdownLabels]);

  const kindBarOpts = useMemo(() => {
    const base = barOptionsHorizontal();
    return {
      ...base,
      plugins: {
        ...base.plugins,
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const n = Number(ctx.raw);
              return ` ${n.toLocaleString()} unique image${n !== 1 ? 's' : ''}`;
            },
          },
        },
      },
    };
  }, []);

  const filtered = useMemo(() => {
    const q = (searchQuery || '').toLowerCase().trim();
    return items.filter((item) => {
      if (kindFilter !== 'all' && !item.refs.some((r) => r.kind === kindFilter)) return false;
      if (!q) return true;
      if (item.src.toLowerCase().includes(q)) return true;
      return item.refs.some((r) => r.pageUrl.toLowerCase().includes(q));
    });
  }, [items, searchQuery, kindFilter]);

  useLayoutEffect(() => {
    setMasonryLimit(MASONRY_CHUNK);
  }, [kindFilter, searchQuery, density, layoutMode, filtered.length]);

  useEffect(() => {
    if (layoutMode !== 'masonry') return undefined;
    const sentinel = masonrySentinelRef.current;
    if (!sentinel || filtered.length === 0) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setMasonryLimit((n) => {
          if (n >= filtered.length) return n;
          return Math.min(n + MASONRY_CHUNK, filtered.length);
        });
      },
      { root: null, rootMargin: '600px', threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [layoutMode, filtered.length]);

  const closeLightbox = useCallback(() => setLightbox(null), []);

  useEffect(() => {
    if (!lightbox) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') closeLightbox();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [lightbox, closeLightbox]);

  if (loading) {
    return (
      <PageLayout className="space-y-8 pb-16">
        <PageHeader title={vg.title} subtitle={vg.subtitle} />
        <Card className="p-16 flex flex-col items-center justify-center gap-4 text-center border-dashed">
          <Loader2 className="h-10 w-10 animate-spin text-link" aria-hidden />
          <p className="text-muted-foreground">{strings.app.loading}</p>
        </Card>
      </PageLayout>
    );
  }

  const masonryColsClass =
    density === 'sm'
      ? 'columns-2 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6'
      : density === 'lg'
        ? 'columns-1 sm:columns-2 lg:columns-3'
        : 'columns-2 sm:columns-3 lg:columns-4';

  return (
    <PageLayout className="space-y-8 pb-16">
      <PageHeader title={vg.title} subtitle={vg.subtitle} />

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5" /> {vg.filterSource}
          </span>
          {[
            { id: 'all', label: vg.filterAll },
            { id: 'content', label: vg.filterOnPage },
            { id: 'og', label: vg.filterOg },
            { id: 'twitter', label: vg.filterTwitter },
          ].map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setKindFilter(id)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                kindFilter === id
                  ? 'bg-blue-500/15 border-blue-500/40 text-link-soft'
                  : 'border-default text-muted-foreground hover:text-foreground hover:bg-brand-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 w-full lg:w-auto lg:min-w-[280px]">
          {items.length > 0 && (
            <div className="flex-1 min-w-0 max-w-md">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold block mb-1">{vg.bySourceType}</span>
              <div className="h-24">
                <Bar
                  data={{
                    labels: kindBreakdown.labels,
                    datasets: [
                      {
                        data: kindBreakdown.values,
                        backgroundColor: [PALETTE_CATEGORICAL[0], PALETTE_CATEGORICAL[1], PALETTE_CATEGORICAL[2]],
                      },
                    ],
                  }}
                  options={kindBarOpts}
                />
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">{vg.layoutStyle}</span>
              <div className="flex rounded-lg border border-default overflow-hidden">
                <button
                  type="button"
                  title={vg.titleLayoutGrid}
                  onClick={() => setLayoutMode('grid')}
                  className={`p-2 ${layoutMode === 'grid' ? 'bg-violet-500/20 text-violet-300' : 'text-muted-foreground hover:bg-brand-800'}`}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title={vg.titleLayoutMasonry}
                  onClick={() => setLayoutMode('masonry')}
                  className={`p-2 border-l border-default ${layoutMode === 'masonry' ? 'bg-violet-500/20 text-violet-300' : 'text-muted-foreground hover:bg-brand-800'}`}
                >
                  <Columns className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">{vg.grid}</span>
              <div className="flex rounded-lg border border-default overflow-hidden">
                <button
                  type="button"
                  title={vg.titleDense}
                  onClick={() => setDensity('sm')}
                  className={`p-2 ${density === 'sm' ? 'bg-blue-500/20 text-link-soft' : 'text-muted-foreground hover:bg-brand-800'}`}
                >
                  <Grid3X3 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title={vg.titleBalanced}
                  onClick={() => setDensity('md')}
                  className={`p-2 border-l border-default ${density === 'md' ? 'bg-blue-500/20 text-link-soft' : 'text-muted-foreground hover:bg-brand-800'}`}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title={vg.titleLarge}
                  onClick={() => setDensity('lg')}
                  className={`p-2 border-l border-default ${density === 'lg' ? 'bg-blue-500/20 text-link-soft' : 'text-muted-foreground hover:bg-brand-800'}`}
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Card className="p-4 flex flex-wrap gap-6 text-sm">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">{vg.statUnique}</div>
          <div className="text-2xl font-bold text-bright tabular-nums">{items.length}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">{vg.statShown}</div>
          <div className="text-2xl font-bold text-foreground tabular-nums">{filtered.length}</div>
        </div>
        <div className="text-xs text-muted-foreground max-w-xl leading-relaxed">{vg.helpBlurb}</div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Images className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            {items.length === 0 ? vg.emptyNoImages : vg.emptyNoMatch}
          </p>
        </Card>
      ) : layoutMode === 'grid' ? (
        <VirtualGalleryGrid items={filtered} onOpen={setLightbox} density={density} />
      ) : (
        <>
          <div className={`${masonryColsClass} gap-3`}>
            {filtered.slice(0, masonryLimit).map((item) => (
              <GalleryTile key={item.src} item={item} onOpen={setLightbox} masonry />
            ))}
          </div>
          {masonryLimit < filtered.length && (
            <div
              ref={masonrySentinelRef}
              className="flex h-14 w-full items-center justify-center gap-2 py-2 text-muted-foreground"
            >
              <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
              <span className="text-xs">{vg.loadingMore}</span>
            </div>
          )}
        </>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 bg-black/85 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={vg.ariaImagePreview}
          onClick={closeLightbox}
        >
          <button
            type="button"
            aria-label={vg.ariaClose}
            onClick={closeLightbox}
            className="absolute top-4 right-4 p-2 rounded-lg bg-brand-800 border border-default text-foreground hover:text-bright hover:bg-brand-700 z-10"
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="max-w-[min(96vw,1200px)] max-h-[min(88vh,900px)] flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-xl overflow-hidden border border-default bg-brand-950 shadow-2xl flex items-center justify-center min-h-[200px]">
              <img
                src={lightbox.src}
                alt=""
                className="max-w-full max-h-[min(70vh,720px)] w-auto h-auto object-contain"
              />
            </div>
            <Card className="p-4 space-y-3">
              <a
                href={lightbox.src}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-link hover:underline break-all font-mono flex items-start gap-2"
              >
                <ExternalLink className="h-4 w-4 shrink-0 mt-0.5" />
                {lightbox.src}
              </a>
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold">{vg.foundOn}</div>
              <ul className="space-y-2 max-h-40 overflow-y-auto">
                {lightbox.refs.map((r, i) => (
                  <li key={`${r.pageUrl}-${r.kind}-${i}`} className="flex flex-wrap items-center gap-2 text-sm">
                    <a href={r.pageUrl} target="_blank" rel="noreferrer" className="text-link hover:underline truncate max-w-full sm:max-w-md">
                      {r.pageUrl}
                    </a>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-800 text-muted-foreground border border-default">
                      {vg.kindLabels[r.kind] || r.kind}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
