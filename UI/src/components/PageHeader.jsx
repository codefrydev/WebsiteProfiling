/**
 * Consistent page title and optional subtitle.
 */
export default function PageHeader({ title, subtitle }) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-bold text-bright mb-2">{title}</h1>
      {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
