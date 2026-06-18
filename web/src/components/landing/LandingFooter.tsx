'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import AppLogo from '@/components/AppLogo';
import { landingGutterClass } from '@/components/landing/landingLayout';
import { strings } from '@/lib/strings';

const vl = strings.views.landing;
const app = strings.app;

function FooterLink({
  href,
  children,
  external,
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
}) {
  const className = 'text-sm text-muted-foreground transition-colors hover:text-link';
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 ${className}`}>
        {children}
        <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export default function LandingFooter() {
  return (
    <div
      className={`flex h-full w-full flex-col justify-center gap-8 py-10 @sm:gap-10 @sm:py-12 ${landingGutterClass}`}
    >
      <div className="grid gap-8 @sm:grid-cols-2 @lg:grid-cols-5">
        <div className="@lg:col-span-1">
          <div className="flex items-center gap-2.5">
            <AppLogo size={26} />
            <p className="text-lg font-semibold text-foreground">{app.productName}</p>
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
            {vl.footerCopyright}
          </p>
        </div>
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground">
            {vl.footerProductTitle}
          </p>
          <ul className="space-y-2">
            <li><FooterLink href="/home">{vl.footerOpenApp}</FooterLink></li>
            <li><FooterLink href="/pipeline">{vl.footerRunAudit}</FooterLink></li>
            <li><FooterLink href="/chat">{vl.footerChat}</FooterLink></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground">
            {vl.footerDocsTitle}
          </p>
          <ul className="space-y-2">
            <li><FooterLink href={vl.githubContributingUrl} external>{vl.footerContributing}</FooterLink></li>
            <li><FooterLink href={vl.githubMcpUrl} external>{vl.footerMcp}</FooterLink></li>
            <li><FooterLink href={vl.githubReadmeUrl} external>{vl.limitationsReadmeLink}</FooterLink></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground">
            {vl.footerCommunityTitle}
          </p>
          <ul className="space-y-2">
            <li><FooterLink href={vl.githubRepoUrl} external>{vl.trustGithub}</FooterLink></li>
            <li><FooterLink href={vl.githubIssuesUrl} external>{vl.footerIssues}</FooterLink></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground">
            {vl.footerLegalTitle}
          </p>
          <ul className="space-y-2">
            <li><FooterLink href={vl.githubLicenseUrl} external>{vl.footerLicense}</FooterLink></li>
          </ul>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-muted/40 pt-5 text-xs text-muted-foreground @sm:flex-row @sm:items-center @sm:justify-between">
        <span>
          © {new Date().getFullYear()} {app.productName} · {vl.footerLicense}
        </span>
        <a
          href={vl.githubRepoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 transition-colors hover:text-link"
        >
          {vl.trustGithub}
          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
        </a>
      </div>
    </div>
  );
}
