/**
 * Standard card container: bg-brand-800, border, rounded-xl, padding.
 * Use shadow for stat cards, overflowHidden for table wrappers.
 */
export default function Card({
  children,
  className = '',
  padding = 'default',
  shadow = false,
  overflowHidden = false,
}) {
  const paddingClass = padding === 'none' ? '' : padding === 'tight' ? 'p-4' : 'p-5';
  const shadowClass = shadow ? 'shadow-sm' : '';
  const overflowClass = overflowHidden ? 'overflow-hidden' : '';
  return (
    <div
      className={`bg-brand-800 border border-slate-700 rounded-xl ${paddingClass} ${shadowClass} ${overflowClass} ${className}`.trim()}
    >
      {children}
    </div>
  );
}
