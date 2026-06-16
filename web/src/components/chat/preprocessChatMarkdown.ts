import { CHAT_SECTION_TITLES } from '@/components/chat/chatSectionTitles';

const LOOSE_PIPE_ROW_RE = /^\s*\|(.+)\|?\s*$/;

function cellText(raw: string): string {
  return raw.replace(/^\|+|\|+$/g, '').trim();
}

function parsePipeRow(line: string): string[] | null {
  const m = line.trim().match(LOOSE_PIPE_ROW_RE);
  if (!m) return null;
  return m[1].split('|').map((c) => c.trim());
}

function isDashOnly(text: string): boolean {
  return /^[-–—_\s]+$/.test(text);
}

function rowHasScore(cells: string[]): boolean {
  return cells.some((c) => /\bscore\s*\d+/i.test(c) || /\d+\s*\/\s*100/.test(c));
}

/** Unwrap pipe rows that are not score summaries — headings or bullets instead of tables. */
function unwrapNonTablePipeRows(content: string): string {
  const lines = content.split('\n');
  const out: string[] = [];

  for (const line of lines) {
    const cells = parsePipeRow(line);
    if (!cells || cells.length < 2) {
      out.push(line);
      continue;
    }

    if (cells.every((c) => isDashOnly(c))) {
      continue;
    }

    if (rowHasScore(cells)) {
      out.push(line);
      continue;
    }

    const [left, ...rest] = cells;
    const right = rest.join(' — ').trim();
    const leftNorm = left.toLowerCase();

    if (leftNorm === 'insight' || leftNorm === 'category' || leftNorm === 'notes') {
      if (right && !isDashOnly(right)) {
        const matchTitle = CHAT_SECTION_TITLES.find(
          (t) => right.toLowerCase().startsWith(t.toLowerCase()),
        );
        out.push(matchTitle ? `### ${matchTitle}` : `### ${right}`);
      }
      continue;
    }

    if (left && right) {
      out.push(`- **${left}**: ${right}`);
    } else if (right) {
      out.push(`- ${right}`);
    }
  }

  return out.join('\n');
}

/** Only merge consecutive score pipe rows into one GFM table. */
function normalizeScorePipeTables(content: string): string {
  const lines = content.split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const cells = parsePipeRow(lines[i]);
    if (!cells || !rowHasScore(cells)) {
      out.push(lines[i]);
      i += 1;
      continue;
    }

    const group: string[] = [];
    while (i < lines.length) {
      const rowCells = parsePipeRow(lines[i]);
      if (!rowCells || !rowHasScore(rowCells) || rowCells.every((c) => isDashOnly(c))) break;
      group.push(lines[i].trim());
      i += 1;
    }

    if (group.length >= 2) {
      out.push('| Category | Notes |', '| --- | --- |', ...group);
    } else if (group.length === 1) {
      const [a, ...rest] = parsePipeRow(group[0]) || [];
      const note = rest.join(' — ');
      if (a && note) out.push(`- **${a}**: ${note}`);
      else out.push(group[0]);
    }
  }

  return out.join('\n');
}

/** Normalize assistant markdown so section titles and lists render with structure. */
export function preprocessChatMarkdown(content: string): string {
  let out = content.trim();
  if (!out) return out;

  out = out.replace(
    /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s🔎📸💡]*\s*(Power Insights|Key takeaways|Executive summary)(?:\s+for\s+[\w.-]+)?\s*$/gimu,
    '### $1',
  );

  for (const title of CHAT_SECTION_TITLES) {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`([.!?])\\s+(${escaped})\\s+`, 'gi');
    out = out.replace(re, `$1\n\n### $2\n\n`);
    const lineStart = new RegExp(`^(?!#{1,6}\\s)(${escaped})\\s+`, 'im');
    out = out.replace(lineStart, `### $1\n\n`);
  }

  out = out.replace(/^\*\*([^*\n]{3,60})\*\*\s*$/gm, '### $1');
  out = out.replace(/^(Critical blocker \d+|Critical issue\s*[–-]\s*\d+)\s+/gim, '1. $1 ');
  out = out.replace(/([.!?])\s+([—–-]\s+)/g, '$1\n$2');
  out = out.replace(/^\*{3,}\s*$/gm, '---');

  out = unwrapNonTablePipeRows(out);
  out = normalizeScorePipeTables(out);

  out = out.replace(
    /^[-*]\s+([A-Z][\w\s]{2,48}(?:Quick Wins|Insights|Actions|Priorities))\s*$/gim,
    '#### $1\n',
  );
  out = out.replace(
    /^\d+\.\s+([A-Z][\w\s]{2,48}(?:Quick Wins|Insights|Actions|Priorities))\s*$/gim,
    '#### $1\n',
  );

  const lines = out.split('\n');
  const normalized: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[—–-]\s+/.test(trimmed) && !trimmed.startsWith('---')) {
      normalized.push(trimmed.replace(/^[—–-]\s+/, '- '));
    } else {
      normalized.push(line);
    }
  }
  out = normalized.join('\n');

  return out.replace(/\n{3,}/g, '\n\n').trim();
}

export { unwrapNonTablePipeRows, normalizeScorePipeTables, parsePipeRow };
