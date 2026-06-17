'use client';

import type { ReactNode } from 'react';
import Reveal from '@/components/Reveal';
import LandingSlideBadge from '@/components/landing/LandingSlideBadge';
import {
  landingContentClass,
  landingGutterClass,
  landingSectionBodyCenteredClass,
  landingSectionBodyClass,
  landingSectionClass,
  landingSectionPad,
} from '@/components/landing/landingLayout';
import { strings } from '@/lib/strings';

export interface LandingPageSectionProps {
  id?: string;
  /** Edge-to-edge layout (hero / spotlight splits). Skips outer gutters. */
  fullBleed?: boolean;
  className?: string;
  children: ReactNode;
}

function slideBadgeForId(id: string | undefined): string {
  if (!id) return '';
  const badges = strings.views.landing.deckBadges as Record<string, string> | undefined;
  return badges?.[id] ?? '';
}

export default function LandingPageSection({
  id,
  fullBleed = false,
  className = '',
  children,
}: LandingPageSectionProps) {
  const bodyClass = fullBleed
    ? `${landingSectionBodyClass} ${landingContentClass}`
    : `${landingSectionBodyCenteredClass} ${landingContentClass} ${landingGutterClass}`;

  const badge = slideBadgeForId(id);

  return (
    <Reveal
      as="section"
      id={id}
      className={`${landingSectionClass} ${landingSectionPad} ${className}`.trim()}
    >
      {badge ? <LandingSlideBadge label={badge} /> : null}
      <div className={bodyClass}>{children}</div>
    </Reveal>
  );
}
