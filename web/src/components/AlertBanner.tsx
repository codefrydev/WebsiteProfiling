
import { useState, type ReactNode } from 'react';
import { AlertTriangle, Info, XCircle, CheckCircle, X, ChevronRight, ChevronDown } from 'lucide-react';

export type AlertBannerVariant = 'warning' | 'info' | 'error' | 'success';

const VARIANT_STYLES: Record<
  AlertBannerVariant,
  { container: string; text: string; defaultIcon: typeof AlertTriangle }
> = {
  warning: {
    container: 'border-md-sys-tertiary/40 bg-md-sys-tertiary-container/30',
    text: 'text-md-sys-on-tertiary-container',
    defaultIcon: AlertTriangle,
  },
  info: {
    container: 'border-md-sys-primary/30 bg-md-sys-primary-container/20',
    text: 'text-md-sys-on-surface',
    defaultIcon: Info,
  },
  error: {
    container: 'border-md-sys-error/40 bg-md-sys-error-container/40',
    text: 'text-md-sys-on-error-container',
    defaultIcon: XCircle,
  },
  success: {
    container: 'border-md-sys-success/40 bg-md-sys-success-container/30',
    text: 'text-md-sys-on-success-container',
    defaultIcon: CheckCircle,
  },
};

export interface AlertBannerProps {
  variant?: AlertBannerVariant;
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  onDismiss?: () => void;
  className?: string;
  role?: 'status' | 'alert';
  /** When true, title becomes a toggle and children render in a collapsible body. */
  collapsible?: boolean;
  /** Initial open state for collapsible banners. Defaults to false. */
  defaultOpen?: boolean;
}

export default function AlertBanner({
  variant = 'warning',
  icon,
  title,
  children,
  onDismiss,
  className = '',
  role,
  collapsible = false,
  defaultOpen = false,
}: AlertBannerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const resolvedRole = role ?? (variant === 'error' ? 'alert' : 'status');
  const styles = VARIANT_STYLES[variant];
  const DefaultIcon = styles.defaultIcon;
  const iconNode = icon ?? <DefaultIcon className="h-5 w-5 shrink-0 text-current opacity-80" aria-hidden />;

  const containerClass = `rounded-2xl border text-sm ${styles.container} ${styles.text} ${className}`.trim();

  if (collapsible && title) {
    const Chevron = open ? ChevronDown : ChevronRight;
    return (
      <div className={`${containerClass} overflow-hidden`} role={resolvedRole}>
        <div className="flex items-stretch">
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="flex-1 min-w-0 flex items-center gap-2 text-left px-4 py-3 font-semibold hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors"
            aria-expanded={open}
          >
            <Chevron className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
            {iconNode}
            <span className="flex-1 min-w-0">{title}</span>
          </button>
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className="press shrink-0 self-center mr-3 p-1 rounded-full opacity-70 hover:opacity-100 hover:bg-current/10 active:scale-95 transition-all"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {open && children ? (
          <div className="px-4 pb-3 pt-0 space-y-1 border-t border-current/10">{children}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`${containerClass} px-4 py-3`} role={resolvedRole}>
      <div className="flex gap-2">
        <div className="shrink-0 mt-0.5">{iconNode}</div>
        <div className="flex-1 min-w-0 space-y-1">
          {title ? <p className="font-medium">{title}</p> : null}
          {children}
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="press shrink-0 self-start p-1 rounded-full opacity-70 hover:opacity-100 hover:bg-current/10 active:scale-95 transition-all"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
