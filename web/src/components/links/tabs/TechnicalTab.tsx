import { useMemo } from 'react';
import { Shield, Zap, Image } from 'lucide-react';
import type { LinkDetail } from '@/types/report';
import { strings, format } from '../../../lib/strings';
import SecHeaderRow from '../SecHeaderRow';
import MiniBar from '../MiniBar';
import AiSuggestionButton from '@/components/ai/AiSuggestionButton';
import { buildTechnicalLinkIssueContext } from '@/lib/fixSuggestionContext';

function headerPresent(val: unknown): boolean {
  if (val == null) return false;
  if (typeof val === 'string') return val.trim().length > 0;
  return Boolean(val);
}

export interface TechnicalTabProps {
  link: LinkDetail;
}

export default function TechnicalTab({ link }: TechnicalTabProps) {
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
        (link.mixed_content_count ?? 0) > 0
          ? format(lt.mixedItems, { n: link.mixed_content_count ?? 0 })
          : lt.mixedNone,
      warn: (link.mixed_content_count ?? 0) > 0,
    },
  ];

  const imgTotal = link.images_total || 0;

  const securityHeaderCounts = useMemo(() => {
    const present = SEC_HEADERS.filter((h) => headerPresent(link[h.field as keyof LinkDetail])).length;
    const missing = SEC_HEADERS.length - present;
    return { present, missing };
  }, [link, SEC_HEADERS]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Shield className="h-3.5 w-3.5" /> {lt.securityHeaders}
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          {format(lt.headersPresentOf, { n: SEC_HEADERS.length })}{' '}
          <span className="text-foreground font-semibold tabular-nums">
            {securityHeaderCounts.present} {lt.doughnutPresent.toLowerCase()}, {securityHeaderCounts.missing}{' '}
            {lt.doughnutMissing.toLowerCase()}
          </span>
        </p>
        <div className="space-y-2">
          {SEC_HEADERS.map((h) => (
            <SecHeaderRow
              key={h.label}
              label={h.label}
              value={String(link[h.field as keyof LinkDetail] ?? '')}
              recommendation={h.rec}
              pageUrl={link.url}
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
            <div key={label} className="bg-brand-900 border border-default rounded-lg px-4 py-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className={`text-sm ${mono ? 'font-mono' : ''} ${warn ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                  {value}
                </span>
              </div>
              {warn ? (
                <AiSuggestionButton
                  request={buildTechnicalLinkIssueContext(
                    `${label}: ${value}`,
                    link.url,
                    'mixed_content',
                  )}
                />
              ) : null}
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
            color={(link.images_without_alt ?? 0) > 0 ? 'bg-red-500' : 'bg-green-500'}
          />
          <MiniBar
            value={link.img_without_lazy || 0}
            total={Math.max(imgTotal, 1)}
            label={lt.noLazyLoad}
            color={(link.img_without_lazy ?? 0) > 0 ? 'bg-yellow-500' : 'bg-green-500'}
          />
          <MiniBar
            value={link.img_without_dimensions || 0}
            total={Math.max(imgTotal, 1)}
            label={lt.noDimensions}
            color={(link.img_without_dimensions ?? 0) > 0 ? 'bg-orange-500' : 'bg-green-500'}
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
