
import LandingHero from '@/components/landing/LandingHero';
import LandingFeatureSpotlight from '@/components/landing/LandingFeatureSpotlight';
import LandingFeatures from '@/components/landing/LandingFeatures';
import LandingFinalCta from '@/components/landing/LandingFinalCta';
import LandingFooter from '@/components/landing/LandingFooter';
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

      <LandingPageSection id={LANDING_SECTION_IDS.quickStart} fullBleed>
        <LandingQuickStart />
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

      <LandingPageSection id={LANDING_SECTION_IDS.spotlightPromptGenerator} fullBleed>
        <LandingFeatureSpotlight
          eyebrow={vl.spotlightPromptEyebrow}
          title={vl.spotlightPromptTitle}
          description={vl.spotlightPromptDescription}
          bullets={vl.spotlightPromptBullets}
          mockVariant="promptGenerator"
          ctaHref={vl.spotlightPromptCtaHref}
          ctaLabel={vl.spotlightPromptCta}
        />
      </LandingPageSection>

      <LandingPageSection id={LANDING_SECTION_IDS.spotlightGoogle} fullBleed>
        <LandingFeatureSpotlight
          eyebrow={vl.spotlight3Eyebrow}
          title={vl.spotlight3Title}
          description={vl.spotlight3Description}
          bullets={vl.spotlight3Bullets}
          mockVariant="google"
          ctaHref={vl.spotlight3CtaHref}
          ctaLabel={vl.spotlight3Cta}
          secondaryCtaHref={vl.spotlight3SecondaryCtaHref}
          secondaryCtaLabel={vl.spotlight3SecondaryCta}
          secondaryCtaExternal
        />
      </LandingPageSection>

      <LandingPageSection id={LANDING_SECTION_IDS.spotlightContentStudio} fullBleed>
        <LandingFeatureSpotlight
          eyebrow={vl.spotlight4Eyebrow}
          title={vl.spotlight4Title}
          description={vl.spotlight4Description}
          bullets={vl.spotlight4Bullets}
          mockVariant="contentStudio"
          ctaHref={vl.spotlight4CtaHref}
          ctaLabel={vl.spotlight4Cta}
          reversed
        />
      </LandingPageSection>

      <LandingPageSection id={LANDING_SECTION_IDS.spotlightAiChat} fullBleed>
        <LandingFeatureSpotlight
          eyebrow={vl.spotlight5Eyebrow}
          title={vl.spotlight5Title}
          description={vl.spotlight5Description}
          bullets={vl.spotlight5Bullets}
          mockVariant="aiChat"
          ctaHref={vl.spotlight5CtaHref}
          ctaLabel={vl.spotlight5Cta}
        />
      </LandingPageSection>

      <LandingPageSection id={LANDING_SECTION_IDS.spotlightCompareExport} fullBleed>
        <LandingFeatureSpotlight
          eyebrow={vl.spotlight6Eyebrow}
          title={vl.spotlight6Title}
          description={vl.spotlight6Description}
          bullets={vl.spotlight6Bullets}
          mockVariant="compareExport"
          ctaHref={vl.spotlight6CtaHref}
          ctaLabel={vl.spotlight6Cta}
          reversed
        />
      </LandingPageSection>

      <LandingPageSection id={LANDING_SECTION_IDS.useCases}>
        <LandingUseCases />
      </LandingPageSection>

      <LandingPageSection id={LANDING_SECTION_IDS.features}>
        <LandingFeatures />
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
