import { Shield, Zap, Image } from 'lucide-react';
import SecHeaderRow from '../SecHeaderRow';
import MiniBar from '../MiniBar';

const SEC_HEADERS = [
  {
    label: 'Strict-Transport-Security',
    field: 'strict_transport_security',
    rec: 'Set HSTS with max-age of at least 31536000 to enforce HTTPS.',
  },
  {
    label: 'X-Content-Type-Options',
    field: 'x_content_type_options',
    rec: 'Set to "nosniff" to prevent MIME-type sniffing attacks.',
  },
  {
    label: 'X-Frame-Options',
    field: 'x_frame_options',
    rec: 'Set to "SAMEORIGIN" or "DENY" to prevent clickjacking.',
  },
  {
    label: 'Content-Security-Policy',
    field: 'content_security_policy',
    rec: 'Define a strict CSP to reduce XSS attack surface.',
  },
];

export default function TechnicalTab({ link }) {
  const perfRows = [
    { label: 'Cache-Control', value: link.cache_control || 'Not set', mono: true },
    { label: 'ETag',          value: link.etag ? 'Present' : 'Not set' },
    { label: 'Scripts',       value: String(link.script_count ?? 0) },
    { label: 'Stylesheets',   value: String(link.link_stylesheet_count ?? 0) },
    {
      label: 'Mixed Content',
      value: link.mixed_content_count > 0 ? `${link.mixed_content_count} item(s)` : 'None',
      warn: link.mixed_content_count > 0,
    },
  ];

  const imgTotal = link.images_total || 0;

  return (
    <div className="space-y-6">
      {/* Security Headers */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Shield className="h-3.5 w-3.5" /> Security Headers
        </h3>
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

      {/* Performance & Caching */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Zap className="h-3.5 w-3.5" /> Performance & Caching
        </h3>
        <div className="space-y-2">
          {perfRows.map(({ label, value, mono, warn }) => (
            <div
              key={label}
              className="bg-brand-900 border border-default rounded-lg flex items-center justify-between px-4 py-2.5"
            >
              <span className="text-sm text-slate-400">{label}</span>
              <span className={`text-sm ${mono ? 'font-mono' : ''} ${warn ? 'text-red-400' : 'text-slate-200'}`}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Images & Accessibility */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Image className="h-3.5 w-3.5" /> Images & Accessibility
        </h3>
        <div className="bg-brand-900 border border-default rounded-xl p-4 space-y-3">
          <MiniBar
            value={imgTotal}
            total={Math.max(imgTotal, 1)}
            label="Total Images"
            color="bg-blue-500"
          />
          <MiniBar
            value={link.images_without_alt || 0}
            total={Math.max(imgTotal, 1)}
            label="Missing Alt"
            color={link.images_without_alt > 0 ? 'bg-red-500' : 'bg-green-500'}
          />
          <MiniBar
            value={link.img_without_lazy || 0}
            total={Math.max(imgTotal, 1)}
            label="No Lazy Load"
            color={link.img_without_lazy > 0 ? 'bg-yellow-500' : 'bg-green-500'}
          />
          <div className="flex items-center justify-between pt-2 border-t border-muted">
            <span className="text-sm text-slate-400">ARIA Elements</span>
            <span className="text-sm text-slate-200 font-mono">{link.aria_count ?? 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
