import { describe, expect, it, vi } from 'vitest';
import {
  applyChatUrlContext,
  buildChatFabHref,
  buildChatSearchQuery,
  clearChatComposerDraft,
  isChatFabVisiblePath,
  parseChatUrlContext,
  readChatComposerDraft,
  readSessionPropertyId,
  resolvePreferredChatSession,
  sessionIdsEqual,
  upsertChatSession,
  writeChatComposerDraft,
} from './chatUrlState';

describe('chatUrlState', () => {
  it('parses property and session from URL', () => {
    const params = new URLSearchParams('property=3&session=42');
    expect(parseChatUrlContext(params)).toEqual({ propertyId: 3, sessionId: 42 });
  });

  it('supports legacy propertyId and sessionId keys', () => {
    const params = new URLSearchParams('propertyId=2&sessionId=9');
    expect(parseChatUrlContext(params)).toEqual({ propertyId: 2, sessionId: 9 });
  });

  it('writes canonical query keys', () => {
    const params = new URLSearchParams('propertyId=1&sessionId=5');
    applyChatUrlContext(params, { propertyId: 7, sessionId: 11 });
    expect(params.get('property')).toBe('7');
    expect(params.get('session')).toBe('11');
    expect(params.get('propertyId')).toBeNull();
    expect(params.get('sessionId')).toBeNull();
  });

  it('buildChatSearchQuery returns unchanged string when context matches', () => {
    const current = 'property=3&session=42';
    expect(buildChatSearchQuery(current, { propertyId: 3, sessionId: 42 })).toBe(current);
  });

  it('buildChatFabHref includes domain query for chat deep link', () => {
    expect(buildChatFabHref('codefrydev.in')).toBe('/chat?domain=codefrydev.in');
    expect(buildChatFabHref('')).toBe('/chat');
    expect(buildChatFabHref(null)).toBe('/chat');
  });

  it('stores and reads composer draft by domain', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('window', {});
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    });

    writeChatComposerDraft({ domain: 'codefrydev.in', text: 'Fix all titles' });
    expect(readChatComposerDraft('codefrydev.in')).toBe('Fix all titles');
    expect(readChatComposerDraft('other.com')).toBeNull();
    clearChatComposerDraft();
    expect(readChatComposerDraft('codefrydev.in')).toBeNull();
  });

  it('isChatFabVisiblePath matches report routes only', () => {
    expect(isChatFabVisiblePath('/dashboard')).toBe(true);
    expect(isChatFabVisiblePath('/issues')).toBe(true);
    expect(isChatFabVisiblePath('/write')).toBe(false);
    expect(isChatFabVisiblePath('/home')).toBe(false);
    expect(isChatFabVisiblePath('/chat')).toBe(false);
    expect(isChatFabVisiblePath('/pipeline')).toBe(false);
    expect(isChatFabVisiblePath('/content-studio')).toBe(false);
  });

  it('resolvePreferredChatSession prefers URL, then stored for same property, then latest', () => {
    expect(
      resolvePreferredChatSession(
        3,
        { propertyId: 3, sessionId: 99 },
        { propertyId: 3, sessionId: 40 },
        [{ id: 10 }],
      ),
    ).toBe(99);
    expect(
      resolvePreferredChatSession(
        3,
        { propertyId: 3, sessionId: null },
        { propertyId: 3, sessionId: 40 },
        [{ id: 10 }],
      ),
    ).toBe(40);
    expect(
      resolvePreferredChatSession(
        3,
        { propertyId: 3, sessionId: null },
        { propertyId: 5, sessionId: 40 },
        [{ id: 10 }, { id: 11 }],
      ),
    ).toBe(10);
    expect(
      resolvePreferredChatSession(3, { propertyId: 3, sessionId: null }, { propertyId: null, sessionId: null }, []),
    ).toBeNull();
  });

  it('readSessionPropertyId accepts API camelCase and legacy snake_case', () => {
    expect(readSessionPropertyId({ propertyId: 3 })).toBe(3);
    expect(readSessionPropertyId({ property_id: 7 })).toBe(7);
  });

  it('buildChatSearchQuery adds session when restoring from property-only URL', () => {
    expect(buildChatSearchQuery('property=3', { propertyId: 3, sessionId: 42 })).toBe(
      'property=3&session=42',
    );
  });

  it('sessionIdsEqual normalizes string and number ids', () => {
    expect(sessionIdsEqual(10, '10')).toBe(true);
    expect(sessionIdsEqual(10, 11)).toBe(false);
  });

  it('upsertChatSession replaces existing row and prepends', () => {
    const rows = upsertChatSession(
      [{ id: 1, propertyId: 3, title: 'old' }],
      { id: 1, propertyId: 3, title: 'hi' },
    );
    expect(rows).toEqual([{ id: 1, propertyId: 3, title: 'hi' }]);
  });
});
