import { describe, expect, it } from 'vitest';
import {
  defaultState,
  sessionStateFromResponse,
  unauthenticatedState,
} from '@/context/SessionContext';

describe('SessionContext fail-closed defaults', () => {
  it('defaults to unauthenticated until session loads', () => {
    expect(defaultState.authenticated).toBe(false);
    expect(defaultState.canMutate).toBe(false);
    expect(defaultState.readonly).toBe(true);
    expect(defaultState.loading).toBe(true);
  });

  it('unauthenticatedState clears loading and denies mutate', () => {
    expect(unauthenticatedState).toEqual({
      loading: false,
      authEnabled: false,
      authenticated: false,
      role: null,
      canMutate: false,
      readonly: true,
    });
  });

  it('sessionStateFromResponse requires explicit authenticated/canMutate true', () => {
    expect(sessionStateFromResponse({})).toMatchObject({
      authenticated: false,
      canMutate: false,
      loading: false,
    });
    expect(
      sessionStateFromResponse({
        authEnabled: true,
        authenticated: true,
        role: 'analyst',
        canMutate: true,
        readonly: false,
      }),
    ).toEqual({
      loading: false,
      authEnabled: true,
      authenticated: true,
      role: 'analyst',
      canMutate: true,
      readonly: false,
    });
  });

  it('maps auth-disabled session (authenticated true from BFF) correctly', () => {
    const state = sessionStateFromResponse({
      authEnabled: false,
      authenticated: true,
      role: 'analyst',
      canMutate: true,
      readonly: false,
    });
    expect(state.authenticated).toBe(true);
    expect(state.canMutate).toBe(true);
    expect(state.authEnabled).toBe(false);
  });
});
