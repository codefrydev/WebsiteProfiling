interface AppLogoProps {
  className?: string;
  size?: number;
}

/** Codefrydev mark — inverted for dark sidebar surfaces. */
export default function AppLogo({ className = '', size = 24 }: AppLogoProps) {
  return (
    <img
      src="/logo.svg"
      alt=""
      width={size}
      height={size}
      className={`shrink-0 brightness-0 invert ${className}`.trim()}
      aria-hidden
    />
  );
}
