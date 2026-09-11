import { useMemo } from 'react';
import { Share2 } from 'lucide-react';

export interface OGPreviewProps {
  url: string;
  ogTitle?: string | null;
  ogDesc?: string | null;
  ogImage?: string | null;
}

export default function OGPreview({ url, ogTitle, ogDesc, ogImage }: OGPreviewProps) {
  const domain = useMemo(() => {
    try { return new URL(url).hostname; } catch { return url; }
  }, [url]);

  return (
    <div className="border border-md-sys-outline-variant/40 rounded-xl overflow-hidden max-w-sm bg-md-sys-surface-container-low">
      {ogImage ? (
        <img
          src={ogImage}
          alt="OG"
          className="w-full h-36 object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <div className="w-full h-24 bg-md-sys-surface-container flex items-center justify-center">
          <Share2 className="h-8 w-8 text-md-sys-on-surface-variant" />
        </div>
      )}
      <div className="p-3">
        <p className="text-xs text-md-sys-on-surface-variant uppercase tracking-wider mb-1">{domain}</p>
        <p className="text-sm font-semibold text-md-sys-on-surface line-clamp-2">{ogTitle || 'No OG title set'}</p>
        <p className="text-xs text-md-sys-on-surface-variant mt-1 line-clamp-2">{ogDesc || 'No OG description set'}</p>
      </div>
    </div>
  );
}
