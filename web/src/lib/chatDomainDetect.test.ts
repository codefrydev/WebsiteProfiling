import { describe, expect, it } from 'vitest';
import { extractDomainFromText } from './chatDomainDetect';

describe('extractDomainFromText', () => {
  it('finds a bare domain', () => {
    expect(extractDomainFromText('codefrydev.in')).toBe('codefrydev.in');
  });

  it('finds a domain embedded in a sentence', () => {
    expect(extractDomainFromText('check codefrydev.in for broken links')).toBe('codefrydev.in');
  });

  it('finds a domain with a path attached', () => {
    expect(extractDomainFromText('look at luxtripper.co.uk/blog please')).toBe('luxtripper.co.uk');
  });

  it('finds a domain with a scheme prefix', () => {
    expect(extractDomainFromText('https://www.example.com/page')).toBe('www.example.com');
  });

  it('returns null for prose with no domain', () => {
    expect(extractDomainFromText('what does SEO mean anyway')).toBeNull();
  });

  it('does not false-positive on abbreviations', () => {
    expect(extractDomainFromText('e.g. this or that, etc.')).toBeNull();
  });

  it('does not false-positive on version numbers', () => {
    expect(extractDomainFromText('we shipped v1.2.3 today')).toBeNull();
  });
});
