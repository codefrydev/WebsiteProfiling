export interface ChatNarrative {
  power_insights: string[];
  recommended_actions: string[];
}

export function isChatNarrative(value: unknown): value is ChatNarrative {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const insights = Array.isArray(v.power_insights) ? v.power_insights : [];
  const actions = Array.isArray(v.recommended_actions) ? v.recommended_actions : [];
  const validInsight = insights.every((item) => typeof item === 'string' && item.trim().length > 0);
  const validAction = actions.every((item) => typeof item === 'string' && item.trim().length > 0);
  return validInsight && validAction && (insights.length > 0 || actions.length > 0);
}

export function narrativeFromToolResult(
  toolResult: Record<string, unknown> | null | undefined,
): ChatNarrative | undefined {
  if (!toolResult) return undefined;
  const raw = toolResult.narrative;
  return isChatNarrative(raw) ? raw : undefined;
}

/** Legacy assistant rows stored narrative JSON in content instead of tool_result. */
export function narrativeFromLegacyContent(content: string): ChatNarrative | undefined {
  const trimmed = content.trim();
  if (!trimmed.startsWith('{')) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (isChatNarrative(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      const wrapped = (parsed as Record<string, unknown>).narrative;
      if (isChatNarrative(wrapped)) return wrapped;
    }
  } catch {
    /* not JSON */
  }
  return undefined;
}
