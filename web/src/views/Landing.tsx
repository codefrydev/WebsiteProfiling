'use client';

import {
  Cpu,
  Gauge,
  Key,
  Link2,
  MessageSquare,
  TrendingUp,
} from 'lucide-react';
import Reveal from '@/components/Reveal';
import LandingHero from '@/components/landing/LandingHero';
import LandingCodeBlock from '@/components/landing/LandingCodeBlock';
import LandingFeatureSpotlight from '@/components/landing/LandingFeatureSpotlight';
import LandingFinalCta from '@/components/landing/LandingFinalCta';
import LandingFooter from '@/components/landing/LandingFooter';
import LandingGoogleSetup from '@/components/landing/LandingGoogleSetup';
import LandingLimitations from '@/components/landing/LandingLimitations';
import LandingPathStrip from '@/components/landing/LandingPathStrip';
import LandingSectionHeader from '@/components/landing/LandingSectionHeader';
import LandingShell from '@/components/LandingShell';
import LandingStatsStrip from '@/components/landing/LandingStatsStrip';
import LandingUseCases from '@/components/landing/LandingUseCases';
import { strings } from '@/lib/strings';

const vl = strings.views.landing;

const FEATURES = [
  { icon: Gauge, title: vl.featureOnPageTitle, description: vl.featureOnPageDescription },
  { icon: TrendingUp, title: vl.featureSearchTitle, description: vl.featureSearchDescription },
  { icon: Key, title: vl.featureKeywordsTitle, description: vl.featureKeywordsDescription },
  { icon: Link2, title: vl.featureLinksTitle, description: vl.featureLinksDescription },
  { icon: MessageSquare, title: vl.featureAiTitle, description: vl.featureAiDescription },
  { icon: Cpu, title: vl.featureSelfHostedTitle, description: vl.featureSelfHostedDescription },
] as const;

export default function LandingPage() {
  return (
    <LandingShell footer={<LandingFooter />}>
      <div className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 landing-grid-bg opacity-40" />
        <div aria-hidden className="aurora-bg" />

        <LandingHero />
      </div>

      <Reveal>
        <LandingStatsStrip />
      </Reveal>
      <Reveal>
        <LandingPathStrip />
      </Reveal>

      <Reveal as="section" id="spotlights" className="scroll-mt-24 landing-section-alt border-y border-muted/60 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl space-y-16 px-[var(--spacing-page-x)] sm:space-y-20 sm:px-6 lg:px-8">
          <LandingSectionHeader
            eyebrow={vl.sectionCapabilities}
            title={vl.spotlightsSectionTitle}
            subtitle={vl.spotlightsSectionSubtitle}
          />
          <LandingFeatureSpotlight
            eyebrow={vl.spotlight1Eyebrow}
            title={vl.spotlight1Title}
            description={vl.spotlight1Description}
            bullets={vl.spotlight1Bullets}
            mockVariant="crawl"
            ctaHref="/pipeline"
            ctaLabel={vl.spotlight1Cta}
          />
          <LandingFeatureSpotlight
            eyebrow={vl.spotlight2Eyebrow}
            title={vl.spotlight2Title}
            description={vl.spotlight2Description}
            bullets={vl.spotlight2Bullets}
            mockVariant="issues"
            ctaHref="/home"
            ctaLabel={vl.spotlight2Cta}
            reversed
          />
        </div>
      </Reveal>

      <Reveal>
        <LandingUseCases />
      </Reveal>

      <Reveal
        as="section"
        id="quick-start"
        className="scroll-mt-24 mx-auto max-w-6xl px-[var(--spacing-page-x)] py-16 sm:px-6 sm:py-20 lg:px-8"
      >
        <LandingSectionHeader
          eyebrow={vl.sectionGettingStarted}
          title={vl.quickStartTitle}
          subtitle={vl.quickStartSubtitle}
          centered={false}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <LandingCodeBlock label={vl.quickStartDockerLabel} command={vl.quickStartDockerCommand} />
          <div className="space-y-4">
            <LandingCodeBlock label={vl.quickStartLocalLabel} command={vl.quickStartLocalSetup} />
            <LandingCodeBlock command={vl.quickStartLocalRun} />
          </div>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">{vl.quickStartDocsHint}</p>
      </Reveal>

      <Reveal>
        <LandingGoogleSetup />
      </Reveal>

      <Reveal
        as="section"
        id="features"
        className="scroll-mt-24 landing-section-alt border-y border-muted/60 py-16 sm:px-6 sm:py-20"
      >
        <div className="mx-auto max-w-6xl px-[var(--spacing-page-x)] lg:px-8">
          <LandingSectionHeader
            eyebrow={vl.sectionCapabilities}
            title={vl.featuresTitle}
            subtitle={vl.featuresSubtitle}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <article
                key={title}
                className="hover-lift group relative rounded-2xl border border-default bg-brand-800/40 p-5 hover:border-blue-500/30 hover:bg-brand-800/60"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-default bg-brand-900/80 text-link transition-colors group-hover:border-blue-500/40 group-hover:text-link">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </Reveal>

      <Reveal>
        <LandingLimitations />
      </Reveal>
      <Reveal>
        <LandingFinalCta />
      </Reveal>
    </LandingShell>
  );
}
