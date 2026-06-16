import Link from 'next/link';
import { ChevronRight, type LucideIcon } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: LucideIcon;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

/**
 * Compact breadcrumb trail. The last item is treated as the current page.
 * Shared by the global app header and the pipeline header for a consistent
 * "you are here" affordance.
 */
export default function Breadcrumb({ items, className = '' }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={`flex min-w-0 items-center ${className}`.trim()}>
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          const Icon = item.icon;
          const inner = (
            <span className="flex min-w-0 items-center gap-1.5">
              {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden /> : null}
              <span className="truncate">{item.label}</span>
            </span>
          );
          return (
            <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 ? (
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
                  aria-hidden
                />
              ) : null}
              {isLast ? (
                <span aria-current="page" className="min-w-0 font-semibold text-bright">
                  {inner}
                </span>
              ) : item.href ? (
                <Link
                  href={item.href}
                  className="min-w-0 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {inner}
                </Link>
              ) : (
                <span className="min-w-0 text-muted-foreground">{inner}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
