import { Link } from 'react-router-dom';
import { strings } from '@/lib/strings';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function ReportsNotFoundPage() {
  usePageTitle('Page not found · Site Audit');

  return (
    <div className="min-h-screen flex items-center justify-center bg-md-sys-surface-container-low text-md-sys-on-surface p-8">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-semibold text-md-sys-on-surface">Page not found</h1>
        <p className="text-md-sys-on-surface-variant text-sm mt-2">
          That report view does not exist. Choose a valid section from the app.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/home"
            className="press inline-flex items-center gap-2 rounded-full bg-md-sys-primary px-5 py-2.5 text-sm font-medium text-md-sys-on-primary hover:brightness-105 active:scale-[0.98] transition-all duration-200"
          >
            Go to Home
          </Link>
          <Link
            to="/pipeline"
            className="press inline-flex items-center gap-2 rounded-full border border-md-sys-outline-variant/50 bg-md-sys-surface-container-high/40 px-5 py-2.5 text-sm font-medium text-md-sys-on-surface hover:bg-md-sys-surface-container-highest active:scale-[0.98] transition-all duration-200"
          >
            {strings.app.openRunAudit}
          </Link>
        </div>
      </div>
    </div>
  );
}
