import { useMemo } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { parseTechStack } from '../../../utils/linkUtils';
import CopyBtn from '../CopyBtn';
import OGPreview from '../OGPreview';

export default function SeoSocialTab({ link }) {
  const techStack = useMemo(() => parseTechStack(link.tech_stack), [link.tech_stack]);

  const flagItems = [
    { label: 'Noindex',    value: link.noindex,          bad: true },
    { label: 'Has Schema', value: link.has_schema,        bad: false },
    { label: 'Viewport',   value: link.viewport_present,  bad: false },
  ];

  const ogFields = [
    { label: 'og:title',       value: link.og_title },
    { label: 'og:description', value: link.og_description },
    { label: 'og:type',        value: link.og_type },
    { label: 'og:image',       value: link.og_image },
  ];

  const twitterFields = [
    { label: 'twitter:card',  value: link.twitter_card },
    { label: 'twitter:title', value: link.twitter_title },
    { label: 'twitter:image', value: link.twitter_image },
  ];

  return (
    <div className="space-y-6">
      {/* Canonical */}
      <div className="bg-brand-900 border border-default rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500">Canonical URL</div>
          <CopyBtn text={link.canonical_url} />
        </div>
        {link.canonical_url ? (
          <a
            href={link.canonical_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-mono text-blue-400 hover:underline break-all"
          >
            {link.canonical_url}
          </a>
        ) : (
          <span className="text-xs text-red-400">Not set</span>
        )}
      </div>

      {/* Flag grid */}
      <div className="grid grid-cols-3 gap-3">
        {flagItems.map(({ label, value, bad }) => (
          <div key={label} className="bg-brand-900 border border-default rounded-xl p-3 flex flex-col items-center gap-2">
            <div className="text-xs text-slate-500">{label}</div>
            {value
              ? (bad ? <XCircle className="h-6 w-6 text-red-400" /> : <CheckCircle className="h-6 w-6 text-green-400" />)
              : (bad ? <CheckCircle className="h-6 w-6 text-green-400" /> : <XCircle className="h-6 w-6 text-red-400" />)}
            <span className={`text-xs font-semibold ${value === bad ? 'text-red-400' : 'text-green-400'}`}>
              {value ? 'Yes' : 'No'}
            </span>
          </div>
        ))}
      </div>

      {/* Open Graph */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Open Graph</h3>
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
                  <span className="text-xs font-mono text-slate-500">{label}</span>
                  {value && <CopyBtn text={value} />}
                </div>
                <span className={`text-xs ${value ? 'text-slate-300' : 'text-red-400'}`}>
                  {value || 'Missing'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Twitter Card */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Twitter / X Card</h3>
        <div className="grid grid-cols-2 gap-3">
          {twitterFields.map(({ label, value }) => (
            <div
              key={label}
              className={`border rounded-xl p-3 ${value ? 'border-green-700/40 bg-green-500/5' : 'border-red-700/40 bg-red-500/5'}`}
            >
              <div className="text-xs font-mono text-slate-500 mb-1">{label}</div>
              <div className="flex items-center gap-2">
                {value
                  ? <CheckCircle className="h-3.5 w-3.5 text-green-400 shrink-0" />
                  : <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                <span className={`text-xs ${value ? 'text-slate-300' : 'text-red-400'}`}>
                  {value || 'Missing'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tech Stack */}
      {techStack.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Detected Tech</h3>
          <div className="flex flex-wrap gap-2">
            {techStack.map((t, i) => (
              <span
                key={i}
                className="text-xs bg-brand-900 border border-default text-slate-300 px-2.5 py-1 rounded-full font-mono"
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
