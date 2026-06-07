export interface ChatPropertyLike {
  id: number;
  name?: string | null;
  canonical_domain?: string | null;
}

/** Prefer site domain (e.g. codefrydev.in) for chat context display. */
export function formatChatPropertyLabel(property: ChatPropertyLike): string {
  const domain = property.canonical_domain?.trim();
  const name = property.name?.trim();
  if (domain && name && name.toLowerCase() !== domain.toLowerCase()) {
    return domain;
  }
  return domain || name || `Property ${property.id}`;
}

export function formatChatPropertyOption(property: ChatPropertyLike): string {
  const domain = property.canonical_domain?.trim();
  const name = property.name?.trim();
  if (domain && name && name.toLowerCase() !== domain.toLowerCase()) {
    return `${domain} · ${name}`;
  }
  return domain || name || `Property ${property.id}`;
}
