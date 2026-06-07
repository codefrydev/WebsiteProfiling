import { describe, expect, it } from 'vitest';
import {
  applyChatUrlContext,
  buildChatSearchQuery,
  parseChatUrlContext,
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
});
