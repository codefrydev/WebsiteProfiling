'use client';

import { useMemo } from 'react';
import { Contact2, ExternalLink } from 'lucide-react';
import { useReport } from '../context/useReport';
import { strings, format } from '../lib/strings';
import {
  PageLayout,
  PageHeader,
  Card,
  Badge,
  Table,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableCell,
} from '../components';
import type { ContactIntelligenceEntry, ViewProps } from '@/types';

type ContactSection = 'emails' | 'phones' | 'addresses' | 'organization_names';

function filterEntries(
  items: ContactIntelligenceEntry[] | undefined,
  q: string,
): ContactIntelligenceEntry[] {
  const list = items || [];
  if (!q) return list;
  return list.filter((row) => {
    const value = (row.value || '').toLowerCase();
    const sources = (row.sources || []).join(' ').toLowerCase();
    const urls = (row.urls || []).join(' ').toLowerCase();
    return value.includes(q) || sources.includes(q) || urls.includes(q);
  });
}

function ContactSectionTable({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: ContactIntelligenceEntry[];
  emptyLabel: string;
}) {
  const vc = strings.views.contacts;
  if (rows.length === 0) {
    return (
      <Card className="mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      </Card>
    );
  }
  return (
    <Card className="mb-6">
      <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
      <div className="overflow-x-auto">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeadCell>{vc.colValue}</TableHeadCell>
              <TableHeadCell>{vc.colSources}</TableHeadCell>
              <TableHeadCell>{vc.colPages}</TableHeadCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${title}-${row.value}`}>
                <TableCell className="text-sm break-all">{row.value || '—'}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(row.sources || []).map((s) => (
                      <Badge key={s} variant="info" value={s} className="normal-case text-[10px]" />
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <ul className="space-y-1">
                    {(row.urls || []).slice(0, 3).map((url) => (
                      <li key={url}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-link text-xs hover:underline break-all inline-flex items-center gap-1"
                        >
                          {url}
                          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                        </a>
                      </li>
                    ))}
                    {(row.urls?.length ?? 0) > 3 ? (
                      <li className="text-xs text-muted-foreground">
                        {format(vc.morePages, { count: (row.urls?.length ?? 0) - 3 })}
                      </li>
                    ) : null}
                  </ul>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

export default function Contacts({ searchQuery = '' }: ViewProps) {
  const { data } = useReport();
  const vc = strings.views.contacts;
  const intel = data?.contact_intelligence;
  const q = (searchQuery || '').toLowerCase().trim();

  const sections = useMemo(
    (): Record<ContactSection, ContactIntelligenceEntry[]> => ({
      emails: filterEntries(intel?.emails, q),
      phones: filterEntries(intel?.phones, q),
      addresses: filterEntries(intel?.addresses, q),
      organization_names: filterEntries(intel?.organization_names, q),
    }),
    [intel, q],
  );

  const totalSignals =
    (intel?.emails?.length ?? 0) +
    (intel?.phones?.length ?? 0) +
    (intel?.addresses?.length ?? 0) +
    (intel?.organization_names?.length ?? 0);

  if (!intel || totalSignals === 0) {
    return (
      <PageLayout>
        <PageHeader title={vc.title} subtitle={vc.subtitle} icon={<Contact2 className="h-7 w-7 text-link shrink-0" />} />
        <Card>
          <p className="text-sm text-muted-foreground">{vc.emptyHint}</p>
        </Card>
      </PageLayout>
    );
  }

  const filteredTotal =
    sections.emails.length +
    sections.phones.length +
    sections.addresses.length +
    sections.organization_names.length;

  return (
    <PageLayout>
      <PageHeader title={vc.title} subtitle={vc.subtitle} icon={<Contact2 className="h-7 w-7 text-link shrink-0" />} />
      {(intel.consistency_notes?.length ?? 0) > 0 ? (
        <Card className="mb-6 border-amber-500/30 bg-amber-500/5">
          <h3 className="text-sm font-semibold text-foreground mb-2">{vc.notesTitle}</h3>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
            {(intel.consistency_notes || []).map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Card>
      ) : null}
      {intel.primary_contact_page ? (
        <Card className="mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-2">{vc.primaryPageTitle}</h3>
          <a
            href={intel.primary_contact_page}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link text-sm hover:underline break-all inline-flex items-center gap-1"
          >
            {intel.primary_contact_page}
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </a>
        </Card>
      ) : null}
      {q && filteredTotal === 0 ? (
        <Card className="mb-6">
          <p className="text-sm text-muted-foreground">{vc.noSearchResults}</p>
        </Card>
      ) : null}
      <ContactSectionTable title={vc.emailsTitle} rows={sections.emails} emptyLabel={vc.noEmails} />
      <ContactSectionTable title={vc.phonesTitle} rows={sections.phones} emptyLabel={vc.noPhones} />
      <ContactSectionTable title={vc.addressesTitle} rows={sections.addresses} emptyLabel={vc.noAddresses} />
      <ContactSectionTable
        title={vc.organizationsTitle}
        rows={sections.organization_names}
        emptyLabel={vc.noOrganizations}
      />
      <p className="text-xs text-muted-foreground">{vc.provenanceHint}</p>
    </PageLayout>
  );
}
