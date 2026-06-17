'use client';

import {
  Cpu,
  Gauge,
  Key,
  Link2,
  MessageSquare,
  TrendingUp,
} from 'lucide-react';
import LandingHero from '@/components/landing/LandingHero';
import LandingFeatureSpotlight from '@/components/landing/LandingFeatureSpotlight';
import LandingFinalCta from '@/components/landing/LandingFinalCta';
import LandingFooter from '@/components/landing/LandingFooter';
import LandingGoogleSetup from '@/components/landing/LandingGoogleSetup';
import LandingLimitations from '@/components/landing/LandingLimitations';
import LandingPathStrip from '@/components/landing/LandingPathStrip';
import LandingQuickStart from '@/components/landing/LandingQuickStart';
import LandingPageSection from '@/components/landing/LandingPageSection';
import LandingSectionHeader from '@/components/landing/LandingSectionHeader';
import LandingShell from '@/components/LandingShell';
import LandingStatsStrip from '@/components/landing/LandingStatsStrip';
import LandingUseCases from '@/components/landing/LandingUseCases';
import { LANDING_SECTION_IDS, landingGutterClass } from '@/components/landing/landingLayout';
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
    <LandingShell
      footer={<LandingFooter />}
      backdrop={
        <>
          <div aria-hidden className="landing-grid-bg absolute inset-0 opacity-40" />
          <div aria-hidden className="aurora-bg absolute inset-0" />
        </>
      }
    >
      <LandingHero />

      <LandingPageSection id={LANDING_SECTION_IDS.stats} fullBleed>
        <LandingStatsStrip />
      </LandingPageSection>

      <LandingPageSection id={LANDING_SECTION_IDS.getStarted} fullBleed>
        <LandingPathStrip />
      </LandingPageSection>

      <LandingPageSection id={LANDING_SECTION_IDS.spotlights} fullBleed>
        <div className="flex min-h-0 w-full flex-1 flex-col justify-center gap-4">
          <div className={landingGutterClass}>
            <LandingSectionHeader
              eyebrow={vl.sectionCapabilities}
              title={vl.spotlightsSectionTitle}
              subtitle={vl.spotlightsSectionSubtitle}
              compact
            />
          </div>
          <LandingFeatureSpotlight
            eyebrow={vl.spotlight1Eyebrow}
            title={vl.spotlight1Title}
            description={vl.spotlight1Description}
            bullets={vl.spotlight1Bullets}
            mockVariant="crawl"
            ctaHref="/pipeline"
            ctaLabel={vl.spotlight1Cta}
          />
        </div>
      </LandingPageSection>

      <LandingPageSection id={LANDING_SECTION_IDS.spotlightIssues} fullBleed>
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
      </LandingPageSection>

      <LandingPageSection id={LANDING_SECTION_IDS.useCases}>
        <LandingUseCases />
      </LandingPageSection>

      <LandingPageSection id={LANDING_SECTION_IDS.quickStart} fullBleed>
        <LandingQuickStart />
      </LandingPageSection>

      <LandingPageSection id={LANDING_SECTION_IDS.googleSetup}>
        <LandingGoogleSetup />
      </LandingPageSection>

      <LandingPageSection id={LANDING_SECTION_IDS.features}>
        <div className="w-full min-w-0">
          <LandingSectionHeader
            eyebrow={vl.sectionCapabilities}
            title={vl.featuresTitle}
            subtitle={vl.featuresSubtitle}
            compact
          />
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <article
                key={title}
                className="group rounded-xl border border-default/60 p-3 transition-colors hover:border-blue-500/25"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center text-link">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                <h3 className="mt-2 text-xs font-semibold text-foreground sm:text-sm">{title}</h3>
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </LandingPageSection>

      <LandingPageSection id={LANDING_SECTION_IDS.limitations} fullBleed>
        <LandingLimitations />
      </LandingPageSection>

      <LandingPageSection
        id={LANDING_SECTION_IDS.finalCta}
        fullBleed
        className="border-t border-muted/40"
      >
        <LandingFinalCta />
      </LandingPageSection>
    </LandingShell>
  );
}
