import { useMemo } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { strings } from '../../../lib/strings';
import { parseTechStack } from '../../../utils/linkUtils';
import CopyBtn from '../CopyBtn';
import OGPreview from '../OGPreview';

export default function SeoSocialTab({ link }) {
  const s = strings.components.linkTabs.seoSocial;
  const sj = strings.common;
  const techStack = useMemo(() => parseTechStack(link.tech_stack), [link.tech_stack]);

  const flagItems = [
    { label: s.flagNoindex, value: link.noindex, bad: true },
    { label: s.flagHasSchema, value: link.has_schema, bad: false },
    { label: s.flagViewport, value: link.viewport_present, bad: false },
  ];

  const ogFields = [
    { label: 'og:title', value: link.og_title },
    { label: 'og:description', value: link.og_description },
    { label: 'og:type', value: link.og_type },
    { label: 'og:image', value: link.og_image },
  ];

  const twitterFields = [
    { label: 'twitter:card', value: link.twitter_card },
    { label: 'twitter:title', value: link.twitter_title },
    { label: 'twitter:image', value: link.twitter_image },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-brand-900 border border-default rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">{s.canonicalUrl}</div>
          <CopyBtn text={link.canonical_url} />
        </div>
        {link.canonical_url ? (
          <a
            href={link.canonical_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-mono text-link hover:underline break-all"
          >
            {link.canonical_url}
          </a>
        ) : (
          <span className="text-xs text-red-600 dark:text-red-400">{s.notSet}</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {flagItems.map(({ label, value, bad }) => (
          <div key={label} className="bg-brand-900 border border-default rounded-xl p-3 flex flex-col items-center gap-2">
            <div className="text-xs text-muted-foreground">{label}</div>
            {value
              ? bad ? <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" /> : <CheckCircle className="h-6 w-6 text-green-700 dark:text-green-400" />
              : bad ? <CheckCircle className="h-6 w-6 text-green-700 dark:text-green-400" /> : <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />}
            <span className={`text-xs font-semibold ${value === bad ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
              {value ? sj.yes : sj.no}
            </span>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">{s.openGraphHeading}</h3>
        <div className="flex flex-col sm:flex-row gap-4">
          <OGPreview
            url={link.url}
            ogTitle={link.og_title}
            ogDesc={link.og_description}
            ogImage={link.og_image}
          />
          <div className="flex-1 space-y-2">
            {ogFields.map(({ label, value }) => (
              <div key={label} className="bg-brand-900 border border-default rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono text-muted-foreground">{label}</span>
                  {value && <CopyBtn text={value} />}
                </div>
                <span className={`text-xs ${value ? 'text-foreground' : 'text-red-600 dark:text-red-400'}`}>
                  {value || s.missingValue}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">{s.twitterCardHeading}</h3>
        <div className="grid grid-cols-2 gap-3">
          {twitterFields.map(({ label, value }) => (
            <div
              key={label}
              className={`border rounded-xl p-3 ${value ? 'border-green-700/40 bg-green-500/5' : 'border-red-700/40 bg-red-500/5'}`}
            >
              <div className="text-xs font-mono text-muted-foreground mb-1">{label}</div>
              <div className="flex items-center gap-2">
                {value ? <CheckCircle className="h-3.5 w-3.5 text-green-700 dark:text-green-400 shrink-0" /> : <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400 shrink-0" />}
                <span className={`text-xs ${value ? 'text-foreground' : 'text-red-600 dark:text-red-400'}`}>
                  {value || s.missingValue}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {techStack.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">{s.detectedTech}</h3>
          <div className="flex flex-wrap gap-2">
            {techStack.map((t, i) => (
              <span
                key={i}
                className="text-xs bg-brand-900 border border-default text-foreground px-2.5 py-1 rounded-full font-mono"
              >
                {typeof t === 'object' ? (t.name || t.tech || JSON.stringify(t)) : t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
