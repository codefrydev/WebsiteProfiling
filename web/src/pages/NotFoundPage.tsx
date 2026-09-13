import { Link } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function NotFoundPage() {
  usePageTitle('Not found · Site Audit');

  return (
    <div className="min-h-screen flex items-center justify-center bg-md-sys-surface-container-low text-md-sys-on-surface p-8">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-semibold text-md-sys-on-surface">Page not found</h1>
        <p className="text-md-sys-on-surface-variant text-sm mt-2">The page you requested does not exist.</p>
        <Link
          to="/"
          className="press mt-6 inline-flex items-center gap-2 rounded-full bg-md-sys-primary px-5 py-2.5 text-sm font-medium text-md-sys-on-primary hover:brightness-105 active:scale-[0.98] transition-all duration-200"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
