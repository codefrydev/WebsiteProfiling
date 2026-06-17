'use client';

import { useLandingDeckRequired } from '@/components/landing/LandingDeckContext';

export interface LandingSlideBadgeProps {
  label: string;
}

export default function LandingSlideBadge({ label }: LandingSlideBadgeProps) {
  const { presenterMode } = useLandingDeckRequired();

  if (!presenterMode || !label) return null;

  return (
    <span className="landing-slide-badge" aria-hidden>
      {label}
    </span>
  );
}
