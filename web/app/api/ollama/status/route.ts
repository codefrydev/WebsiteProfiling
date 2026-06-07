import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { loadLlmConfig } from '@/server/llmConfig';
import {
  fetchOllamaModels,
  modelIsConfigured,
  modelsSupportTools,
} from '@/server/ollamaModels';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';

const DEFAULT_BASE = 'http://127.0.0.1:11434';

/** GET /api/ollama/status — local install + full Ollama cloud catalog. */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  let baseUrl = DEFAULT_BASE;
  let configuredModel = '';
  try {
    const cfg = await loadLlmConfig();
    baseUrl = String(cfg.state.llm_base_url || DEFAULT_BASE).replace(/\/$/, '');
    configuredModel = String(cfg.state.llm_model || '').trim();
  } catch {
    /* use defaults */
  }

  const result = await fetchOllamaModels(baseUrl);

  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      baseUrl: result.baseUrl,
      configuredModel,
      error: result.error || 'Cannot reach Ollama. Is it running?',
      models: [],
      cloudCatalogOk: false,
      localOk: false,
    });
  }

  const modelInstalled = modelIsConfigured(result.models, configuredModel);
  const configuredEntry = result.models.find(
    (m) => m.name.toLowerCase() === configuredModel.toLowerCase(),
  );

  return NextResponse.json({
    ok: true,
    baseUrl: result.baseUrl,
    configuredModel,
    modelInstalled,
    supportsTools: configuredEntry?.capabilities?.includes('tools') ?? modelsSupportTools(result.models),
    cloudCatalogOk: result.cloudCatalogOk,
    localOk: result.localOk,
    catalogSource: 'live',
    cloudModelCount: result.models.filter((m) => m.source === 'cloud').length,
    models: result.models,
  });
};
