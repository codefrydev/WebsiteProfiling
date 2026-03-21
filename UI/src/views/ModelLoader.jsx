import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  buildLabChatSystemWithSchema,
  formatDatabaseSchemaForPrompt,
  formatLabSchemaMarkdownBlock,
  mergeLabSystemWithSchema,
  openReportDatabase,
  openReportDatabaseFromArrayBuffer,
} from '../lib/loadReportDb.js';
import {
  extractBearerTokenFromHeaders,
  extractXGoogApiKeyFromHeaders,
  runGeminiChatWithTools,
  runGeminiChatWithToolsViaRest,
  runOpenAiChatWithTools,
} from '../lib/labChatWithTools.js';
import {
  Bot,
  Check,
  ClipboardCopy,
  Copy,
  Loader2,
  Paperclip,
  Send,
  Settings,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PageLayout, Button } from '../components';
import AssistantMarkdown from '../components/ml/AssistantMarkdown.jsx';
import { strings, format } from '../lib/strings';
import {
  buildOpenAiChatRequestBody,
  buildOpenAiCurlCommand,
  buildGeminiCurlCommand,
  geminiGenerateContentExampleBody,
  geminiGenerateContentUrl,
  openAiChatCompletionsExampleBody,
  normalizeOpenAiBaseUrl,
  openAiChatCompletionsUrl,
} from '../lib/apiProviderPresets.js';
import { parseCurlCommand } from '../lib/parseCurl.js';
import {
  createProgressAggregator,
  loadPipeline,
  vecFromOutput,
} from '../lib/transformersClient.js';

const SESSION_KEYS = 'modelLab_apiSession_v1';

function nextChatMessageId() {
  return `mlchat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function dataUrlToBase64(dataUrl) {
  const i = String(dataUrl).indexOf(',');
  if (i === -1) return '';
  return String(dataUrl).slice(i + 1);
}

/** @param {{ role: string, text: string, attachments?: Array<{ mime: string, dataUrl: string }> }} m */
function messageToGeminiParts(m) {
  const parts = [];
  if (m.text != null && String(m.text).trim()) parts.push({ text: String(m.text).trim() });
  for (const a of m.attachments || []) {
    const mime = a.mime || 'image/png';
    const data = dataUrlToBase64(a.dataUrl);
    if (data) parts.push({ inlineData: { mimeType: mime, data } });
  }
  if (parts.length === 0) parts.push({ text: '' });
  return parts;
}

/** @param {Array<{ role: string, text: string, attachments?: Array<{ mime: string, dataUrl: string }> }>} msgs */
function toGeminiChatHistory(msgs) {
  const h = [];
  for (const m of msgs) {
    if (m.role === 'user') h.push({ role: 'user', parts: messageToGeminiParts(m) });
    else if (m.role === 'assistant') h.push({ role: 'model', parts: [{ text: m.text }] });
  }
  return h;
}

/** Google REST `generateContent` uses POST body `{ contents: [...] }`, not OpenAI `messages`. */
function isGeminiGenerateContentUrl(url) {
  const u = String(url || '');
  return /generativelanguage\.googleapis\.com/i.test(u) && /:generateContent\b/i.test(u);
}

const GEMINI_CURL_DEFAULT_TEXT = 'Hello';

/**
 * `generateContent` rejects bodies without `contents`. Template / `{}` would return 400.
 * @param {string} bodyStr
 * @param {string} url
 */
function ensureGeminiGenerateContentBody(bodyStr, url) {
  if (!isGeminiGenerateContentUrl(url)) return bodyStr;
  let obj;
  try {
    obj = bodyStr.trim() ? JSON.parse(bodyStr) : {};
  } catch {
    return bodyStr;
  }
  if (!Array.isArray(obj.contents) || obj.contents.length === 0) {
    return JSON.stringify(
      {
        ...obj,
        contents: [{ parts: [{ text: GEMINI_CURL_DEFAULT_TEXT }] }],
      },
      null,
      2
    );
  }
  return bodyStr;
}

/**
 * @param {string} url
 * @param {Record<string, unknown>} bodyObj
 */
function curlChatUsesGeminiContents(url, bodyObj) {
  if (isGeminiGenerateContentUrl(url)) return true;
  return (
    Object.prototype.hasOwnProperty.call(bodyObj, 'contents') &&
    !Object.prototype.hasOwnProperty.call(bodyObj, 'messages')
  );
}

/** @param {Headers} hdrs */
function curlHeadersGet(hdrs, headerNameLc) {
  let v = '';
  hdrs.forEach((val, key) => {
    if (key.toLowerCase() === headerNameLc) v = val;
  });
  return v;
}

function curlHeadersMissingXGoogApiKey(hdrs) {
  return !curlHeadersGet(hdrs, 'x-goog-api-key').trim();
}

function curlHeadersMissingBearer(hdrs) {
  const v = curlHeadersGet(hdrs, 'authorization');
  return !/^\s*Bearer\s+\S+/i.test(v);
}

/** @param {{ role: string, text: string, attachments?: Array<{ dataUrl: string }> }} m */
function openAiUserContent(m) {
  const hasAtt = m.attachments?.length;
  if (!hasAtt) return m.text;
  const content = [];
  if (m.text != null && String(m.text).trim()) {
    content.push({ type: 'text', text: String(m.text).trim() });
  }
  for (const a of m.attachments || []) {
    content.push({ type: 'image_url', image_url: { url: a.dataUrl } });
  }
  if (content.length === 0) content.push({ type: 'text', text: '' });
  return content;
}

function isLikelyOnnxWasmRangeError(e) {
  if (!e || e.name !== 'RangeError') return false;
  return /offset is out of bounds/i.test(String(e.message || ''));
}

/** @param {unknown} systemInstruction - Gemini REST body.systemInstruction */
function extractGeminiSystemInstructionText(systemInstruction) {
  if (systemInstruction == null) return '';
  if (typeof systemInstruction === 'string') return systemInstruction;
  if (typeof systemInstruction === 'object' && Array.isArray(systemInstruction.parts)) {
    return systemInstruction.parts.map((p) => (p?.text != null ? String(p.text) : '')).join('\n');
  }
  return '';
}

const HF_TASKS = [
  { value: 'feature-extraction', label: 'feature-extraction' },
  { value: 'text-generation', label: 'text-generation' },
];

const SETTINGS_TAB_ORDER = ['model', 'apiTest', 'browser', 'curl'];

export default function ModelLoader() {
  const t = strings.views.modelLoader;
  const baseId = useId();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('model');
  /** Header dropdown: chat API (gemini | openai) or jump to settings (browser | curl). */
  const [labToolSelect, setLabToolSelect] = useState('gemini');

  /** --- Browser / HF --- */
  const [hfTask, setHfTask] = useState('feature-extraction');
  const [hfModelId, setHfModelId] = useState('Xenova/all-MiniLM-L6-v2');
  const [hfLoading, setHfLoading] = useState(false);
  const [hfProgress, setHfProgress] = useState(null);
  const [hfError, setHfError] = useState('');
  const [hfReady, setHfReady] = useState(false);
  const [hfSmoke, setHfSmoke] = useState('');
  const [hfSmokeBusy, setHfSmokeBusy] = useState(false);

  const runHfLoad = useCallback(async () => {
    const modelId = hfModelId.trim();
    if (!modelId) {
      setHfError(t.browser.modelRequired);
      return;
    }
    setHfError('');
    setHfReady(false);
    setHfSmoke('');
    setHfLoading(true);
    setHfProgress({ overall: 0, currentFile: '', bytesLine: '' });
    try {
      const progressCallback = createProgressAggregator((u) => {
        setHfProgress({
          overall: u.overall,
          currentFile: u.currentFile || '',
          bytesLine: u.bytesLine || '',
        });
      });
      await loadPipeline(hfTask, modelId, { progressCallback });
      setHfReady(true);
    } catch (e) {
      let msg = e?.message || String(e);
      if (isLikelyOnnxWasmRangeError(e)) {
        msg = `${msg} (${t.browser.onnxHint})`;
      }
      setHfError(msg);
    } finally {
      setHfLoading(false);
      setHfProgress(null);
    }
  }, [hfModelId, hfTask, t.browser.modelRequired, t.browser.onnxHint]);

  const runHfSmoke = useCallback(async () => {
    const modelId = hfModelId.trim();
    if (!modelId) return;
    setHfSmokeBusy(true);
    setHfSmoke('');
    setHfError('');
    try {
      const pipe = await loadPipeline(hfTask, modelId, {});
      if (hfTask === 'feature-extraction') {
        const out = await pipe(t.browser.smokeEmbedText, { pooling: 'mean', normalize: true });
        const vec = vecFromOutput(out);
        const len = vec?.length ?? 0;
        setHfSmoke(
          format(t.browser.smokeEmbedResult, {
            dim: String(len),
            preview: vec && vec.length ? vec.slice(0, 6).map((n) => n.toFixed(4)).join(', ') : '—',
          })
        );
      } else {
        const out = await pipe(t.browser.smokeGenText, {
          max_new_tokens: 24,
          temperature: 0.7,
          do_sample: false,
        });
        const text =
          typeof out?.generated_text === 'string'
            ? out.generated_text
            : Array.isArray(out)
              ? JSON.stringify(out[0])
              : JSON.stringify(out);
        setHfSmoke(format(t.browser.smokeGenResult, { text: String(text).slice(0, 2000) }));
      }
    } catch (e) {
      let msg = e?.message || String(e);
      if (isLikelyOnnxWasmRangeError(e)) {
        msg = `${msg} (${t.browser.onnxHint})`;
      }
      setHfError(msg);
    } finally {
      setHfSmokeBusy(false);
    }
  }, [hfModelId, hfTask, t.browser]);

  /** --- API --- */
  const [apiPreset, setApiPreset] = useState('gemini');
  const [geminiModel, setGeminiModel] = useState('gemini-flash-latest');
  const [openaiBase, setOpenaiBase] = useState('https://api.openai.com/v1');
  const [openaiModel, setOpenaiModel] = useState('gpt-4o-mini');
  const [apiKeyGemini, setApiKeyGemini] = useState('');
  const [apiKeyOpenai, setApiKeyOpenai] = useState('');
  const [apiPrompt, setApiPrompt] = useState('Say hello in one short sentence.');
  const [apiBusy, setApiBusy] = useState(false);
  const [apiOut, setApiOut] = useState('');
  const [apiErr, setApiErr] = useState('');
  const [rememberSession, setRememberSession] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEYS);
      if (!raw) return;
      const j = JSON.parse(raw);
      if (j.remember && typeof j === 'object') {
        setRememberSession(true);
        if (typeof j.geminiKey === 'string') setApiKeyGemini(j.geminiKey);
        if (typeof j.openaiKey === 'string') setApiKeyOpenai(j.openaiKey);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!rememberSession) {
      try {
        sessionStorage.removeItem(SESSION_KEYS);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      sessionStorage.setItem(
        SESSION_KEYS,
        JSON.stringify({
          remember: true,
          geminiKey: apiKeyGemini,
          openaiKey: apiKeyOpenai,
        })
      );
    } catch {
      /* ignore */
    }
  }, [rememberSession, apiKeyGemini, apiKeyOpenai]);

  const apiKey = apiPreset === 'gemini' ? apiKeyGemini : apiKeyOpenai;
  const setApiKey = apiPreset === 'gemini' ? setApiKeyGemini : setApiKeyOpenai;

  const runGemini = useCallback(async () => {
    const key = apiKey.trim();
    if (!key) throw new Error(t.api.keyRequired);
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: geminiModel.trim() });
    const result = await model.generateContent(apiPrompt);
    const text = result.response.text();
    return text;
  }, [apiKey, apiPrompt, geminiModel, t.api.keyRequired]);

  const runOpenAi = useCallback(async () => {
    const key = apiKey.trim();
    if (!key) throw new Error(t.api.keyRequired);
    const url = openAiChatCompletionsUrl(openaiBase);
    const body = buildOpenAiChatRequestBody({
      baseUrl: openaiBase,
      apiKey: key,
      model: openaiModel.trim(),
      prompt: apiPrompt,
    });
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = json?.error?.message || json?.message || res.statusText || String(res.status);
      throw new Error(errMsg);
    }
    const text = json?.choices?.[0]?.message?.content;
    return text != null ? String(text) : JSON.stringify(json);
  }, [apiKey, apiPrompt, openaiBase, openaiModel, t.api.keyRequired]);

  const sendApi = useCallback(async () => {
    setApiBusy(true);
    setApiErr('');
    setApiOut('');
    try {
      const text = apiPreset === 'gemini' ? await runGemini() : await runOpenAi();
      setApiOut(text);
    } catch (e) {
      const msg = e?.message || String(e);
      setApiErr(
        /failed to fetch|networkerror|cors/i.test(msg)
          ? `${msg}\n\n${t.api.corsDetail}`
          : msg
      );
    } finally {
      setApiBusy(false);
    }
  }, [apiPreset, runGemini, runOpenAi, t.api.corsDetail]);

  const copyPresetCurl = useCallback(async () => {
    const key = apiKey.trim();
    if (!key) {
      setApiErr(t.api.keyRequired);
      return;
    }
    const cmd =
      apiPreset === 'gemini'
        ? buildGeminiCurlCommand({ apiKey: key, model: geminiModel.trim(), prompt: apiPrompt })
        : buildOpenAiCurlCommand({
            baseUrl: openaiBase,
            apiKey: key,
            model: openaiModel.trim(),
            prompt: apiPrompt,
          });
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setApiErr(t.api.copyFailed);
    }
  }, [apiKey, apiPreset, apiPrompt, geminiModel, openaiBase, openaiModel, t.api]);

  /** --- Chat (multi-turn) --- */
  const [chatMessages, setChatMessages] = useState([]);
  const [chatDraft, setChatDraft] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatErr, setChatErr] = useState('');
  const [chatSystemInstruction, setChatSystemInstruction] = useState('');
  const chatScrollRef = useRef(null);
  const chatComposerRef = useRef(null);
  const chatAttachInputRef = useRef(null);
  const labDbFileInputRef = useRef(null);
  const labToolThreadRef = useRef(null);

  const [labSqlDb, setLabSqlDb] = useState(null);
  const [labDbLoading, setLabDbLoading] = useState(false);
  const [labDbError, setLabDbError] = useState('');
  const [labDbLabel, setLabDbLabel] = useState('');
  const [labSchemaCopied, setLabSchemaCopied] = useState(false);

  const setLabDb = useCallback((db, label) => {
    setLabSqlDb((prev) => {
      try {
        prev?.close();
      } catch {
        /* ignore */
      }
      return db;
    });
    labToolThreadRef.current = null;
    setLabDbLabel(label ?? '');
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLabDbLoading(true);
    setLabDbError('');
    const url = `${import.meta.env.BASE_URL}report.db`;
    (async () => {
      try {
        const db = await openReportDatabase(url);
        if (cancelled) {
          try {
            db.close();
          } catch {
            /* ignore */
          }
          return;
        }
        setLabDb(db, url);
        setLabDbError('');
      } catch (e) {
        if (!cancelled) {
          setLabDb(null, '');
          setLabDbError(e?.message || String(e));
        }
      } finally {
        if (!cancelled) setLabDbLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setLabDb]);

  useEffect(() => {
    return () => {
      try {
        labSqlDb?.close();
      } catch {
        /* ignore */
      }
    };
  }, [labSqlDb]);

  const reloadLabDbFromUrl = useCallback(async () => {
    setLabDbLoading(true);
    setLabDbError('');
    try {
      const url = `${import.meta.env.BASE_URL}report.db`;
      const db = await openReportDatabase(url);
      setLabDb(db, url);
      setLabDbError('');
    } catch (e) {
      setLabDb(null, '');
      setLabDbError(e?.message || String(e));
    } finally {
      setLabDbLoading(false);
    }
  }, [setLabDb]);

  const onLabDbFile = useCallback(
    async (fileList) => {
      const file = fileList?.[0];
      if (!file) return;
      setLabDbLoading(true);
      setLabDbError('');
      try {
        const buf = await file.arrayBuffer();
        const db = await openReportDatabaseFromArrayBuffer(buf);
        setLabDb(db, file.name);
        setLabDbError('');
      } catch (e) {
        setLabDb(null, '');
        setLabDbError(e?.message || String(e));
      } finally {
        setLabDbLoading(false);
      }
    },
    [setLabDb]
  );

  const labSchemaText = useMemo(
    () => (labSqlDb ? formatDatabaseSchemaForPrompt(labSqlDb) : ''),
    [labSqlDb]
  );

  const chatSystemEffective = useMemo(
    () => buildLabChatSystemWithSchema(chatSystemInstruction, labSchemaText),
    [chatSystemInstruction, labSchemaText]
  );

  const copyLabSchemaForCurl = useCallback(async () => {
    const block = formatLabSchemaMarkdownBlock(labSchemaText);
    if (!block) return;
    try {
      await navigator.clipboard.writeText(block);
      setLabSchemaCopied(true);
      setTimeout(() => setLabSchemaCopied(false), 2000);
    } catch {
      setChatErr(t.api.copyFailed);
    }
  }, [labSchemaText, t.api.copyFailed]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages, chatBusy, pendingAttachments]);

  useEffect(() => {
    const el = chatComposerRef.current;
    if (el && !chatDraft) {
      el.style.height = 'auto';
    }
  }, [chatDraft]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen]);

  const activeModelSummary = useMemo(() => {
    if (apiPreset === 'gemini') {
      return `${t.api.presetGemini} · ${geminiModel.trim() || '—'}`;
    }
    return `${t.api.presetOpenAi} · ${openaiModel.trim() || '—'}`;
  }, [apiPreset, geminiModel, openaiModel, t.api.presetGemini, t.api.presetOpenAi]);

  const addChatImageFiles = useCallback((fileList) => {
    if (!fileList?.length) return;
    for (const file of fileList) {
      if (!file.type.startsWith('image/')) continue;
      const id = nextChatMessageId();
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        if (typeof dataUrl === 'string') {
          setPendingAttachments((prev) => [...prev, { id, mime: file.type, dataUrl }]);
        }
      };
      reader.readAsDataURL(file);
    }
  }, []);

  /** --- Curl import (state must be above sendChatTurn — curl fields are used in chat when Curl mode) --- */
  const [curlPaste, setCurlPaste] = useState('');
  const [curlMethod, setCurlMethod] = useState('GET');
  const [curlUrl, setCurlUrl] = useState('');
  const [curlHeadersText, setCurlHeadersText] = useState('');
  const [curlBody, setCurlBody] = useState('');
  const [curlParseWarn, setCurlParseWarn] = useState([]);
  const [curlErr, setCurlErr] = useState('');
  const [curlRes, setCurlRes] = useState('');
  const [curlStatus, setCurlStatus] = useState('');
  const [curlBusy, setCurlBusy] = useState(false);

  const sendChatTurn = useCallback(async () => {
    const text = chatDraft.trim();
    if ((!text && !pendingAttachments.length) || chatBusy) return;
    const key = apiKey.trim();
    const useCurlTransport = labToolSelect === 'curl';
    if (!useCurlTransport && !key) {
      setChatErr(t.api.keyRequired);
      return;
    }
    setChatErr('');
    const attachmentsSnapshot = pendingAttachments.map(({ id, mime, dataUrl }) => ({
      id,
      mime,
      dataUrl,
    }));
    setChatDraft('');
    setPendingAttachments([]);
    const userMsg = { id: nextChatMessageId(), role: 'user', text, ts: Date.now() };
    if (attachmentsSnapshot.length) userMsg.attachments = attachmentsSnapshot;
    const conv = [...chatMessages, userMsg];
    setChatMessages(conv);
    setChatBusy(true);
    try {
      let replyText = '';
      const canUseDbTools = labSqlDb && (apiPreset === 'gemini' || apiPreset === 'openai');
      const useSdkTools = canUseDbTools && !useCurlTransport;
      const useCurlTools = canUseDbTools && useCurlTransport;

      if (useSdkTools || useCurlTools) {
        const thread = labToolThreadRef.current;
        const prior = conv.slice(0, -1);
        /** @type {Array<Record<string, unknown>>} */
        let msgs;
        if (thread === null) {
          msgs = [];
          if (chatSystemEffective) {
            msgs.push({ role: 'system', content: chatSystemEffective });
          }
          for (const m of prior) {
            if (m.role === 'user') {
              msgs.push({ role: 'user', content: openAiUserContent(m) });
            } else {
              msgs.push({ role: 'assistant', content: m.text });
            }
          }
          msgs.push({ role: 'user', content: openAiUserContent(userMsg) });
        } else {
          msgs = [...thread, { role: 'user', content: openAiUserContent(userMsg) }];
        }

        const toolOpts = {
          messages: msgs,
          sqlDb: labSqlDb,
          data: null,
        };

        if (useCurlTools) {
          if (apiPreset === 'gemini') {
            const gk = apiKeyGemini.trim() || extractXGoogApiKeyFromHeaders(curlHeadersText);
            if (!gk) {
              throw new Error(t.chat.curlToolsGeminiKeyRequired);
            }
            const result = await runGeminiChatWithToolsViaRest({
              ...toolOpts,
              apiKey: gk,
              model: geminiModel.trim(),
            });
            labToolThreadRef.current = result.thread;
            replyText = result.replyText;
          } else {
            const ok = apiKeyOpenai.trim() || extractBearerTokenFromHeaders(curlHeadersText);
            if (!ok) {
              throw new Error(t.chat.curlToolsOpenAiKeyRequired);
            }
            const result = await runOpenAiChatWithTools({
              ...toolOpts,
              apiKey: ok,
              baseUrl: openaiBase,
              model: openaiModel.trim(),
            });
            labToolThreadRef.current = result.thread;
            replyText = result.replyText;
          }
        } else {
          const result =
            apiPreset === 'gemini'
              ? await runGeminiChatWithTools({
                  ...toolOpts,
                  apiKey: key,
                  model: geminiModel.trim(),
                })
              : await runOpenAiChatWithTools({
                  ...toolOpts,
                  apiKey: key,
                  baseUrl: openaiBase,
                  model: openaiModel.trim(),
                });
          labToolThreadRef.current = result.thread;
          replyText = result.replyText;
        }
      } else if (useCurlTransport) {
        const url = curlUrl.trim();
        if (!url) {
          throw new Error(t.chat.curlChatUrlRequired);
        }
        const method = curlMethod.toUpperCase();
        if (!['POST', 'PUT', 'PATCH'].includes(method)) {
          throw new Error(t.chat.curlChatMethodPost);
        }
        let bodyObj;
        try {
          bodyObj = curlBody.trim() ? JSON.parse(curlBody) : {};
        } catch {
          throw new Error(t.chat.curlChatBodyInvalid);
        }
        if (bodyObj == null || typeof bodyObj !== 'object' || Array.isArray(bodyObj)) {
          throw new Error(t.chat.curlChatBodyInvalid);
        }
        const geminiContents = curlChatUsesGeminiContents(url, bodyObj);
        if (geminiContents) {
          delete bodyObj.messages;
          bodyObj.contents = toGeminiChatHistory(conv);
          const existingSys = extractGeminiSystemInstructionText(bodyObj.systemInstruction);
          const mergedSys = mergeLabSystemWithSchema(
            existingSys,
            chatSystemInstruction,
            labSchemaText
          );
          if (mergedSys) {
            bodyObj.systemInstruction = { parts: [{ text: mergedSys }] };
          }
        } else {
          delete bodyObj.contents;
          const msgs = [];
          if (chatSystemEffective) {
            msgs.push({ role: 'system', content: chatSystemEffective });
          }
          for (const m of conv) {
            msgs.push({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: m.role === 'assistant' ? m.text : openAiUserContent(m),
            });
          }
          bodyObj.messages = msgs;
          if (bodyObj.max_tokens == null && bodyObj.max_completion_tokens == null) {
            bodyObj.max_tokens = 2048;
          }
          if (bodyObj.model == null && openaiModel.trim()) {
            bodyObj.model = openaiModel.trim();
          }
        }
        const hdrs = new Headers();
        let hasContentType = false;
        const lines = curlHeadersText.split('\n').map((l) => l.trim()).filter(Boolean);
        for (const line of lines) {
          const idx = line.indexOf(':');
          if (idx === -1) continue;
          const k = line.slice(0, idx).trim();
          const v = line.slice(idx + 1).trim();
          if (!k) continue;
          hdrs.set(k, v);
          if (k.toLowerCase() === 'content-type') hasContentType = true;
        }
        if (!hasContentType) {
          hdrs.set('Content-Type', 'application/json');
        }
        if (geminiContents && curlHeadersMissingXGoogApiKey(hdrs) && apiKeyGemini.trim()) {
          hdrs.set('X-goog-api-key', apiKeyGemini.trim());
        }
        if (geminiContents && curlHeadersMissingXGoogApiKey(hdrs)) {
          throw new Error(t.chat.curlToolsGeminiKeyRequired);
        }
        if (!geminiContents && apiPreset === 'openai' && curlHeadersMissingBearer(hdrs) && apiKeyOpenai.trim()) {
          hdrs.set('Authorization', `Bearer ${apiKeyOpenai.trim()}`);
        }
        if (!geminiContents && apiPreset === 'openai' && curlHeadersMissingBearer(hdrs)) {
          throw new Error(t.chat.curlToolsOpenAiKeyRequired);
        }
        const res = await fetch(url, {
          method,
          headers: hdrs,
          body: JSON.stringify(bodyObj),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          const errMsg = json?.error?.message || json?.message || res.statusText || String(res.status);
          throw new Error(errMsg);
        }
        if (json?.choices?.[0]?.message?.content != null) {
          replyText = String(json.choices[0].message.content);
        } else {
          const parts = json?.candidates?.[0]?.content?.parts;
          if (Array.isArray(parts) && parts.length) {
            replyText = parts.map((p) => (p?.text != null ? String(p.text) : '')).join('');
          }
          if (!replyText) {
            replyText = JSON.stringify(json);
          }
        }
      } else if (apiPreset === 'gemini') {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({
          model: geminiModel.trim(),
          ...(chatSystemEffective ? { systemInstruction: chatSystemEffective } : {}),
        });
        const prior = conv.slice(0, -1);
        const history = toGeminiChatHistory(prior);
        const chatSession = model.startChat({ history });
        const result = await chatSession.sendMessage(messageToGeminiParts(userMsg));
        replyText = result.response.text();
      } else {
        const url = openAiChatCompletionsUrl(openaiBase);
        const msgs = [];
        if (chatSystemEffective) {
          msgs.push({ role: 'system', content: chatSystemEffective });
        }
        for (const m of conv) {
          msgs.push({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.role === 'assistant' ? m.text : openAiUserContent(m),
          });
        }
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: openaiModel.trim(),
            messages: msgs,
            max_tokens: 2048,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          const errMsg = json?.error?.message || json?.message || res.statusText || String(res.status);
          throw new Error(errMsg);
        }
        replyText =
          json?.choices?.[0]?.message?.content != null
            ? String(json.choices[0].message.content)
            : JSON.stringify(json);
      }
      setChatMessages((prev) => [
        ...prev,
        { id: nextChatMessageId(), role: 'assistant', text: replyText, ts: Date.now() },
      ]);
    } catch (e) {
      const msg = e?.message || String(e);
      setChatErr(
        /failed to fetch|networkerror|cors/i.test(msg) ? `${msg}\n\n${t.api.corsDetail}` : msg
      );
    } finally {
      setChatBusy(false);
    }
  }, [
    apiKey,
    apiPreset,
    chatBusy,
    chatDraft,
    chatMessages,
    pendingAttachments,
    chatSystemEffective,
    geminiModel,
    openaiBase,
    openaiModel,
    t.api.corsDetail,
    t.api.keyRequired,
    labToolSelect,
    curlUrl,
    curlMethod,
    curlHeadersText,
    curlBody,
    t.chat.curlChatUrlRequired,
    t.chat.curlChatBodyInvalid,
    t.chat.curlChatMethodPost,
    labSchemaText,
    chatSystemInstruction,
    labSqlDb,
    apiKeyGemini,
    apiKeyOpenai,
    t.chat.curlToolsGeminiKeyRequired,
    t.chat.curlToolsOpenAiKeyRequired,
  ]);

  const clearChat = useCallback(() => {
    labToolThreadRef.current = null;
    setChatMessages([]);
    setChatErr('');
    setChatDraft('');
    setPendingAttachments([]);
  }, []);

  const parseCurl = useCallback(() => {
    setCurlErr('');
    setCurlParseWarn([]);
    const parsed = parseCurlCommand(curlPaste);
    if (parsed.error) {
      setCurlErr(parsed.error);
      return;
    }
    setCurlMethod(parsed.method);
    setCurlUrl(parsed.url);
    setCurlBody(parsed.body || '');
    const lines = Object.entries(parsed.headers).map(([k, v]) => `${k}: ${v}`);
    setCurlHeadersText(lines.join('\n'));
    setCurlParseWarn(parsed.warnings || []);
  }, [curlPaste]);

  /** Fill Curl fields for Google `generateContent` (same base URL as official docs). */
  const applyGeminiCurlTemplate = useCallback(() => {
    setCurlErr('');
    setCurlParseWarn([]);
    setCurlUrl(geminiGenerateContentUrl(geminiModel.trim()));
    setCurlMethod('POST');
    const lines = ['Content-Type: application/json'];
    const k = apiKeyGemini.trim();
    if (k) lines.push(`X-goog-api-key: ${k}`);
    setCurlHeadersText(lines.join('\n'));
    setCurlBody(JSON.stringify(geminiGenerateContentExampleBody(), null, 2));
  }, [apiKeyGemini, geminiModel]);

  const applyOpenAiCurlTemplate = useCallback(() => {
    setCurlErr('');
    setCurlParseWarn([]);
    setCurlUrl(openAiChatCompletionsUrl(openaiBase));
    setCurlMethod('POST');
    const lines = ['Content-Type: application/json'];
    const k = apiKeyOpenai.trim();
    if (k) lines.push(`Authorization: Bearer ${k}`);
    setCurlHeadersText(lines.join('\n'));
    setCurlBody(JSON.stringify(openAiChatCompletionsExampleBody({ model: openaiModel.trim() }), null, 2));
  }, [apiKeyOpenai, openaiBase, openaiModel]);

  const sendCurl = useCallback(async () => {
    setCurlBusy(true);
    setCurlErr('');
    setCurlRes('');
    setCurlStatus('');
    try {
      const hdrs = new Headers();
      const lines = curlHeadersText.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const idx = line.indexOf(':');
        if (idx === -1) continue;
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim();
        if (k) hdrs.set(k, v);
      }
      const urlTrim = curlUrl.trim();
      if (isGeminiGenerateContentUrl(urlTrim) && curlHeadersMissingXGoogApiKey(hdrs) && apiKeyGemini.trim()) {
        hdrs.set('X-goog-api-key', apiKeyGemini.trim());
      }
      if (
        !isGeminiGenerateContentUrl(urlTrim) &&
        /\/chat\/completions\b/i.test(urlTrim) &&
        curlHeadersMissingBearer(hdrs) &&
        apiKeyOpenai.trim()
      ) {
        hdrs.set('Authorization', `Bearer ${apiKeyOpenai.trim()}`);
      }
      if (isGeminiGenerateContentUrl(urlTrim) && curlHeadersMissingXGoogApiKey(hdrs)) {
        throw new Error(t.chat.curlToolsGeminiKeyRequired);
      }
      if (
        !isGeminiGenerateContentUrl(urlTrim) &&
        /\/chat\/completions\b/i.test(urlTrim) &&
        curlHeadersMissingBearer(hdrs)
      ) {
        throw new Error(t.chat.curlToolsOpenAiKeyRequired);
      }
      const method = curlMethod.toUpperCase();
      const init = {
        method,
        headers: hdrs,
      };
      if (method !== 'GET' && method !== 'HEAD') {
        if (isGeminiGenerateContentUrl(urlTrim)) {
          const raw = curlBody.trim() || '{}';
          init.body = ensureGeminiGenerateContentBody(raw, urlTrim);
        } else if (curlBody) {
          init.body = curlBody;
        }
      }
      const res = await fetch(curlUrl.trim(), init);
      setCurlStatus(`${res.status} ${res.statusText}`);
      const ct = res.headers.get('content-type') || '';
      const raw = await res.text();
      if (ct.includes('application/json')) {
        try {
          setCurlRes(JSON.stringify(JSON.parse(raw), null, 2));
        } catch {
          setCurlRes(raw);
        }
      } else {
        setCurlRes(raw.slice(0, 32000));
      }
    } catch (e) {
      const msg = e?.message || String(e);
      setCurlErr(/failed to fetch|networkerror|cors/i.test(msg) ? `${msg}\n\n${t.curl.corsHint}` : msg);
    } finally {
      setCurlBusy(false);
    }
  }, [
    apiKeyGemini,
    apiKeyOpenai,
    curlBody,
    curlHeadersText,
    curlMethod,
    curlUrl,
    t.chat.curlToolsGeminiKeyRequired,
    t.chat.curlToolsOpenAiKeyRequired,
    t.curl.corsHint,
  ]);

  const hfProgressPct = hfProgress?.overall ?? 0;

  return (
    <PageLayout
      maxWidth={false}
      className="flex min-h-0 flex-1 flex-col !px-3 !pb-2 !pt-0 sm:!px-4 lg:!px-5"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-default bg-brand-800/40 shadow-sm">
        <header className="sticky top-0 z-10 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-default bg-brand-900/85 px-3 py-2.5 backdrop-blur-md sm:gap-3 sm:px-4 sm:py-3">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
            <span className="truncate bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-sm font-black text-transparent sm:text-base">
              {t.title}
            </span>
            <span className="shrink-0 rounded border border-indigo-500/25 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-400">
              lab
            </span>
            {(labToolSelect === 'gemini' || labToolSelect === 'openai') && (
              <span
                className="hidden min-w-0 truncate font-mono text-[10px] text-muted-foreground md:inline sm:text-[11px]"
                title={activeModelSummary}
              >
                {activeModelSummary}
              </span>
            )}
          </div>
          <div className="flex w-full shrink-0 items-center justify-end gap-1.5 sm:w-auto sm:gap-2">
            <label htmlFor={`${baseId}-lab-tool`} className="sr-only">
              {t.toolSelectLabel}
            </label>
            <select
              id={`${baseId}-lab-tool`}
              value={labToolSelect}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'gemini' || v === 'openai') {
                  setApiPreset(v);
                  setLabToolSelect(v);
                } else if (v === 'browser') {
                  setSettingsTab('browser');
                  setSettingsOpen(true);
                  setLabToolSelect('browser');
                } else if (v === 'curl') {
                  setSettingsTab('curl');
                  setSettingsOpen(true);
                  setLabToolSelect('curl');
                }
              }}
              className="max-w-[min(100%,11rem)] shrink rounded-lg border border-default bg-brand-800 py-1.5 pl-2 pr-7 text-[11px] text-foreground outline-none focus:border-blue-500 sm:max-w-[14rem] sm:py-2 sm:text-xs"
            >
              <option value="gemini">{t.api.presetGemini}</option>
              <option value="openai">{t.api.presetOpenAi}</option>
              <option value="browser">{t.toolOptionHF}</option>
              <option value="curl">{t.settings.tabs.curl}</option>
            </select>
            <Button
              type="button"
              variant="secondary"
              className="shrink-0 px-2 sm:px-3"
              onClick={clearChat}
              disabled={chatBusy || chatMessages.length === 0}
              title={t.chat.clear}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only sm:not-sr-only sm:ml-1 sm:inline">{t.chat.clear}</span>
            </Button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-default bg-brand-800 px-2 py-2 text-sm font-medium text-foreground transition-colors hover:bg-brand-700/80 sm:gap-2 sm:px-3"
              aria-expanded={settingsOpen}
              aria-haspopup="dialog"
              title={t.settings.openButton}
            >
              <Settings className="h-4 w-4 shrink-0" />
              <span className="sr-only sm:not-sr-only sm:inline">{t.settings.openButton}</span>
            </button>
          </div>
        </header>

        <div
          ref={chatScrollRef}
          className="custom-scrollbar-chat min-h-0 flex-1 overflow-y-auto bg-brand-900/20"
        >
          <div className="mx-auto max-w-3xl px-4 py-6">
            {chatMessages.length === 0 ? (
              <div className="flex min-h-[min(50vh,360px)] flex-col items-center justify-center px-4 text-center">
                <p className="max-w-md text-sm text-muted-foreground">{t.chat.emptyHint}</p>
                <p className="mt-3 text-xs text-muted-foreground/80">{t.chat.openSettingsHint}</p>
              </div>
            ) : (
              chatMessages.map((m) => {
                const timeLabel =
                  m.ts != null
                    ? (() => {
                        try {
                          return new Date(m.ts).toLocaleTimeString(undefined, {
                            hour: '2-digit',
                            minute: '2-digit',
                          });
                        } catch {
                          return '';
                        }
                      })()
                    : '';
                return (
                  <div
                    key={m.id}
                    className={`mb-10 flex gap-4 md:gap-6 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
                  >
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm md:h-10 md:w-10 ${
                        m.role === 'assistant'
                          ? 'border border-emerald-500/25 bg-gradient-to-br from-emerald-600/90 to-emerald-700/90 text-white'
                          : 'border border-indigo-400/45 bg-indigo-100/80 text-indigo-900 dark:border-indigo-400/35 dark:bg-indigo-500/20 dark:text-indigo-100'
                      }`}
                    >
                      {m.role === 'assistant' ? (
                        <Bot className="h-5 w-5 md:h-[22px] md:w-[22px]" aria-hidden />
                      ) : (
                        <User className="h-5 w-5 md:h-[22px] md:w-[22px]" aria-hidden />
                      )}
                    </div>
                    <div
                      className={`flex min-w-0 flex-1 flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`w-full min-w-0 text-[13px] leading-relaxed md:text-[15px] ${
                          m.role === 'user'
                            ? 'max-w-[min(92%,28rem)] rounded-2xl rounded-tr-none bg-indigo-600 px-4 py-3 text-white shadow-md'
                            : 'text-foreground'
                        }`}
                      >
                        {m.role === 'assistant' ? (
                          <AssistantMarkdown>{m.text}</AssistantMarkdown>
                        ) : (
                          <>
                            {m.attachments?.length ? (
                              <div className="mb-2 flex flex-wrap gap-2">
                                {m.attachments.map((a) => (
                                  <img
                                    key={a.id}
                                    src={a.dataUrl}
                                    alt=""
                                    className="max-h-32 max-w-[min(100%,220px)] rounded-lg border border-default object-cover"
                                  />
                                ))}
                              </div>
                            ) : null}
                            {m.text ? <div className="whitespace-pre-wrap">{m.text}</div> : null}
                          </>
                        )}
                      </div>
                      {timeLabel ? (
                        <span className="mt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {timeLabel}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
            {chatBusy ? (
              <div className="mb-10 flex gap-4 md:gap-6">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-default bg-brand-800 md:h-10 md:w-10">
                  <Bot className="h-5 w-5 text-muted-foreground" aria-hidden />
                </div>
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-default bg-brand-800/70 px-4 py-3 shadow-sm">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0.3s]" />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {chatErr ? (
          <div className="shrink-0 border-t border-default px-4 pb-2 pt-2">
            <p className="break-words whitespace-pre-wrap text-sm text-red-400" role="alert">
              {chatErr}
            </p>
          </div>
        ) : null}

        <div className="shrink-0 border-t border-default bg-gradient-to-t from-brand-900 via-brand-900/95 to-transparent px-4 pb-5 pt-3 md:px-6">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
            {pendingAttachments.length ? (
              <div className="flex flex-wrap gap-2">
                {pendingAttachments.map((a) => (
                  <div key={a.id} className="relative">
                    <img
                      src={a.dataUrl}
                      alt=""
                      className="h-20 w-20 rounded-lg border border-default object-cover"
                    />
                    <button
                      type="button"
                      className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-default bg-brand-900 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setPendingAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                      aria-label={t.chat.removeAttachmentAria}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {labDbError ? (
              <p className="rounded-lg border border-amber-500/25 bg-amber-100/50 dark:bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-900 dark:text-amber-200/90">
                {labDbError}
              </p>
            ) : null}
            <p className="text-[11px] text-muted-foreground/90">{t.chat.imageMarkdownNotice}</p>
            {labToolSelect === 'curl' ? (
              <p className="text-[11px] text-muted-foreground/90">{t.chat.curlToolsExplainer}</p>
            ) : null}
            <input
              ref={chatAttachInputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                addChatImageFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <div className="relative flex items-end gap-2 rounded-2xl border border-default bg-brand-900/90 p-2 shadow-lg focus-within:ring-2 focus-within:ring-indigo-500/40">
              <button
                type="button"
                className="shrink-0 rounded-xl p-2.5 text-muted-foreground transition-colors hover:text-indigo-400 disabled:opacity-40"
                onClick={() => chatAttachInputRef.current?.click()}
                disabled={chatBusy}
                title={t.chat.attachImages}
              >
                <Paperclip className="h-5 w-5" aria-hidden />
                <span className="sr-only">{t.chat.attachImages}</span>
              </button>
              <label className="sr-only" htmlFor={`${baseId}-chat-composer`}>
                {t.chat.composerPlaceholder}
              </label>
              <textarea
                ref={chatComposerRef}
                id={`${baseId}-chat-composer`}
                rows={1}
                value={chatDraft}
                onChange={(e) => {
                  setChatDraft(e.target.value);
                  const el = e.target;
                  el.style.height = 'auto';
                  el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendChatTurn();
                  }
                }}
                placeholder={t.chat.composerPlaceholder}
                disabled={chatBusy}
                className="max-h-[260px] min-h-[44px] flex-1 resize-none bg-transparent py-2.5 pl-1 pr-1 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
              />
              <button
                type="button"
                onClick={sendChatTurn}
                disabled={chatBusy || (!chatDraft.trim() && !pendingAttachments.length)}
                className={`shrink-0 rounded-xl p-2.5 transition-all ${
                  chatBusy || (!chatDraft.trim() && !pendingAttachments.length)
                    ? 'cursor-not-allowed text-muted-foreground/50'
                    : 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20 hover:scale-[1.02] active:scale-[0.98]'
                }`}
                aria-label={t.chat.send}
              >
                {chatBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            </div>
            <p className="text-center text-[10px] font-medium text-muted-foreground">{t.chat.footerNote}</p>
          </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar-chat::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar-chat::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar-chat::-webkit-scrollbar-thumb {
          background: color-mix(in oklab, var(--color-muted-foreground) 45%, transparent);
          border-radius: 10px;
        }
        .custom-scrollbar-chat { scrollbar-width: thin; scrollbar-color: color-mix(in oklab, var(--color-muted-foreground) 45%, transparent) transparent; }
      `}</style>

      {settingsOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-[1px]"
            aria-label={t.settings.closeAria}
            onClick={() => setSettingsOpen(false)}
          />
          <aside
            className="fixed top-0 right-0 z-[71] flex h-full w-full max-w-lg flex-col border-l border-default bg-brand-800 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${baseId}-settings-title`}
          >
            <div className="shrink-0 flex items-center justify-between gap-3 border-b border-default px-4 py-3">
              <h2 id={`${baseId}-settings-title`} className="text-lg font-semibold text-bright">
                {t.settings.title}
              </h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-lg border border-transparent p-2 text-muted-foreground hover:bg-brand-700/80 hover:text-foreground"
                aria-label={t.settings.closeAria}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div
              className="shrink-0 flex flex-wrap gap-1 border-b border-default px-2 pt-2 bg-brand-800/50"
              role="tablist"
              aria-label={t.settings.tablistAria}
            >
              {SETTINGS_TAB_ORDER.map((tid) => (
                <button
                  key={tid}
                  type="button"
                  role="tab"
                  aria-selected={settingsTab === tid}
                  aria-controls={`${baseId}-panel-${tid}`}
                  id={`${baseId}-settings-tab-${tid}`}
                  className={`px-3 py-2 text-xs sm:text-sm font-medium rounded-t-lg border border-b-0 transition-colors ${
                    settingsTab === tid
                      ? 'border-default bg-brand-800 text-bright'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-brand-800/60'
                  }`}
                  onClick={() => setSettingsTab(tid)}
                >
                  {t.settings.tabs[tid]}
                </button>
              ))}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
              {settingsTab === 'model' && (
              <section
                role="tabpanel"
                id={`${baseId}-panel-model`}
                aria-labelledby={`${baseId}-settings-tab-model`}
                className="space-y-4"
              >
                <h3 id={`${baseId}-sec-model`} className="sr-only">
                  {t.settings.sectionModel}
                </h3>
                <p className="text-xs text-amber-900 dark:text-amber-200/85 border border-amber-500/25 rounded-lg px-3 py-2 bg-amber-100/50 dark:bg-amber-500/5">
                  {t.api.keyWarning}
                </p>
                <div className="flex flex-wrap gap-2">
                  {['gemini', 'openai'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setApiPreset(p);
                        setLabToolSelect(p);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        apiPreset === p
                          ? 'border-blue-500 bg-blue-500/15 text-bright'
                          : 'border-default text-muted-foreground hover:bg-brand-800/80'
                      }`}
                    >
                      {p === 'gemini' ? t.api.presetGemini : t.api.presetOpenAi}
                    </button>
                  ))}
                </div>
                {apiPreset === 'gemini' ? (
                  <div>
                    <label htmlFor={`${baseId}-set-gemini-model`} className="block text-xs font-medium text-muted-foreground mb-1.5">
                      {t.api.modelLabel}
                    </label>
                    <input
                      id={`${baseId}-set-gemini-model`}
                      value={geminiModel}
                      onChange={(e) => setGeminiModel(e.target.value)}
                      className="w-full font-mono text-sm bg-brand-900 border border-default rounded-lg px-3 py-2 text-foreground outline-none focus:border-blue-500"
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label htmlFor={`${baseId}-set-openai-base`} className="block text-xs font-medium text-muted-foreground mb-1.5">
                        {t.api.baseUrlLabel}
                      </label>
                      <input
                        id={`${baseId}-set-openai-base`}
                        value={openaiBase}
                        onChange={(e) => setOpenaiBase(e.target.value)}
                        placeholder={normalizeOpenAiBaseUrl('')}
                        className="w-full font-mono text-sm bg-brand-900 border border-default rounded-lg px-3 py-2 text-foreground outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label htmlFor={`${baseId}-set-openai-model`} className="block text-xs font-medium text-muted-foreground mb-1.5">
                        {t.api.modelLabel}
                      </label>
                      <input
                        id={`${baseId}-set-openai-model`}
                        value={openaiModel}
                        onChange={(e) => setOpenaiModel(e.target.value)}
                        className="w-full font-mono text-sm bg-brand-900 border border-default rounded-lg px-3 py-2 text-foreground outline-none focus:border-blue-500"
                      />
                    </div>
                  </>
                )}
                <div>
                  <label htmlFor={`${baseId}-set-apikey`} className="block text-xs font-medium text-muted-foreground mb-1.5">
                    {t.api.apiKeyLabel}
                  </label>
                  <input
                    id={`${baseId}-set-apikey`}
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full font-mono text-sm bg-brand-900 border border-default rounded-lg px-3 py-2 text-foreground outline-none focus:border-blue-500"
                    placeholder={t.api.apiKeyPlaceholder}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberSession}
                    onChange={(e) => setRememberSession(e.target.checked)}
                    className="rounded border-default"
                  />
                  {t.api.rememberSession}
                </label>
                <div>
                  <label htmlFor={`${baseId}-set-system`} className="block text-xs font-medium text-muted-foreground mb-1.5">
                    {t.chat.systemLabel}
                  </label>
                  <textarea
                    id={`${baseId}-set-system`}
                    value={chatSystemInstruction}
                    onChange={(e) => setChatSystemInstruction(e.target.value)}
                    rows={3}
                    placeholder={t.chat.systemPlaceholder}
                    className="w-full text-sm bg-brand-900 border border-default rounded-lg px-3 py-2 text-foreground outline-none focus:border-blue-500 resize-y"
                  />
                </div>
                <div className="rounded-lg border border-default bg-brand-900/40 px-3 py-2 space-y-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/90">{t.chat.dbPanelTitle}</span>
                    {labDbLoading ? (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
                        {t.chat.dbLoading}
                      </span>
                    ) : null}
                    {labSqlDb && !labDbError ? (
                      <span className="text-emerald-800 dark:text-emerald-200/90">
                        {format(t.chat.dbLoadedFrom, { label: labDbLabel || 'report.db' })}
                      </span>
                    ) : null}
                    {labDbError ? <span className="text-red-400 break-words max-w-full">{labDbError}</span> : null}
                  </div>
                  <p className="text-[11px] text-muted-foreground/90">{t.chat.dbSettingsHint}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="text-xs py-1.5 px-2.5"
                      onClick={reloadLabDbFromUrl}
                      disabled={labDbLoading}
                    >
                      {t.chat.dbReload}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="text-xs py-1.5 px-2.5"
                      onClick={() => labDbFileInputRef.current?.click()}
                      disabled={labDbLoading}
                    >
                      {t.chat.dbPickFile}
                    </Button>
                    {labSqlDb && labSchemaText ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="text-xs py-1.5 px-2.5"
                        onClick={copyLabSchemaForCurl}
                        disabled={labDbLoading}
                        title={t.chat.dbCopySchemaTitle}
                      >
                        {labSchemaCopied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                        <span className="ml-1.5">{labSchemaCopied ? t.api.copied : t.chat.dbCopySchema}</span>
                      </Button>
                    ) : null}
                  </div>
                </div>
                <input
                  ref={labDbFileInputRef}
                  type="file"
                  accept=".db,.sqlite,.sqlite3,application/octet-stream"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                  onChange={(e) => {
                    onLabDbFile(e.target.files);
                    e.target.value = '';
                  }}
                />
              </section>
              )}

              {settingsTab === 'apiTest' && (
              <section
                role="tabpanel"
                id={`${baseId}-panel-apiTest`}
                aria-labelledby={`${baseId}-settings-tab-apiTest`}
                className="space-y-4"
              >
                <h3 id={`${baseId}-sec-api`} className="sr-only">
                  {t.settings.sectionApiTest}
                </h3>
                <p className="text-xs text-muted-foreground">{t.api.intro}</p>
                <p className="text-xs text-muted-foreground">{t.api.corsWarning}</p>
                <div>
                  <label htmlFor={`${baseId}-set-prompt`} className="block text-xs font-medium text-muted-foreground mb-1.5">
                    {t.api.promptLabel}
                  </label>
                  <textarea
                    id={`${baseId}-set-prompt`}
                    value={apiPrompt}
                    onChange={(e) => setApiPrompt(e.target.value)}
                    rows={3}
                    className="w-full text-sm bg-brand-900 border border-default rounded-lg px-3 py-2 text-foreground outline-none focus:border-blue-500 resize-y"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={sendApi} disabled={apiBusy}>
                    {apiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {t.api.sendBtn}
                  </Button>
                  <Button type="button" variant="secondary" onClick={copyPresetCurl} disabled={!apiKey.trim()}>
                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <ClipboardCopy className="h-4 w-4" />}
                    {copied ? t.api.copied : t.api.copyCurlBtn}
                  </Button>
                </div>
                {apiErr ? (
                  <p className="text-sm text-red-400 whitespace-pre-wrap break-words" role="alert">
                    {apiErr}
                  </p>
                ) : null}
                {apiOut ? (
                  <pre className="text-xs font-mono text-foreground/90 bg-brand-900/80 border border-default rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
                    {apiOut}
                  </pre>
                ) : null}
              </section>
              )}

              {settingsTab === 'browser' && (
              <section
                role="tabpanel"
                id={`${baseId}-panel-browser`}
                aria-labelledby={`${baseId}-settings-tab-browser`}
                className="space-y-4"
              >
                <h3 id={`${baseId}-sec-hf`} className="sr-only">
                  {t.settings.sectionBrowser}
                </h3>
                <p className="text-xs text-muted-foreground">{t.browser.intro}</p>
                <a
                  href="https://huggingface.co/models?library=transformers.js"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 underline"
                >
                  {t.browser.hfModelsLink}
                </a>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor={`${baseId}-hf-task`} className="block text-xs font-medium text-muted-foreground mb-1.5">
                      {t.browser.taskLabel}
                    </label>
                    <select
                      id={`${baseId}-hf-task`}
                      value={hfTask}
                      onChange={(e) => {
                        setHfTask(e.target.value);
                        setHfReady(false);
                        setHfSmoke('');
                      }}
                      className="w-full bg-brand-900 border border-default rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500"
                    >
                      {HF_TASKS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`${baseId}-hf-model`} className="block text-xs font-medium text-muted-foreground mb-1.5">
                      {t.browser.modelIdLabel}
                    </label>
                    <input
                      id={`${baseId}-hf-model`}
                      value={hfModelId}
                      onChange={(e) => setHfModelId(e.target.value)}
                      placeholder={t.browser.modelIdPlaceholder}
                      className="w-full font-mono text-sm bg-brand-900 border border-default rounded-lg px-3 py-2 text-foreground outline-none focus:border-blue-500"
                      autoComplete="off"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={runHfLoad} disabled={hfLoading}>
                    {hfLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t.browser.loading}
                      </>
                    ) : (
                      t.browser.loadBtn
                    )}
                  </Button>
                  <Button type="button" variant="secondary" onClick={runHfSmoke} disabled={hfSmokeBusy || hfLoading || !hfModelId.trim()}>
                    {hfSmokeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {t.browser.smokeBtn}
                  </Button>
                </div>
                {hfLoading && hfProgress && (
                  <div className="rounded-lg border border-default bg-brand-800/50 p-3 space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground font-mono">
                      <span className="truncate">{hfProgress.currentFile || t.browser.progressLabel}</span>
                      <span>{hfProgressPct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-brand-700 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400/90 to-emerald-400/85 transition-all"
                        style={{ width: `${Math.min(100, hfProgressPct)}%` }}
                      />
                    </div>
                  </div>
                )}
                {hfError ? (
                  <p className="text-xs text-red-400 whitespace-pre-wrap break-words" role="alert">
                    {hfError}
                  </p>
                ) : null}
                {hfReady && !hfError ? (
                  <p className="text-xs text-emerald-400/95">{t.browser.readyHint}</p>
                ) : null}
                {hfSmoke ? (
                  <pre className="text-xs font-mono text-foreground/90 bg-brand-900/80 border border-default rounded-lg p-2 overflow-x-auto whitespace-pre-wrap max-h-32">
                    {hfSmoke}
                  </pre>
                ) : null}
              </section>
              )}

              {settingsTab === 'curl' && (
              <section
                role="tabpanel"
                id={`${baseId}-panel-curl`}
                aria-labelledby={`${baseId}-settings-tab-curl`}
                className="space-y-4 pb-4"
              >
                <h3 id={`${baseId}-sec-curl`} className="sr-only">
                  {t.settings.sectionCurl}
                </h3>
                <p className="text-xs text-muted-foreground">{t.curl.intro}</p>
                <div>
                  <label htmlFor={`${baseId}-curl-paste`} className="block text-xs font-medium text-muted-foreground mb-1.5">
                    {t.curl.pasteLabel}
                  </label>
                  <textarea
                    id={`${baseId}-curl-paste`}
                    value={curlPaste}
                    onChange={(e) => setCurlPaste(e.target.value)}
                    rows={4}
                    placeholder={t.curl.pastePlaceholder}
                    className="w-full font-mono text-xs bg-brand-900 border border-default rounded-lg px-3 py-2 text-foreground outline-none focus:border-blue-500 resize-y"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" onClick={parseCurl}>
                      <Copy className="h-4 w-4" />
                      {t.curl.parseBtn}
                    </Button>
                    <Button type="button" variant="secondary" onClick={applyGeminiCurlTemplate}>
                      {t.curl.geminiTemplateBtn}
                    </Button>
                    <Button type="button" variant="secondary" onClick={applyOpenAiCurlTemplate}>
                      {t.curl.openaiTemplateBtn}
                    </Button>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">{t.curl.geminiTemplateHint}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{t.curl.openaiTemplateHint}</p>
                  {curlParseWarn.length > 0 ? (
                    <ul className="mt-2 text-xs text-amber-900 dark:text-amber-200/90 list-disc list-inside space-y-0.5">
                      {curlParseWarn.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                {curlErr ? (
                  <p className="text-sm text-red-400" role="alert">
                    {curlErr}
                  </p>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="sm:col-span-1">
                    <label htmlFor={`${baseId}-curl-method`} className="block text-xs font-medium text-muted-foreground mb-1.5">
                      {t.curl.methodLabel}
                    </label>
                    <input
                      id={`${baseId}-curl-method`}
                      value={curlMethod}
                      onChange={(e) => setCurlMethod(e.target.value)}
                      className="w-full font-mono text-sm bg-brand-900 border border-default rounded-lg px-3 py-2 text-foreground uppercase outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label htmlFor={`${baseId}-curl-url`} className="block text-xs font-medium text-muted-foreground mb-1.5">
                      {t.curl.urlLabel}
                    </label>
                    <input
                      id={`${baseId}-curl-url`}
                      value={curlUrl}
                      onChange={(e) => setCurlUrl(e.target.value)}
                      className="w-full font-mono text-sm bg-brand-900 border border-default rounded-lg px-3 py-2 text-foreground outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor={`${baseId}-curl-headers`} className="block text-xs font-medium text-muted-foreground mb-1.5">
                    {t.curl.headersLabel}
                  </label>
                  <textarea
                    id={`${baseId}-curl-headers`}
                    value={curlHeadersText}
                    onChange={(e) => setCurlHeadersText(e.target.value)}
                    placeholder={t.curl.headersPlaceholder}
                    rows={3}
                    className="w-full font-mono text-xs bg-brand-900 border border-default rounded-lg px-3 py-2 text-foreground outline-none focus:border-blue-500 resize-y"
                  />
                </div>
                <div>
                  <label htmlFor={`${baseId}-curl-body`} className="block text-xs font-medium text-muted-foreground mb-1.5">
                    {t.curl.bodyLabel}
                  </label>
                  <textarea
                    id={`${baseId}-curl-body`}
                    value={curlBody}
                    onChange={(e) => setCurlBody(e.target.value)}
                    rows={4}
                    className="w-full font-mono text-xs bg-brand-900 border border-default rounded-lg px-3 py-2 text-foreground outline-none focus:border-blue-500 resize-y"
                  />
                </div>
                <Button type="button" onClick={sendCurl} disabled={curlBusy || !curlUrl.trim()}>
                  {curlBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t.curl.sendBtn}
                </Button>
                {curlErr ? (
                  <p className="text-sm text-red-400 whitespace-pre-wrap break-words" role="alert">
                    {curlErr}
                  </p>
                ) : null}
                {curlStatus ? (
                  <p className="text-xs font-mono text-muted-foreground">
                    {t.curl.statusPrefix} {curlStatus}
                  </p>
                ) : null}
                {curlRes ? (
                  <pre className="text-xs font-mono text-foreground/90 bg-brand-900/80 border border-default rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
                    {curlRes}
                  </pre>
                ) : null}
              </section>
              )}
            </div>
          </aside>
        </>
      ) : null}

    </PageLayout>
  );
}
