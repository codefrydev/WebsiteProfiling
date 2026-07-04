/**
 * State for the content-extraction pipeline editor. Plain useState + the pure
 * withX(doc, ...) edit functions from pipelineGraphEdits.ts -- mirrors
 * PipelineContext.tsx's own style; this codebase has no useReducer usage
 * anywhere (see specEdits.ts's identical pattern) so this stays consistent
 * rather than introducing a new state-management convention.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { withNodeConfigValue, withNodeEnabled, withNodeMoved } from '@/lib/pipelineGraph/pipelineGraphEdits';
import { loadPipelineGraph, runPipelinePreview, savePipelineGraph } from '@/lib/pipelineGraph/pipelineGraphApi';
import {
  buildInitialPipelineGraphDocument,
  buildPipelinePreviewRequest,
} from '@/lib/pipelineGraph/pipelineGraphSerialization';
import type { PipelineConfigState } from '@/types/api';
import type {
  PipelineGraphDocument,
  PipelineGraphNode,
  PipelineNodePosition,
  PipelinePreviewResponse,
} from '@/types/pipelineGraph';

interface PipelineGraphContextValue {
  document: PipelineGraphDocument;
  loading: boolean;
  loadError: string;
  saving: boolean;
  saveMessage: string;
  dirty: boolean;

  selectedNodeId: string | null;
  selectedNode: PipelineGraphNode | null;
  selectNode: (id: string | null) => void;
  moveNode: (id: string, position: PipelineNodePosition) => void;
  setNodeEnabled: (id: string, enabled: boolean) => void;
  setNodeConfigValue: (id: string, key: string, value: string | boolean) => void;
  save: () => Promise<boolean>;

  targetUrl: string;
  setTargetUrl: (url: string) => void;
  previewing: boolean;
  previewError: string;
  previewResult: PipelinePreviewResponse | null;
  runPreview: () => Promise<void>;
}

const PipelineGraphContext = createContext<PipelineGraphContextValue | null>(null);

export function PipelineGraphProvider({ children }: { children: ReactNode }) {
  const [document, setDocument] = useState<PipelineGraphDocument>(buildInitialPipelineGraphDocument);
  const [rawState, setRawState] = useState<PipelineConfigState>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [targetUrl, setTargetUrl] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewResult, setPreviewResult] = useState<PipelinePreviewResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const loaded = await loadPipelineGraph();
        if (cancelled) return;
        setDocument(loaded.document);
        setRawState(loaded.rawState);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectNode = useCallback((id: string | null) => setSelectedNodeId(id), []);

  const moveNode = useCallback((id: string, position: PipelineNodePosition) => {
    setDocument((prev) => withNodeMoved(prev, id, position));
    setDirty(true);
  }, []);

  const setNodeEnabled = useCallback((id: string, enabled: boolean) => {
    setDocument((prev) => withNodeEnabled(prev, id, enabled));
    setDirty(true);
  }, []);

  const setNodeConfigValueFn = useCallback((id: string, key: string, value: string | boolean) => {
    setDocument((prev) => withNodeConfigValue(prev, id, key, value));
    setDirty(true);
  }, []);

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setSaveMessage('');
    try {
      await savePipelineGraph(document, rawState);
      setDirty(false);
      setSaveMessage('Saved.');
      return true;
    } catch (e) {
      setSaveMessage(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setSaving(false);
    }
  }, [document, rawState]);

  const runPreview = useCallback(async () => {
    const url = targetUrl.trim();
    if (!url) {
      setPreviewError('Enter a URL to preview.');
      return;
    }
    setPreviewing(true);
    setPreviewError('');
    try {
      const request = buildPipelinePreviewRequest(document, { url });
      const result = await runPipelinePreview(request);
      setPreviewResult(result);
      if (result.status === 'error') setPreviewError(result.error || 'Preview failed.');
    } catch (e) {
      setPreviewResult(null);
      setPreviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewing(false);
    }
  }, [document, targetUrl]);

  const selectedNode = useMemo(
    () => document.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [document, selectedNodeId],
  );

  const value = useMemo<PipelineGraphContextValue>(
    () => ({
      document,
      loading,
      loadError,
      saving,
      saveMessage,
      dirty,
      selectedNodeId,
      selectedNode,
      selectNode,
      moveNode,
      setNodeEnabled,
      setNodeConfigValue: setNodeConfigValueFn,
      save,
      targetUrl,
      setTargetUrl,
      previewing,
      previewError,
      previewResult,
      runPreview,
    }),
    [
      document,
      loading,
      loadError,
      saving,
      saveMessage,
      dirty,
      selectedNodeId,
      selectedNode,
      selectNode,
      moveNode,
      setNodeEnabled,
      setNodeConfigValueFn,
      save,
      targetUrl,
      previewing,
      previewError,
      previewResult,
      runPreview,
    ],
  );

  return <PipelineGraphContext.Provider value={value}>{children}</PipelineGraphContext.Provider>;
}

export function usePipelineGraph(): PipelineGraphContextValue {
  const ctx = useContext(PipelineGraphContext);
  if (!ctx) throw new Error('usePipelineGraph must be used within a PipelineGraphProvider');
  return ctx;
}
