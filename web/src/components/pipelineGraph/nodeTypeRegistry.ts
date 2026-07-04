/**
 * Static catalog of the pipeline editor's 8 node kinds: label, palette
 * category, icon, and per-node config field schema. One entry per
 * PipelineNodeKind -- nodeTypeRegistry.test.ts asserts exhaustiveness.
 */
import type { ComponentType } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  Eraser,
  FileCode,
  FileText,
  ScanSearch,
  Zap,
  type LucideProps,
} from 'lucide-react';
import type { ConfigFieldDef } from '@/components/pipeline/ConfigField';
import type { PipelineNodeCategory, PipelineNodeKind } from '@/types/pipelineGraph';

export interface PipelineNodeTypeDef {
  kind: PipelineNodeKind;
  label: string;
  category: PipelineNodeCategory;
  description: string;
  icon: ComponentType<LucideProps>;
  /** True if a user can disable this step; undefined/false = always on. */
  optional?: boolean;
  configFields: ConfigFieldDef[];
}

// Mirrors CONTENT_ROOT_SELECTORS in content_analysis/constants.py -- the
// backend falls back to this exact list when a node's override is empty, so
// seeding new pipelines with it keeps the UI's displayed default truthful.
const DEFAULT_MAIN_CONTENT_SELECTORS = 'main, article, [role="main"], #content, .content';

// Mirrors CHROME_SELECTORS in content_analysis/constants.py.
const DEFAULT_BOILERPLATE_SELECTORS =
  'nav, footer, header, aside, .navbar, #header, #footer, .sidebar, #sidebar, ' +
  '.modal, .popup, #modal, .overlay, .ad, .ads, .advert, #ad, ' +
  '.lang-selector, #language-selector, .social, .social-media, .social-links, #social, ' +
  '.navigation, #nav, .breadcrumbs, #breadcrumbs, .share, #share, .cookie, #cookie';

export const NODE_TYPE_REGISTRY: Record<PipelineNodeKind, PipelineNodeTypeDef> = {
  'trigger.on_page_load': {
    kind: 'trigger.on_page_load',
    label: 'On Page Load',
    category: 'trigger',
    description: 'Starts the pipeline. The page URL is set in the toolbar above the canvas.',
    icon: Zap,
    configFields: [],
  },
  'fetch.get_html': {
    kind: 'fetch.get_html',
    label: 'Get HTML',
    category: 'fetch',
    description: 'Fetches the raw HTML for the page being previewed.',
    icon: Download,
    configFields: [],
  },
  'parse.detect_landmarks': {
    kind: 'parse.detect_landmarks',
    label: 'Detect Landmarks',
    category: 'parse',
    description: 'Finds the main content root by trying each selector below in order.',
    icon: ScanSearch,
    configFields: [
      {
        key: 'selector_priority',
        label: 'Selector priority',
        type: 'sortable-list',
        defaultValue: DEFAULT_MAIN_CONTENT_SELECTORS,
        help: 'Tried in order; the first selector that matches a non-empty element wins. Falls back to <body> if none match.',
        span: 2,
      },
      {
        key: 'fallback_strategy',
        label: 'Fallback strategy',
        type: 'select',
        defaultValue: 'main_only',
        options: [
          { value: 'main_only', label: 'Try selectors, then fall back to <body>' },
          { value: 'full_body', label: 'Always use <body>' },
        ],
        help: 'What to do when picking the content root for this page.',
      },
    ],
  },
  'filter.strip_boilerplate': {
    kind: 'filter.strip_boilerplate',
    label: 'Strip Boilerplate',
    category: 'filter',
    description: 'Removes nav/ads/social/cookie-banner elements matching any selector below before extraction.',
    icon: Eraser,
    configFields: [
      {
        key: 'boilerplate_selectors',
        label: 'Selectors to strip',
        type: 'chip-list',
        defaultValue: DEFAULT_BOILERPLATE_SELECTORS,
        help: 'Elements matching any of these are removed, unless they also match a Detect Landmarks selector.',
        span: 2,
      },
    ],
  },
  'extract.main_content': {
    kind: 'extract.main_content',
    label: 'Extract Main Content',
    category: 'extract',
    description: 'Isolates the content root found by Detect Landmarks. Configure the selectors on that node.',
    icon: FileText,
    configFields: [],
  },
  'extract.structured_data': {
    kind: 'extract.structured_data',
    label: 'Extract Structured Data',
    category: 'extract',
    description: 'Optionally pulls named fields out of the page via CSS selectors or an LLM prompt.',
    icon: Database,
    optional: true,
    configFields: [
      {
        key: 'custom_extractors_json',
        label: 'Extractors (JSON)',
        type: 'textarea',
        defaultValue: '[]',
        placeholder: '[{"name": "price", "type": "css", "selector": ".price"}]',
        help: 'A JSON array of extractors. Each is {"name", "type": "css", "selector"} or {"name", "type": "llm", "prompt"}.',
        span: 2,
      },
    ],
  },
  'transform.convert_markdown': {
    kind: 'transform.convert_markdown',
    label: 'Convert to Markdown',
    category: 'transform',
    description: 'Converts the extracted content root into clean Markdown.',
    icon: FileCode,
    configFields: [],
  },
  'output.clean_content': {
    kind: 'output.clean_content',
    label: 'Output Clean Content',
    category: 'output',
    description: 'The final Markdown, word count, reading level, and top keywords for this page.',
    icon: CheckCircle2,
    configFields: [],
  },
};

/** Fixed default sequence -- the shape buildInitialPipelineGraphDocument lays out on the canvas. */
export const DEFAULT_NODE_ORDER: PipelineNodeKind[] = [
  'trigger.on_page_load',
  'fetch.get_html',
  'parse.detect_landmarks',
  'filter.strip_boilerplate',
  'extract.main_content',
  'extract.structured_data',
  'transform.convert_markdown',
  'output.clean_content',
];
