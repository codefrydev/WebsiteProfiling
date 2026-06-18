'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import AppLogo from '@/components/AppLogo';
import {
  landingContentClass,
  landingGutterClass,
  landingSectionSplitClass,
  landingSplitCopyClass,
} from '@/components/landing/landingLayout';
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

type FooterGroup = {
  title: string;
  links: { href: string; label: string; external?: boolean }[];
};

const FOOTER_COLUMNS: readonly FooterGroup[][] = [
  [
    {
      title: vl.footerProductTitle,
      links: [
        { href: '/home', label: vl.footerOpenApp },
        { href: '/pipeline', label: vl.footerRunAudit },
        { href: '/chat', label: vl.footerChat },
      ],
    },
    {
      title: vl.footerCommunityTitle,
      links: [
        { href: vl.githubRepoUrl, label: vl.trustGithub, external: true },
        { href: vl.githubIssuesUrl, label: vl.footerIssues, external: true },
      ],
    },
  ],
  [
    {
      title: vl.footerDocsTitle,
      links: [
        { href: vl.githubContributingUrl, label: vl.footerContributing, external: true },
        { href: vl.githubMcpUrl, label: vl.footerMcp, external: true },
        { href: vl.githubReadmeUrl, label: vl.limitationsReadmeLink, external: true },
      ],
    },
    {
      title: vl.footerLegalTitle,
      links: [{ href: vl.githubLicenseUrl, label: vl.footerLicense, external: true }],
    },
  ],
] as const;

function FooterGroupSection({ title, links }: FooterGroup) {
  return (
    <section className="px-4 py-4 @sm:px-5 @sm:py-5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <ul className="mt-3 space-y-2">
        {links.map(({ href, label, external }) => (
          <li key={href}>
            <FooterLink href={href} external={external}>
              {label}
            </FooterLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function LandingFooter() {
  return (
    <div className={`${landingContentClass} flex h-full w-full flex-col justify-center py-8 @sm:py-10 ${landingGutterClass}`}>
      <div className={landingSectionSplitClass}>
        <div className={`${landingSplitCopyClass} max-w-sm @md:pr-8 @lg:pr-10`}>
          <div className="flex items-center gap-2.5">
            <AppLogo size={26} />
            <p className="text-lg font-semibold text-foreground">{app.productName}</p>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{vl.footerCopyright}</p>
          <p className="mt-6 text-xs text-muted-foreground">
            © {new Date().getFullYear()} {app.productName} · {vl.footerLicense}
          </p>
        </div>

        <div className="flex min-h-0 flex-col justify-center @md:pl-2 @lg:pl-4">
          <div className="overflow-hidden rounded-xl border border-default/60 @md:grid @md:grid-cols-2 @md:divide-x divide-default/60">
            {FOOTER_COLUMNS.map((column, columnIndex) => (
              <div key={columnIndex} className="divide-y divide-default/60">
                {column.map((group) => (
                  <FooterGroupSection key={group.title} {...group} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
