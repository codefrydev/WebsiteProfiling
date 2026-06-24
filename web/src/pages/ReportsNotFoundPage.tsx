import { Link } from 'react-router-dom';
import { strings } from '@/lib/strings';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function ReportsNotFoundPage() {
  usePageTitle('Page not found · Site Audit');

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-900 text-foreground p-8">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-semibold text-bright">Page not found</h1>
        <p className="text-muted-foreground text-sm mt-2">
          That report view does not exist. Choose a valid section from the app.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/home"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
          >
            Go to Home
          </Link>
          <Link
            to="/pipeline"
            className="inline-flex items-center gap-2 rounded-lg border border-default px-4 py-2 text-sm font-medium text-foreground hover:bg-brand-700/80 transition-colors"
          >
            {strings.app.openRunAudit}
          </Link>
        </div>
      </div>
    </div>
  );
}
