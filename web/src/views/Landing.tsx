'use client';

import Link from 'next/link';
import {
  AlertOctagon,
  ArrowDown,
  BarChart2,
  ChevronRight,
  Cpu,
  FolderTree,
  Gauge,
  Key,
  Link2,
  MessageSquare,
  Play,
  Settings2,
  TrendingUp,
} from 'lucide-react';
import AppLogo from '@/components/AppLogo';
import Button from '@/components/Button';
import LandingGoogleSetup from '@/components/landing/LandingGoogleSetup';
import LandingPathStrip from '@/components/landing/LandingPathStrip';
import LandingSectionHeader from '@/components/landing/LandingSectionHeader';
import LandingShell from '@/components/LandingShell';
import { strings } from '@/lib/strings';

const vl = strings.views.landing;
const app = strings.app;

const FEATURES = [
  { icon: FolderTree, title: vl.featureCrawlTitle, description: vl.featureCrawlDescription },
  { icon: AlertOctagon, title: vl.featureIssuesTitle, description: vl.featureIssuesDescription },
  { icon: Gauge, title: vl.featureOnPageTitle, description: vl.featureOnPageDescription },
  { icon: TrendingUp, title: vl.featureSearchTitle, description: vl.featureSearchDescription },
  { icon: Key, title: vl.featureKeywordsTitle, description: vl.featureKeywordsDescription },
  { icon: Link2, title: vl.featureLinksTitle, description: vl.featureLinksDescription },
  { icon: MessageSquare, title: vl.featureAiTitle, description: vl.featureAiDescription },
  { icon: Cpu, title: vl.featureSelfHostedTitle, description: vl.featureSelfHostedDescription },
] as const;

const STEPS = [
  {
    step: 1,
    icon: Play,
    title: vl.step1Title,
    description: vl.step1Description,
    href: '/pipeline',
    linkLabel: vl.ctaRunAudit,
  },
  {
    step: 2,
    icon: Settings2,
    title: vl.step2Title,
    description: vl.step2Description,
    href: '#google-setup',
    linkLabel: vl.step2Link,
  },
  {
    step: 3,
    icon: BarChart2,
    title: vl.step3Title,
    description: vl.step3Description,
    href: '/home',
    linkLabel: vl.step3Link,
  },
] as const;

function CodeBlock({ label, command }: { label?: string; command: string }) {
  return (
    <div className="rounded-xl border border-default bg-brand-900/60 p-4">
      {label ? (
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      ) : null}
      <pre className="overflow-x-auto font-mono text-sm text-foreground">
        <code>{command}</code>
      </pre>
    </div>
  );
}

export default function LandingPage() {
  const footer = (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-[var(--spacing-page-x)] py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
      <div>
        <p className="font-semibold text-foreground">{app.productName}</p>
        <p className="text-sm text-muted-foreground">{app.productSubtitle}</p>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/home" className="text-link hover:underline">
          {vl.footerOpenApp}
        </Link>
        <Link href="/pipeline" className="text-link hover:underline">
          {vl.footerRunAudit}
        </Link>
        <Link href="/chat" className="text-link hover:underline">
          {vl.footerChat}
        </Link>
      </div>
    </div>
  );

  return (
    <LandingShell footer={footer}>
      <div className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-28 -left-20 h-72 w-72 rounded-full bg-blue-500/15 blur-3xl" />
          <div className="absolute top-16 right-0 h-80 w-80 rounded-full bg-violet-500/12 blur-3xl" />
          <div className="absolute inset-0 bg-gradient-to-b from-brand-900/15 via-transparent to-brand-900/20" />
        </div>

        <section className="mx-auto grid max-w-6xl gap-8 px-[var(--spacing-page-x)] pb-6 pt-8 sm:px-6 sm:pt-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-12 lg:px-8 lg:pt-12">
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-link">
              {vl.heroBadge}
            </span>
            <div className="mt-4 mb-4 flex justify-center lg:justify-start">
              <AppLogo size={40} className="opacity-90" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {vl.heroTitle}
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base lg:mx-0">
              {vl.heroSubtitle}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <Link href="/pipeline">
                <Button variant="primary" className="px-6 py-2.5">
                  {vl.ctaRunAudit}
                </Button>
              </Link>
              <Link href="/home">
                <Button variant="secondary" className="px-6 py-2.5">
                  {vl.ctaDashboard}
                </Button>
              </Link>
            </div>
            <a
              href="#how-it-works"
              className="mt-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowDown className="h-3.5 w-3.5" aria-hidden />
              {vl.scrollHint}
            </a>
          </div>

          <div className="rounded-2xl border border-default bg-brand-800/50 p-4 sm:p-5">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {vl.pathTitle}
            </p>
            <ol className="space-y-3">
              {STEPS.map(({ step, title, description, href, linkLabel }) => (
                <li key={step}>
                  <a
                    href={href}
                    className="group flex items-start gap-3 rounded-lg border border-transparent p-2 transition-colors hover:border-default hover:bg-brand-900/40"
                  >
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-xs font-bold text-link">
                      {step}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">{title}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {description}
                      </span>
                      <span className="mt-1.5 inline-flex items-center gap-0.5 text-xs font-medium text-link">
                        {linkLabel}
                        <ChevronRight className="h-3 w-3" aria-hidden />
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>

      <LandingPathStrip />

      <section
        id="how-it-works"
        className="scroll-mt-24 border-y border-muted/60 bg-brand-800/20 py-10 sm:py-12"
      >
        <div className="mx-auto max-w-6xl px-[var(--spacing-page-x)] sm:px-6 lg:px-8">
          <LandingSectionHeader
            eyebrow={vl.sectionGettingStarted}
            title={vl.howItWorksTitle}
            subtitle={vl.howItWorksSubtitle}
          />
          <div className="grid gap-4 md:grid-cols-3 md:gap-5">
            {STEPS.map(({ step, icon: Icon, title, description, href, linkLabel }, index) => (
              <article
                key={step}
                className="relative rounded-xl border border-default bg-brand-800/40 p-5"
              >
                {index < STEPS.length - 1 ? (
                  <ChevronRight
                    className="absolute -right-3 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 text-muted-foreground/50 md:block"
                    aria-hidden
                  />
                ) : null}
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-sm font-bold text-link">
                    {step}
                  </span>
                  <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
                {href.startsWith('/') ? (
                  <Link
                    href={href}
                    className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-link hover:underline"
                  >
                    {linkLabel}
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                ) : (
                  <a
                    href={href}
                    className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-link hover:underline"
                  >
                    {linkLabel}
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </a>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="quick-start"
        className="scroll-mt-24 mx-auto max-w-6xl px-[var(--spacing-page-x)] py-10 sm:px-6 sm:py-12 lg:px-8"
      >
        <LandingSectionHeader
          eyebrow={vl.sectionGettingStarted}
          title={vl.quickStartTitle}
          subtitle={vl.quickStartSubtitle}
          centered={false}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <CodeBlock label={vl.quickStartDockerLabel} command={vl.quickStartDockerCommand} />
          <div className="space-y-4">
            <CodeBlock label={vl.quickStartLocalLabel} command={vl.quickStartLocalSetup} />
            <CodeBlock command={vl.quickStartLocalRun} />
          </div>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">{vl.quickStartDocsHint}</p>
      </section>

      <LandingGoogleSetup />

      <section
        id="features"
        className="scroll-mt-24 mx-auto max-w-6xl px-[var(--spacing-page-x)] pb-14 pt-4 sm:px-6 lg:px-8"
      >
        <LandingSectionHeader
          eyebrow={vl.sectionCapabilities}
          title={vl.featuresTitle}
          subtitle={vl.featuresSubtitle}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <article
              key={title}
              className="rounded-xl border border-default bg-brand-800/40 p-4 transition-colors hover:border-blue-500/30 hover:bg-brand-800/60"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-default bg-brand-900/80">
                <Icon className="h-4 w-4 text-link" aria-hidden />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
            </article>
          ))}
        </div>
      </section>
    </LandingShell>
  );
}
