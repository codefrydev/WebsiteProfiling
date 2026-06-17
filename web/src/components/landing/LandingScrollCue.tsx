'use client';

import { ChevronDown } from 'lucide-react';

interface LandingScrollCueProps {
  href: string;
  label?: string;
}

export default function LandingScrollCue({
  href,
  label = 'Scroll to next section',
}: LandingScrollCueProps) {
  return (
    <a
      href={href}
      className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      aria-label={label}
    >
      <span className="sr-only">{label}</span>
      <ChevronDown className="landing-scroll-cue h-5 w-5" aria-hidden />
    </a>
  );
}
