import { describe, expect, it } from 'vitest';
import {
  mergeOllamaModels,
  modelIsConfigured,
  resolveBillingTier,
  toCloudModelRef,
} from './ollamaModels';

describe('toCloudModelRef', () => {
  it('appends :cloud for simple names', () => {
    expect(toCloudModelRef('minimax-m3')).toBe('minimax-m3:cloud');
    expect(toCloudModelRef('kimi-k2.6')).toBe('kimi-k2.6:cloud');
  });

  it('appends -cloud for tagged names', () => {
    expect(toCloudModelRef('deepseek-v3.1:671b')).toBe('deepseek-v3.1:671b-cloud');
    expect(toCloudModelRef('gemma4:31b')).toBe('gemma4:31b-cloud');
  });

  it('leaves existing cloud refs unchanged', () => {
    expect(toCloudModelRef('deepseek-v3.1:671b-cloud')).toBe('deepseek-v3.1:671b-cloud');
    expect(toCloudModelRef('minimax-m3:cloud')).toBe('minimax-m3:cloud');
  });
});

describe('mergeOllamaModels', () => {
  it('merges cloud catalog with installed local models', () => {
    const merged = mergeOllamaModels(
      [
        {
          name: 'deepseek-v3.1:671b-cloud',
          source: 'cloud',
          installed: true,
          capabilities: ['tools'],
          billing: 'cloud_pro',
          requires_subscription: true,
        },
      ],
      [
        {
          name: 'kimi-k2.6:cloud',
          source: 'cloud',
          installed: false,
          billing: 'cloud_free',
          requires_subscription: true,
        },
        {
          name: 'minimax-m3:cloud',
          source: 'cloud',
          installed: false,
          billing: 'cloud_free',
          requires_subscription: true,
        },
      ],
    );

    expect(merged).toHaveLength(3);
    expect(merged.find((m) => m.name === 'deepseek-v3.1:671b-cloud')?.installed).toBe(true);
    expect(merged.find((m) => m.name === 'kimi-k2.6:cloud')?.installed).toBe(false);
    expect(merged[0].installed).toBe(true);
  });
});

describe('resolveBillingTier', () => {
  it('marks local models as free', () => {
    expect(resolveBillingTier('llama3.2', 'local')).toEqual({
      billing: 'free_local',
      requires_subscription: false,
    });
  });

  it('marks light cloud models as account-only free tier', () => {
    expect(resolveBillingTier('kimi-k2.6:cloud', 'cloud')).toEqual({
      billing: 'cloud_free',
      requires_subscription: true,
    });
  });

  it('marks heavy cloud models as pro', () => {
    expect(resolveBillingTier('deepseek-v3.1:671b-cloud', 'cloud')).toEqual({
      billing: 'cloud_pro',
      requires_subscription: true,
    });
  });
});

describe('modelIsConfigured', () => {
  it('matches configured model case-insensitively', () => {
    const models = [
      {
        name: 'kimi-k2.6:cloud',
        source: 'cloud' as const,
        installed: false,
        billing: 'cloud_free' as const,
        requires_subscription: true,
      },
    ];
    expect(modelIsConfigured(models, 'kimi-k2.6:cloud')).toBe(true);
    expect(modelIsConfigured(models, 'KIMI-K2.6:CLOUD')).toBe(true);
    expect(modelIsConfigured(models, 'missing')).toBe(false);
  });
});
