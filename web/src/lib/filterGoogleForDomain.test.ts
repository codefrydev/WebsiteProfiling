import { describe, expect, it } from 'vitest';
import {
  googlePayloadMatchesDomain,
  stripGoogleIfDomainMismatch,
} from './filterGoogleForDomain';
import type { GoogleReportData } from '@/types/report';

describe('filterGoogleForDomain', () => {
  const luxGoogle: GoogleReportData = {
    gsc: {
      site_url: 'https://www.luxtripper.co.uk/',
      top_pages: [{ page: 'https://www.luxtripper.co.uk/hotels' }],
    },
  };

  const otherGoogle: GoogleReportData = {
    gsc: {
      site_url: 'https://www.otherbrand.com/',
      top_pages: [{ page: 'https://www.otherbrand.com/page' }],
    },
  };

  it('matches same host with or without www', () => {
    expect(googlePayloadMatchesDomain(luxGoogle, 'www.luxtripper.co.uk')).toBe(true);
    expect(googlePayloadMatchesDomain(luxGoogle, 'luxtripper.co.uk')).toBe(true);
  });

  it('rejects another brand host', () => {
    expect(googlePayloadMatchesDomain(otherGoogle, 'www.luxtripper.co.uk')).toBe(false);
  });

  it('strips mismatched google from payload', () => {
    const out = stripGoogleIfDomainMismatch({ google: otherGoogle, site_name: 'x' }, 'luxtripper.co.uk');
    expect(out.google).toBeUndefined();
    expect(out.site_name).toBe('x');
  });
});
