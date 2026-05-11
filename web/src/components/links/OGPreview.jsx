import { useMemo } from 'react';
import { Share2 } from 'lucide-react';

export default function OGPreview({ url, ogTitle, ogDesc, ogImage }) {
  const domain = useMemo(() => {
    try { return new URL(url).hostname; } catch { return url; }
  }, [url]);

  return (
    <div className="border border-default rounded-xl overflow-hidden max-w-sm bg-brand-900">
      {ogImage ? (
        <img
          src={ogImage}
          alt="OG"
          className="w-full h-36 object-cover"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      ) : (
        <div className="w-full h-24 bg-brand-800 flex items-center justify-center">
          <Share2 className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      <div className="p-3">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{domain}</p>
        <p className="text-sm font-semibold text-bright line-clamp-2">{ogTitle || 'No OG title set'}</p>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ogDesc || 'No OG description set'}</p>
      </div>
    </div>
  );
}
