
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  ListChecks,
  Redo2,
  Undo2,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Code,
  Code2,
  Minus,
  Link2,
  ImageIcon,
  Table2,
  FileCode2,
  PenLine,
} from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { strings } from '@/lib/strings';
import { buildContentEditorExtensions } from './editorExtensions';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  placeholder?: string;
  fillHeight?: boolean;
  /** Target terms to highlight inline in the document body. */
  highlightTerms?: string[];
}

type ViewMode = 'rich' | 'markdown';

function getEditorMarkdown(editor: Editor): string {
  const withMarkdown = editor as Editor & { getMarkdown?: () => string };
  if (typeof withMarkdown.getMarkdown === 'function') {
    return withMarkdown.getMarkdown();
  }
  const storage = editor.storage as { markdown?: { getMarkdown?: () => string } };
  return storage.markdown?.getMarkdown?.() ?? '';
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded p-1.5 transition-colors disabled:opacity-40 ${
        active
          ? 'bg-accent/20 text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-brand-800'
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="w-px h-5 bg-default mx-0.5" aria-hidden />;
}

export default function RichTextEditor({
  value,
  onChange,
  disabled = false,
  placeholder = '',
  fillHeight = false,
  highlightTerms,
}: RichTextEditorProps) {
  const t = strings.views.contentStudio.editor.toolbar;
  const [viewMode, setViewMode] = useState<ViewMode>('rich');
  const [markdownSource, setMarkdownSource] = useState('');

  const syncMarkdownToHtml = useCallback(
    (editor: Editor, markdown: string) => {
      editor.commands.setContent(markdown || '', { contentType: 'markdown', emitUpdate: false });
      onChange(editor.getHTML());
    },
    [onChange],
  );

  const editor = useEditor({
    extensions: buildContentEditorExtensions(placeholder),
    content: value || '<p></p>',
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      if (viewMode === 'rich') onChange(ed.getHTML());
    },
    editorProps: {
      attributes: {
        class: fillHeight
          ? 'tiptap prose prose-base dark:prose-invert max-w-none min-h-full px-4 py-4 focus:outline-none text-foreground'
          : 'tiptap prose prose-sm dark:prose-invert max-w-none min-h-[320px] px-3 py-2 focus:outline-none text-foreground',
      },
    },
  });

  useEffect(() => {
    if (!editor || viewMode !== 'rich') return;
    const current = editor.getHTML();
    if (value !== current) {
      editor.commands.setContent(value || '<p></p>', { emitUpdate: false });
    }
  }, [editor, value, viewMode]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled && viewMode === 'rich');
  }, [editor, disabled, viewMode]);

  const termsKey = (highlightTerms ?? []).join('');
  useEffect(() => {
    if (!editor) return;
    editor.commands.setHighlightTerms(termsKey ? termsKey.split('') : []);
  }, [editor, termsKey, value, viewMode]);

  useEffect(() => {
    if (!editor || viewMode !== 'markdown' || disabled) return;
    const timer = window.setTimeout(() => {
      syncMarkdownToHtml(editor, markdownSource);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [editor, viewMode, markdownSource, disabled, syncMarkdownToHtml]);

  const promptUrl = useCallback((label: string, current = '') => {
    if (typeof window === 'undefined') return null;
    return window.prompt(label, current || 'https://');
  }, []);

  const switchToMarkdown = useCallback(() => {
    if (!editor) return;
    setMarkdownSource(getEditorMarkdown(editor));
    setViewMode('markdown');
  }, [editor]);

  const switchToRich = useCallback(() => {
    if (!editor) return;
    syncMarkdownToHtml(editor, markdownSource);
    setViewMode('rich');
  }, [editor, markdownSource, syncMarkdownToHtml]);

  if (!editor) {
    return (
      <div
        className={
          fillHeight
            ? 'min-h-[200px] flex-1 rounded-lg border border-default bg-brand-900 animate-pulse'
            : 'min-h-[360px] rounded-lg border border-default bg-brand-900 animate-pulse'
        }
      />
    );
  }

  const tbDisabled = disabled || viewMode === 'markdown';

  return (
    <div
      className={`rounded-lg border border-default bg-brand-900 overflow-hidden flex flex-col ${
        fillHeight ? 'flex-1 min-h-0' : ''
      }`}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-default px-2 py-1.5">
        <div className="flex items-center rounded-md border border-default p-0.5 mr-1">
          <button
            type="button"
            title={t.visualMode}
            disabled={disabled}
            onClick={() => {
              if (viewMode === 'markdown') switchToRich();
            }}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
              viewMode === 'rich'
                ? 'bg-brand-800 text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <PenLine className="h-3.5 w-3.5" aria-hidden />
            {t.visual}
          </button>
          <button
            type="button"
            title={t.markdownMode}
            disabled={disabled}
            onClick={() => {
              if (viewMode === 'rich') switchToMarkdown();
            }}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
              viewMode === 'markdown'
                ? 'bg-brand-800 text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileCode2 className="h-3.5 w-3.5" aria-hidden />
            {t.markdown}
          </button>
        </div>

        <ToolbarDivider />

        <ToolbarButton
          title={t.bold}
          disabled={tbDisabled}
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          title={t.italic}
          disabled={tbDisabled}
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          title={t.underline}
          disabled={tbDisabled}
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          title={t.strike}
          disabled={tbDisabled}
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          title={t.code}
          disabled={tbDisabled}
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code className="h-4 w-4" aria-hidden />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          title={t.heading1}
          disabled={tbDisabled}
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          title={t.heading2}
          disabled={tbDisabled}
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          title={t.heading3}
          disabled={tbDisabled}
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          title={t.quote}
          disabled={tbDisabled}
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          title={t.codeBlock}
          disabled={tbDisabled}
          active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <Code2 className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          title={t.horizontalRule}
          disabled={tbDisabled}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus className="h-4 w-4" aria-hidden />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          title={t.bulletList}
          disabled={tbDisabled}
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          title={t.orderedList}
          disabled={tbDisabled}
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          title={t.taskList}
          disabled={tbDisabled}
          active={editor.isActive('taskList')}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          <ListChecks className="h-4 w-4" aria-hidden />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          title={t.link}
          disabled={tbDisabled}
          active={editor.isActive('link')}
          onClick={() => {
            const prev = String(editor.getAttributes('link').href || '');
            const url = promptUrl(t.linkPrompt, prev);
            if (url === null) return;
            if (!url.trim()) {
              editor.chain().focus().extendMarkRange('link').unsetLink().run();
              return;
            }
            editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
          }}
        >
          <Link2 className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          title={t.image}
          disabled={tbDisabled}
          onClick={() => {
            const url = promptUrl(t.imagePrompt);
            if (url?.trim()) {
              editor.chain().focus().setImage({ src: url.trim() }).run();
            }
          }}
        >
          <ImageIcon className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          title={t.table}
          disabled={tbDisabled}
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <Table2 className="h-4 w-4" aria-hidden />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          title={t.undo}
          disabled={tbDisabled || !editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          title={t.redo}
          disabled={tbDisabled || !editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 className="h-4 w-4" aria-hidden />
        </ToolbarButton>
      </div>

      <div className={fillHeight ? 'flex-1 min-h-0 overflow-y-auto' : ''}>
        {viewMode === 'markdown' ? (
          <textarea
            value={markdownSource}
            onChange={(e) => setMarkdownSource(e.target.value)}
            disabled={disabled}
            placeholder={t.markdownPlaceholder}
            spellCheck
            className={`w-full resize-none bg-brand-800/50 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none ${
              fillHeight ? 'min-h-full h-full px-4 py-4' : 'min-h-[320px] px-3 py-2'
            }`}
          />
        ) : (
          <EditorContent editor={editor} />
        )}
      </div>

      <style>{`
        .tiptap p.is-editor-empty:first-child::before {
          color: var(--muted-foreground, #94a3b8);
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
        .tiptap table {
          border-collapse: collapse;
          width: 100%;
          margin: 0.75rem 0;
        }
        .tiptap th,
        .tiptap td {
          border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
          padding: 0.35rem 0.5rem;
          vertical-align: top;
        }
        .tiptap th {
          background: color-mix(in srgb, currentColor 6%, transparent);
          font-weight: 600;
        }
        .tiptap ul[data-type='taskList'] {
          list-style: none;
          padding-left: 0;
        }
        .tiptap ul[data-type='taskList'] li {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
        }
        .tiptap ul[data-type='taskList'] li > label {
          margin-top: 0.2rem;
        }
        .tiptap .cs-term-hl {
          background-color: rgba(250, 204, 21, 0.32);
          border-radius: 2px;
          padding: 0 1px;
          box-decoration-break: clone;
          -webkit-box-decoration-break: clone;
        }
      `}</style>
    </div>
  );
}
