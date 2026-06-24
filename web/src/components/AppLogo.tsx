
import { useBranding } from '@/context/useBranding';

interface AppLogoProps {
  className?: string;
  size?: number;
}

/** App mark. Uses custom logo from branding settings when set; falls back to /logo.svg. */
export default function AppLogo({ className = '', size = 24 }: AppLogoProps) {
  const { logoUrl } = useBranding();
  const src = logoUrl || '/logo.svg';
  // The default /logo.svg is a black mark — invert it for the dark sidebar.
  // Custom logos are shown as-is (user chose them).
  const filter = !logoUrl ? 'shrink-0 brightness-0 invert' : 'shrink-0 object-contain';

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={`${filter} ${className}`.trim()}
      aria-hidden
    />
  );
}
