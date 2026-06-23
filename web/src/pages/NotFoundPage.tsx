import { Link } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function NotFoundPage() {
  usePageTitle('Not found · Site Audit');

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-900 text-foreground p-8">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-semibold text-bright">Page not found</h1>
        <p className="text-muted-foreground text-sm mt-2">The page you requested does not exist.</p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
