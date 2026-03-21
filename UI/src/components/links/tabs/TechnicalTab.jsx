import { useMemo } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Shield, Zap, Image } from 'lucide-react';
import { strings, format } from '../../../lib/strings';
import SecHeaderRow from '../SecHeaderRow';
import MiniBar from '../MiniBar';
import { registerChartJsBase, barOptionsHorizontal, doughnutOptionsBottomLegend } from '../../../utils/chartJsDefaults';

registerChartJsBase();

function headerPresent(val) {
  if (val == null) return false;
  if (typeof val === 'string') return val.trim().length > 0;
  return Boolean(val);
}

export default function TechnicalTab({ link }) {
  const lt = strings.components.linkTabs.technical;
  const SEC_HEADERS = lt.securityRows;

  const perfRows = [
    { label: lt.perfCacheControl, value: link.cache_control || lt.notSet, mono: true },
    { label: lt.perfEtag, value: link.etag ? lt.etagPresent : lt.notSet },
    { label: lt.perfScripts, value: String(link.script_count ?? 0) },
    { label: lt.perfStylesheets, value: String(link.link_stylesheet_count ?? 0) },
    {
      label: lt.perfMixedContent,
      value:
        link.mixed_content_count > 0
          ? format(lt.mixedItems, { n: link.mixed_content_count })
          : lt.mixedNone,
      warn: link.mixed_content_count > 0,
    },
  ];

  const imgTotal = link.images_total || 0;

  const securityHeaderCounts = useMemo(() => {
    const present = SEC_HEADERS.filter((h) => headerPresent(link[h.field])).length;
    const missing = SEC_HEADERS.length - present;
    return { present, missing };
  }, [link, SEC_HEADERS]);

  const assetBar = useMemo(() => {
    const scripts = Number(link.script_count) || 0;
    const sheets = Number(link.link_stylesheet_count) || 0;
    const images = Number(link.images_total) || 0;
    return {
      labels: [...lt.assetBarLabels],
      values: [scripts, sheets, images],
    };
  }, [link, lt.assetBarLabels]);

  const assetBarOpts = useMemo(() => {
    const base = barOptionsHorizontal();
    return {
      ...base,
      plugins: {
        ...base.plugins,
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${format(lt.tooltipItems, { n: Number(ctx.raw).toLocaleString() })}`,
          },
        },
      },
    };
  }, [lt.tooltipItems]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Shield className="h-3.5 w-3.5" /> {lt.securityHeaders}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="bg-brand-900 border border-default rounded-xl p-3">
            <div className="text-xs text-muted-foreground mb-2">{format(lt.headersPresentOf, { n: SEC_HEADERS.length })}</div>
            <div className="h-40">
              <Doughnut
                data={{
                  labels: [lt.doughnutPresent, lt.doughnutMissing],
                  datasets: [
                    {
                      data: [securityHeaderCounts.present, securityHeaderCounts.missing],
                      backgroundColor: ['#22C55E', '#334155'],
                      borderColor: 'rgba(15,23,42,0.8)',
                      borderWidth: 2,
                    },
                  ],
                }}
                options={doughnutOptionsBottomLegend()}
              />
            </div>
          </div>
          <div className="bg-brand-900 border border-default rounded-xl p-3">
            <div className="text-xs text-muted-foreground mb-2">{lt.scriptsStylesImages}</div>
            <div className="h-40">
              <Bar
                data={{
                  labels: assetBar.labels,
                  datasets: [
                    {
                      data: assetBar.values,
                      backgroundColor: ['#4C72B0', '#DD8452', '#55A868'],
                    },
                  ],
                }}
                options={assetBarOpts}
              />
            </div>
          </div>
        </div>
        <div className="space-y-2">
          {SEC_HEADERS.map((h) => (
            <SecHeaderRow
              key={h.label}
              label={h.label}
              value={link[h.field]}
              recommendation={h.rec}
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Zap className="h-3.5 w-3.5" /> {lt.performanceCaching}
        </h3>
        <div className="space-y-2">
          {perfRows.map(({ label, value, mono, warn }) => (
            <div
              key={label}
              className="bg-brand-900 border border-default rounded-lg flex items-center justify-between px-4 py-2.5"
            >
              <span className="text-sm text-muted-foreground">{label}</span>
              <span className={`text-sm ${mono ? 'font-mono' : ''} ${warn ? 'text-red-400' : 'text-foreground'}`}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Image className="h-3.5 w-3.5" /> {lt.imagesA11y}
        </h3>
        <div className="bg-brand-900 border border-default rounded-xl p-4 space-y-3">
          <MiniBar
            value={imgTotal}
            total={Math.max(imgTotal, 1)}
            label={lt.totalImages}
            color="bg-blue-500"
          />
          <MiniBar
            value={link.images_without_alt || 0}
            total={Math.max(imgTotal, 1)}
            label={lt.missingAlt}
            color={link.images_without_alt > 0 ? 'bg-red-500' : 'bg-green-500'}
          />
          <MiniBar
            value={link.img_without_lazy || 0}
            total={Math.max(imgTotal, 1)}
            label={lt.noLazyLoad}
            color={link.img_without_lazy > 0 ? 'bg-yellow-500' : 'bg-green-500'}
          />
          <div className="flex items-center justify-between pt-2 border-t border-muted">
            <span className="text-sm text-muted-foreground">{lt.ariaElements}</span>
            <span className="text-sm text-foreground font-mono">{link.aria_count ?? 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
