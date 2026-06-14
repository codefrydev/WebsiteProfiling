'use client';

import Link from 'next/link';
import {
  ArrowDown,
  Check,
  Cpu,
  Gauge,
  Key,
  Link2,
  MessageSquare,
  TrendingUp,
} from 'lucide-react';
import AppLogo from '@/components/AppLogo';
import Button from '@/components/Button';
import LandingCodeBlock from '@/components/landing/LandingCodeBlock';
import LandingFeatureSpotlight from '@/components/landing/LandingFeatureSpotlight';
import LandingFinalCta from '@/components/landing/LandingFinalCta';
import LandingFooter from '@/components/landing/LandingFooter';
import LandingGoogleSetup from '@/components/landing/LandingGoogleSetup';
import LandingLimitations from '@/components/landing/LandingLimitations';
import LandingPathStrip from '@/components/landing/LandingPathStrip';
import LandingProductMock from '@/components/landing/LandingProductMock';
import LandingSectionHeader from '@/components/landing/LandingSectionHeader';
import LandingShell from '@/components/LandingShell';
import LandingStatsStrip from '@/components/landing/LandingStatsStrip';
import LandingUseCases from '@/components/landing/LandingUseCases';
import { strings } from '@/lib/strings';

const vl = strings.views.landing;

const HERO_PROOF = [vl.heroProofNoSubscription, vl.heroProofLocalData, vl.heroProofExport] as const;

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
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-blue-500/12 blur-3xl" />
          <div className="absolute top-10 right-0 h-[28rem] w-[28rem] rounded-full bg-violet-500/10 blur-3xl" />
          <div className="absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-cyan-500/8 blur-3xl" />
          <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 via-transparent to-brand-900/30" />
        </div>

        <section className="mx-auto grid max-w-6xl gap-10 px-[var(--spacing-page-x)] pb-6 pt-10 sm:px-6 sm:pt-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14 lg:px-8 lg:pt-16 lg:pb-10">
          <div className="text-center lg:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              <span className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-link">
                {vl.heroBadge}
              </span>
            </div>
            <div className="mt-5 flex items-center justify-center gap-2.5 lg:justify-start">
              <AppLogo size={36} className="opacity-95" />
              <span className="text-sm font-semibold text-muted-foreground">{strings.app.productName}</span>
            </div>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-bright sm:text-5xl lg:text-[3.25rem] lg:leading-[1.08]">
              {vl.heroTitleLine1}
              <span className="mt-1 block landing-gradient-text">{vl.heroTitleAccent}</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground lg:mx-0">
              {vl.heroSubtitle}
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <Link href="/pipeline">
                <Button variant="primary" className="px-7 py-2.5 text-sm sm:text-base">
                  {vl.ctaRunAudit}
                </Button>
              </Link>
              <Link href="/home">
                <Button variant="secondary" className="px-7 py-2.5 text-sm sm:text-base">
                  {vl.ctaDashboard}
                </Button>
              </Link>
            </div>
            <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 lg:justify-start">
              {HERO_PROOF.map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Check className="h-3.5 w-3.5 text-emerald-500/90" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
            <a
              href="#get-started"
              className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowDown className="h-3.5 w-3.5" aria-hidden />
              {vl.scrollHint}
            </a>
          </div>

          <div className="landing-mock-glow landing-float mx-auto w-full max-w-lg lg:max-w-none">
            <LandingProductMock variant="default" className="w-full" elevated />
          </div>
        </section>
      </div>

      <LandingStatsStrip />
      <LandingPathStrip />

      <section
        id="spotlights"
        className="scroll-mt-24 landing-section-alt border-y border-muted/60 py-16 sm:py-20"
      >
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
      </section>

      <LandingUseCases />

      <section
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
      </section>

      <LandingGoogleSetup />

      <section
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
                className="rounded-2xl border border-default bg-brand-800/40 p-5 transition-all hover:-translate-y-0.5 hover:border-blue-500/30 hover:bg-brand-800/60 hover:shadow-[var(--shadow-elevated)]"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-default bg-brand-900/80">
                  <Icon className="h-4 w-4 text-link" aria-hidden />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <LandingLimitations />
      <LandingFinalCta />
    </LandingShell>
  );
}
