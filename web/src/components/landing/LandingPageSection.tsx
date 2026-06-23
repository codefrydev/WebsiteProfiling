
import type { ReactNode } from 'react';
import Reveal from '@/components/Reveal';
import {
  landingContentClass,
  landingGutterClass,
  landingSectionBodyCenteredClass,
  landingSectionBodyClass,
  landingSectionClass,
  landingSectionPad,
} from '@/components/landing/landingLayout';

export interface LandingPageSectionProps {
  id?: string;
  /** Edge-to-edge layout (hero / spotlight splits). Skips outer gutters. */
  fullBleed?: boolean;
  className?: string;
  children: ReactNode;
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

  return (
    <Reveal
      as="section"
      id={id}
      className={`${landingSectionClass} ${landingSectionPad} ${className}`.trim()}
    >
      <div className={bodyClass}>{children}</div>
    </Reveal>
  );
}
