'use client';

import {
  AlertCircle,
  Cpu,
  Gauge,
  Globe,
  Key,
  Link2,
  MessageSquare,
  TrendingUp,
} from 'lucide-react';
import LandingSectionHeader from '@/components/landing/LandingSectionHeader';
import {
  landingContentClass,
  landingSectionSplitClass,
  landingSplitCopyClass,
} from '@/components/landing/landingLayout';
import { strings } from '@/lib/strings';

const vl = strings.views.landing;

const FEATURES = [
  { icon: Globe, title: vl.featureCrawlTitle, description: vl.featureCrawlDescription },
  { icon: AlertCircle, title: vl.featureIssuesTitle, description: vl.featureIssuesDescription },
  { icon: Gauge, title: vl.featureOnPageTitle, description: vl.featureOnPageDescription },
  { icon: TrendingUp, title: vl.featureSearchTitle, description: vl.featureSearchDescription },
  { icon: Key, title: vl.featureKeywordsTitle, description: vl.featureKeywordsDescription },
  { icon: Link2, title: vl.featureLinksTitle, description: vl.featureLinksDescription },
  { icon: MessageSquare, title: vl.featureAiTitle, description: vl.featureAiDescription },
  { icon: Cpu, title: vl.featureSelfHostedTitle, description: vl.featureSelfHostedDescription },
] as const;

function FeatureRow({
  icon: Icon,
  title,
  description,
}: (typeof FEATURES)[number]) {
  return (
    <article className="flex gap-3 px-3.5 py-3 @sm:gap-4 @sm:px-4 @sm:py-3.5">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10 text-link">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground @sm:text-sm">{description}</p>
      </div>
    </article>
  );
}

export default function LandingFeatures() {
  const columns = [FEATURES.slice(0, 4), FEATURES.slice(4)] as const;

  return (
    <div className={`${landingContentClass} flex h-full min-h-0 flex-col justify-center`}>
      <div className={landingSectionSplitClass}>
        <div className={`${landingSplitCopyClass} max-w-md @md:pr-8 @lg:pr-10`}>
          <LandingSectionHeader
            eyebrow={vl.sectionCapabilities}
            title={vl.featuresTitle}
            subtitle={vl.featuresSubtitle}
            centered={false}
            compact
          />
        </div>

        <div className="flex min-h-0 flex-col justify-center @md:pl-2 @lg:pl-4">
          <div className="overflow-hidden rounded-xl border border-default/60 @md:grid @md:grid-cols-2 @md:divide-x divide-default/60">
            {columns.map((column, index) => (
              <ul key={index} className="divide-y divide-default/60">
                {column.map((feature) => (
                  <li key={feature.title}>
                    <FeatureRow {...feature} />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
