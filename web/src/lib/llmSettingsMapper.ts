/**
 * Typed LLM settings DTOs (mirrors AiService LlmSettings models).
 */
import type { LlmConfigState } from '@/types/api';
import { LLM_CLOUD_PROVIDERS } from '@/lib/llmProviderApiKeys';
import { LLM_MODEL_PROVIDERS, llmProviderModelField, readStoredProviderModel } from '@/lib/llmProviderModels';

export interface LlmProviderProfileDto {
  provider: string;
  apiKey?: string;
  savedModel?: string;
  apiKeyUpdatedAt?: string | null;
}

export interface LlmSettingsDto {
  enabled: boolean;
  provider: string;
  activeModel: string;
  ollamaBaseUrl: string;
  enableNer: boolean;
  enableKeyphrases: boolean;
  enableSimilarInternal: boolean;
  enableKeywordClusters: boolean;
  enableIssueFixes: boolean;
  enableAuditSummary: boolean;
  enablePageCoach: boolean;
  enableContentStudio: boolean;
  enableDashboards: boolean;
  chatAssistantName: string;
  chatAssistantAvatarUrl: string;
  chatUnlimitedToolRounds: boolean;
  chatAllowCrawl: boolean;
  chatFastNarrative: boolean;
  maxPages: number;
  batchSize: number;
  concurrency: number;
  timeoutSeconds: number;
  similarTopK: number;
  providers?: LlmProviderProfileDto[];
}

export interface LlmSettingsGetResponse {
  settings: LlmSettingsDto;
  source?: string;
  apiKeyConfigured?: boolean;
}

/** Map typed GET /llm-settings response to flat UI state. */
export function llmSettingsDtoToFlatState(dto: LlmSettingsDto): LlmConfigState {
  const out: LlmConfigState = {
    llm_enabled: dto.enabled,
    llm_provider: dto.provider,
    llm_model: dto.activeModel,
    llm_base_url: dto.ollamaBaseUrl,
    llm_enable_ner: dto.enableNer,
    llm_enable_keyphrases: dto.enableKeyphrases,
    llm_enable_similar_internal: dto.enableSimilarInternal,
    llm_enable_keyword_clusters: dto.enableKeywordClusters,
    llm_enable_issue_fixes: dto.enableIssueFixes,
    llm_enable_audit_summary: dto.enableAuditSummary,
    llm_enable_page_coach: dto.enablePageCoach,
    llm_enable_content_studio: dto.enableContentStudio,
    llm_enable_dashboards: dto.enableDashboards,
    llm_chat_assistant_name: dto.chatAssistantName,
    llm_chat_assistant_avatar_url: dto.chatAssistantAvatarUrl,
    llm_chat_unlimited_tool_rounds: dto.chatUnlimitedToolRounds,
    llm_chat_allow_crawl: dto.chatAllowCrawl,
    llm_chat_fast_narrative: dto.chatFastNarrative,
    llm_max_pages: String(dto.maxPages),
    llm_batch_size: String(dto.batchSize),
    llm_concurrency: String(dto.concurrency),
    llm_timeout_s: String(dto.timeoutSeconds),
    llm_similar_top_k: String(dto.similarTopK),
  };

  for (const profile of dto.providers ?? []) {
    const provider = profile.provider?.trim().toLowerCase();
    if (!provider) continue;
    if (profile.savedModel) {
      out[llmProviderModelField(provider)] = profile.savedModel;
    }
    if (profile.apiKey) {
      out[`llm_api_key_${provider}`] = profile.apiKey;
    }
  }

  for (const provider of LLM_CLOUD_PROVIDERS) {
    const field = `llm_api_key_${provider}`;
    if (out[field] === undefined) {
      out[field] = '';
    }
  }

  return out;
}

/** Collect per-provider saved models for PUT /api/llm-settings providerProfiles. */
export function collectProviderProfiles(state: LlmConfigState): LlmProviderProfileDto[] {
  const profiles: LlmProviderProfileDto[] = [];
  const activeProvider = String(state.llm_provider ?? 'none').trim().toLowerCase();
  const activeModel = String(state.llm_model ?? '').trim();

  for (const provider of LLM_MODEL_PROVIDERS) {
    let savedModel = readStoredProviderModel(state, provider);
    if (provider === activeProvider && activeModel) {
      savedModel = activeModel;
    }
    if (savedModel) {
      profiles.push({ provider, savedModel });
    }
  }

  return profiles;
}

/** Map flat UI state to typed PUT /llm-settings body. */
export function flatStateToLlmSettingsPatch(state: LlmConfigState): { settings: Record<string, unknown> } {
  const providerProfiles = collectProviderProfiles(state);
  return {
    settings: {
      enabled: Boolean(state.llm_enabled),
      provider: String(state.llm_provider ?? 'none'),
      activeModel: String(state.llm_model ?? ''),
      ollamaBaseUrl: String(state.llm_base_url ?? ''),
      enableNer: Boolean(state.llm_enable_ner),
      enableKeyphrases: Boolean(state.llm_enable_keyphrases),
      enableSimilarInternal: Boolean(state.llm_enable_similar_internal),
      enableKeywordClusters: Boolean(state.llm_enable_keyword_clusters),
      enableIssueFixes: Boolean(state.llm_enable_issue_fixes),
      enableAuditSummary: Boolean(state.llm_enable_audit_summary),
      enablePageCoach: Boolean(state.llm_enable_page_coach),
      enableContentStudio: Boolean(state.llm_enable_content_studio),
      enableDashboards: Boolean(state.llm_enable_dashboards),
      chatAssistantName: String(state.llm_chat_assistant_name ?? ''),
      chatAssistantAvatarUrl: String(state.llm_chat_assistant_avatar_url ?? ''),
      chatUnlimitedToolRounds: Boolean(state.llm_chat_unlimited_tool_rounds),
      chatAllowCrawl: Boolean(state.llm_chat_allow_crawl),
      chatFastNarrative: Boolean(state.llm_chat_fast_narrative),
      maxPages: Number(state.llm_max_pages ?? 60),
      batchSize: Number(state.llm_batch_size ?? 5),
      concurrency: Number(state.llm_concurrency ?? 2),
      timeoutSeconds: Number(state.llm_timeout_s ?? 120),
      similarTopK: Number(state.llm_similar_top_k ?? 5),
      ...(providerProfiles.length > 0 ? { providerProfiles } : {}),
    },
  };
}
