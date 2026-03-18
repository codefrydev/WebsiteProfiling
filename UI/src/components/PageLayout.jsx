/**
 * Page wrapper with consistent padding. Optional max-width for focused views (e.g. Lighthouse).
 */
export default function PageLayout({ children, className = '', maxWidth = false }) {
  const maxWidthClass = maxWidth ? 'max-w-6xl mx-auto' : '';
  return (
    <div className={`p-6 lg:p-8 ${maxWidthClass} ${className}`.trim()}>
      {children}
    </div>
  );
}
