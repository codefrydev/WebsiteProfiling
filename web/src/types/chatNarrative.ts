export interface ChatNarrative {
  power_insights: string[];
  recommended_actions: string[];
}

export function isChatNarrative(value: unknown): value is ChatNarrative {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const insights = v.power_insights;
  const actions = v.recommended_actions;
  if (!Array.isArray(insights) || !Array.isArray(actions)) return false;
  return (
    insights.every((item) => typeof item === 'string' && item.trim().length > 0) &&
    actions.every((item) => typeof item === 'string' && item.trim().length > 0) &&
    (insights.length > 0 || actions.length > 0)
  );
}

export function narrativeFromToolResult(
  toolResult: Record<string, unknown> | null | undefined,
): ChatNarrative | undefined {
  if (!toolResult) return undefined;
  const raw = toolResult.narrative;
  return isChatNarrative(raw) ? raw : undefined;
}
