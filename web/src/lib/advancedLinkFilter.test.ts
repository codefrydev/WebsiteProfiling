import { describe, expect, it } from 'vitest';
import type { ReportLink } from '@/types';
import {
  applyAdvancedConditions,
  countActiveConditions,
  evaluateCondition,
  isConditionComplete,
  makeCondition,
  operatorsForKind,
  sanitizeConditions,
  type AdvancedCondition,
} from './advancedLinkFilter';

function link(partial: Partial<ReportLink>): ReportLink {
  return { url: 'https://example.com/', ...partial };
}

function cond(field: string, op: string, value: string): AdvancedCondition {
  return { id: `${field}-${op}`, field, op, value };
}

describe('advancedLinkFilter', () => {
  describe('makeCondition', () => {
    it('defaults the operator to the first for the field kind', () => {
      expect(makeCondition('a', 'word_count')).toEqual({ id: 'a', field: 'word_count', op: 'eq', value: '' });
      expect(makeCondition('b', 'url').op).toBe('contains');
      expect(makeCondition('c', 'status').op).toBe('eq');
    });

    it('falls back to the first field for an unknown key', () => {
      expect(makeCondition('a', 'nope').field).toBe('url');
    });
  });

  describe('isConditionComplete / countActiveConditions', () => {
    it('treats empty or whitespace values as incomplete', () => {
      expect(isConditionComplete(cond('word_count', 'gt', ''))).toBe(false);
      expect(isConditionComplete(cond('word_count', 'gt', '   '))).toBe(false);
      expect(isConditionComplete(cond('word_count', 'gt', '300'))).toBe(true);
    });

    it('treats unknown fields as incomplete', () => {
      expect(isConditionComplete(cond('bogus', 'gt', '1'))).toBe(false);
    });

    it('counts only complete conditions', () => {
      expect(
        countActiveConditions([cond('word_count', 'gt', '300'), cond('inlinks', 'lt', '')]),
      ).toBe(1);
    });
  });

  describe('number fields', () => {
    it('compares with the chosen operator', () => {
      const l = link({ word_count: 250 });
      expect(evaluateCondition(l, cond('word_count', 'lt', '300'))).toBe(true);
      expect(evaluateCondition(l, cond('word_count', 'gt', '300'))).toBe(false);
      expect(evaluateCondition(l, cond('word_count', 'gte', '250'))).toBe(true);
      expect(evaluateCondition(l, cond('word_count', 'lte', '249'))).toBe(false);
      expect(evaluateCondition(l, cond('word_count', 'eq', '250'))).toBe(true);
      expect(evaluateCondition(l, cond('word_count', 'ne', '250'))).toBe(false);
    });

    it('treats a missing numeric value as 0 (matching the quick-filter semantics)', () => {
      expect(evaluateCondition(link({}), cond('inlinks', 'eq', '0'))).toBe(true);
      expect(evaluateCondition(link({}), cond('inlinks', 'gt', '0'))).toBe(false);
    });

    it('derives title_length from the title string', () => {
      expect(evaluateCondition(link({ title: 'Hello' }), cond('title_length', 'eq', '5'))).toBe(true);
      expect(evaluateCondition(link({ title: 'Hello' }), cond('title_length', 'gt', '60'))).toBe(false);
    });

    it('does not filter when the value is not a number', () => {
      expect(evaluateCondition(link({ word_count: 10 }), cond('word_count', 'gt', 'abc'))).toBe(true);
    });
  });

  describe('string fields', () => {
    it('supports contains / not_contains / starts_with / ends_with / is (case-insensitive)', () => {
      const l = link({ url: 'https://example.com/Blog/Post' });
      expect(evaluateCondition(l, cond('url', 'contains', 'blog'))).toBe(true);
      expect(evaluateCondition(l, cond('url', 'not_contains', 'shop'))).toBe(true);
      expect(evaluateCondition(l, cond('url', 'starts_with', 'https://example'))).toBe(true);
      expect(evaluateCondition(l, cond('url', 'ends_with', '/post'))).toBe(true);
      expect(evaluateCondition(link({ title: 'About Us' }), cond('title', 'eq', 'about us'))).toBe(true);
    });
  });

  describe('status field', () => {
    it('matches exact, negated, and class operators', () => {
      expect(evaluateCondition(link({ status: '404' }), cond('status', 'eq', '404'))).toBe(true);
      expect(evaluateCondition(link({ status: '404' }), cond('status', 'ne', '200'))).toBe(true);
      expect(evaluateCondition(link({ status: '404' }), cond('status', 'class', '4xx'))).toBe(true);
      expect(evaluateCondition(link({ status: '301' }), cond('status', 'class', '4xx'))).toBe(false);
      expect(evaluateCondition(link({ status: '500' }), cond('status', 'gte', '500'))).toBe(true);
      expect(evaluateCondition(link({ status: '404' }), cond('status', 'lte', '399'))).toBe(false);
    });
  });

  describe('applyAdvancedConditions', () => {
    const links = [
      link({ url: 'https://x/a', status: '200', word_count: 1200, response_time_ms: 100 }),
      link({ url: 'https://x/b', status: '404', word_count: 100, response_time_ms: 2500 }),
      link({ url: 'https://x/c', status: '404', word_count: 50, response_time_ms: 3000 }),
    ];

    it('returns a copy unchanged when there are no complete conditions', () => {
      const out = applyAdvancedConditions(links, [cond('word_count', 'gt', '')]);
      expect(out).toHaveLength(3);
      expect(out).not.toBe(links);
    });

    it('ANDs multiple conditions together', () => {
      const out = applyAdvancedConditions(links, [
        cond('status', 'class', '4xx'),
        cond('word_count', 'lt', '300'),
        cond('response_time_ms', 'gt', '2000'),
      ]);
      expect(out.map((l) => l.url)).toEqual(['https://x/b', 'https://x/c']);
    });
  });

  describe('sanitizeConditions', () => {
    it('drops unknown fields, repairs operators, and re-keys ids', () => {
      const out = sanitizeConditions([
        { field: 'word_count', op: 'gt', value: '300' },
        { field: 'bogus', op: 'gt', value: '1' },
        { field: 'status', op: 'weird', value: '404' },
        'garbage',
      ]);
      expect(out).toEqual([
        { id: 'saved-0', field: 'word_count', op: 'gt', value: '300' },
        { id: 'saved-2', field: 'status', op: 'eq', value: '404' },
      ]);
    });

    it('returns [] for non-array input', () => {
      expect(sanitizeConditions(null)).toEqual([]);
      expect(sanitizeConditions({})).toEqual([]);
    });
  });

  describe('operatorsForKind', () => {
    it('returns distinct operator sets per kind', () => {
      expect(operatorsForKind('number')[0].op).toBe('eq');
      expect(operatorsForKind('string')[0].op).toBe('contains');
      expect(operatorsForKind('status').some((o) => o.op === 'class')).toBe(true);
    });
  });
});
