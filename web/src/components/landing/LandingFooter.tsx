'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
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
    <div className="mx-auto max-w-6xl px-[var(--spacing-page-x)] py-10 sm:px-6 lg:px-8">
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-1">
          <p className="font-semibold text-foreground">{app.productName}</p>
          <p className="mt-1 text-sm text-muted-foreground">{vl.footerCopyright}</p>
          <p className="mt-3 text-xs text-muted-foreground">© {new Date().getFullYear()}</p>
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
    </div>
  );
}
