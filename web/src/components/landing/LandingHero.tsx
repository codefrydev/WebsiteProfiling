
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import LandingLifecycleDiagram from '@/components/landing/LandingLifecycleDiagram';
import {
  LANDING_SECTION_IDS,
  landingGutterClass,
  landingSectionClass,
  landingSectionSplitClass,
  landingSplitCopyClass,
  landingSplitMockClass,
  landingSplitVisualClass,
} from '@/components/landing/landingLayout';
import { strings } from '@/lib/strings';

const vl = strings.views.landing;

export default function LandingHero() {
  return (
    <section id={LANDING_SECTION_IDS.hero} className={landingSectionClass}>
      <div className={`flex min-h-0 flex-1 flex-col justify-center py-8 @sm:py-10 ${landingGutterClass}`}>
        <div className={landingSectionSplitClass}>
          <div className={`${landingSplitCopyClass} max-w-xl flex flex-col gap-8 @md:gap-10 @md:pr-8 @lg:pr-12`}>
            <div className="space-y-5 @md:space-y-6">
              <p className="text-sm leading-relaxed text-muted-foreground">{vl.heroEyebrow}</p>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground @sm:text-4xl @md:text-[2.5rem] @md:leading-[1.25]">
                {vl.heroTitle}
              </h1>
              <p className="max-w-md text-base leading-7 text-muted-foreground @md:text-lg @md:leading-8">
                {vl.heroSubtitle}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link
                to="/pipeline"
                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                {vl.ctaRunAudit}
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                to="/home"
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {vl.ctaDashboard}
              </Link>
            </div>
          </div>

          <div className={`${landingSplitVisualClass} px-0 pb-2 @sm:px-0 @md:px-0`}>
            <div className={`${landingSplitMockClass} landing-mock-glow landing-float flex items-center justify-center`}>
              <LandingLifecycleDiagram />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
