import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

export const termHighlightKey = new PluginKey<TermHighlightState>('termHighlight');

interface TermHighlightState {
  terms: string[];
  decorations: DecorationSet;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildRegExp(terms: string[]): RegExp | null {
  const cleaned = Array.from(
    new Set(terms.map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 2)),
  )
    // Longer phrases first so "chain reaction" wins over "chain".
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  if (cleaned.length === 0) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${cleaned.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
}

function buildDecorations(doc: PMNode, terms: string[]): DecorationSet {
  const re = buildRegExp(terms);
  if (!re) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text;
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const from = pos + match.index;
      const to = from + match[0].length;
      decorations.push(Decoration.inline(from, to, { class: 'cs-term-hl' }));
      if (match.index === re.lastIndex) re.lastIndex += 1;
    }
  });
  return DecorationSet.create(doc, decorations);
}

/**
 * Highlights occurrences of target terms in the document, Clearscope-style.
 * Drive it with the `setHighlightTerms` command whenever the term list changes.
 */
export const TermHighlight = Extension.create({
  name: 'termHighlight',

  addCommands() {
    return {
      setHighlightTerms:
        (terms: string[]) =>
        ({ state, dispatch }) => {
          if (dispatch) {
            dispatch(state.tr.setMeta(termHighlightKey, { terms }));
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<TermHighlightState>({
        key: termHighlightKey,
        state: {
          init: () => ({ terms: [], decorations: DecorationSet.empty }),
          apply: (tr, value, _oldState, newState) => {
            const meta = tr.getMeta(termHighlightKey) as { terms?: string[] } | undefined;
            const terms = meta && Array.isArray(meta.terms) ? meta.terms : value.terms;
            if (meta || tr.docChanged) {
              return { terms, decorations: buildDecorations(newState.doc, terms) };
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            return termHighlightKey.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    termHighlight: {
      /** Replace the set of highlighted terms. */
      setHighlightTerms: (terms: string[]) => ReturnType;
    };
  }
}
