/**
 * Model Lab: OpenAI- and Gemini-compatible tool loops over executeChatTool (sql.js).
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  buildGeminiToolConfig,
  buildGeminiToolsArray,
  buildGeminiToolsJsonForRest,
  executeChatTool,
  LAB_MAX_TOOL_ITERATIONS,
  truncateToolResultForApi,
  getOpenAiToolsPayload,
} from './chatTools.js';
import { geminiGenerateContentUrl, openAiChatCompletionsUrl } from './apiProviderPresets.js';

/**
 * @param {string} headersText
 * @returns {string}
 */
export function extractXGoogApiKeyFromHeaders(headersText) {
  const lines = String(headersText || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim().toLowerCase();
    if (k === 'x-goog-api-key') return line.slice(idx + 1).trim();
  }
  return '';
}

/**
 * @param {string} headersText
 * @returns {string}
 */
export function extractBearerTokenFromHeaders(headersText) {
  const lines = String(headersText || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim().toLowerCase();
    const v = line.slice(idx + 1).trim();
    if (k === 'authorization' && /^Bearer\s+/i.test(v)) return v.replace(/^Bearer\s+/i, '').trim();
  }
  return '';
}

/**
 * Thought signatures (Gemini 3 / 2.5 thinking models): echo back on functionCall parts.
 * @param {Record<string, unknown>} part
 * @returns {string | undefined}
 */
function geminiPartThoughtSignature(part) {
  if (!part || typeof part !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(part, 'thoughtSignature')) {
    const v = part.thoughtSignature;
    return v == null ? undefined : String(v);
  }
  if (Object.prototype.hasOwnProperty.call(part, 'thought_signature')) {
    const v = part.thought_signature;
    return v == null ? undefined : String(v);
  }
  return undefined;
}

/**
 * @param {unknown} parts
 * @returns {{ text: string, toolCallInfos: Array<{ name: string, args: Record<string, unknown>, thoughtSignature?: string }> }}
 */
function parseGeminiContentParts(parts) {
  if (!Array.isArray(parts)) return { text: '', toolCallInfos: [] };
  let text = '';
  /** @type {Array<{ name: string, args: Record<string, unknown>, thoughtSignature?: string }>} */
  const toolCallInfos = [];
  for (const p of parts) {
    if (p?.text) text += String(p.text);
    if (p?.functionCall) {
      const name = String(p.functionCall.name ?? '');
      let args = p.functionCall.args;
      if (args == null) args = {};
      else if (typeof args === 'string') {
        try {
          args = JSON.parse(args);
        } catch {
          args = {};
        }
      }
      if (typeof args !== 'object' || args === null || Array.isArray(args)) args = {};
      const thoughtSignature = geminiPartThoughtSignature(p);
      /** @type {{ name: string, args: Record<string, unknown>, thoughtSignature?: string }} */
      const info = { name, args: /** @type {Record<string, unknown>} */ (args) };
      if (thoughtSignature !== undefined) info.thoughtSignature = thoughtSignature;
      toolCallInfos.push(info);
    }
  }
  return { text, toolCallInfos };
}

/**
 * @param {Array<Record<string, unknown>>} messagesOpenAI
 * @returns {{ contents: import('@google/generative-ai').Content[], systemInstruction: string | undefined }}
 */
export function openAiMessagesToGeminiContents(messages) {
  /** @type {string[]} */
  const systemParts = [];
  /** @type {import('@google/generative-ai').Content[]} */
  const contents = [];

  for (const m of messages) {
    const role = m.role;
    if (role === 'system') {
      systemParts.push(String(m.content ?? ''));
      continue;
    }
    if (role === 'user') {
      const part = m.content;
      if (typeof part === 'string') {
        contents.push({ role: 'user', parts: [{ text: part }] });
      } else if (Array.isArray(part)) {
        /** @type {import('@google/generative-ai').Part[]} */
        const parts = [];
        for (const block of part) {
          if (block?.type === 'text') {
            parts.push({ text: String(block.text ?? '') });
          } else if (block?.type === 'image_url' && block.image_url?.url) {
            const url = String(block.image_url.url);
            const mm = url.match(/^data:([^;]+);base64,(.+)$/);
            if (mm) {
              parts.push({ inlineData: { mimeType: mm[1], data: mm[2] } });
            }
          }
        }
        if (parts.length === 0) parts.push({ text: '' });
        contents.push({ role: 'user', parts });
      } else {
        contents.push({ role: 'user', parts: [{ text: String(part ?? '') }] });
      }
      continue;
    }
    if (role === 'assistant') {
      const toolCalls = m.tool_calls;
      if (Array.isArray(toolCalls) && toolCalls.length) {
        /** @type {import('@google/generative-ai').Part[]} */
        const parts = [];
        for (const tc of toolCalls) {
          const fn = tc.function;
          const name = String(fn?.name ?? '');
          let args = {};
          try {
            args =
              typeof fn?.arguments === 'string'
                ? JSON.parse(fn.arguments || '{}')
                : fn?.arguments && typeof fn.arguments === 'object'
                  ? fn.arguments
                  : {};
          } catch {
            args = {};
          }
          /** @type {Record<string, unknown>} */
          const part = { functionCall: { name, args } };
          if (Object.prototype.hasOwnProperty.call(tc, 'geminiThoughtSignature')) {
            const sig = tc.geminiThoughtSignature;
            part.thoughtSignature = sig;
            part.thought_signature = sig;
          }
          parts.push(part);
        }
        contents.push({ role: 'model', parts });
      } else {
        contents.push({ role: 'model', parts: [{ text: String(m.content ?? '') }] });
      }
      continue;
    }
    if (role === 'tool') {
      const name = String(m.name ?? '');
      const content = String(m.content ?? '');
      let responseObj;
      try {
        responseObj = JSON.parse(content);
      } catch {
        responseObj = { result: content };
      }
      contents.push({
        role: 'function',
        parts: [{ functionResponse: { name, response: responseObj } }],
      });
    }
  }

  const systemInstruction = systemParts.length ? systemParts.filter(Boolean).join('\n') : undefined;
  return { contents, systemInstruction };
}

/**
 * @param {unknown} json
 * @returns {{ text: string, toolCallInfos: Array<{ name: string, args: Record<string, unknown>, thoughtSignature?: string }> }}
 */
function parseGeminiRestGenerateContent(json) {
  const parts = json?.candidates?.[0]?.content?.parts;
  return parseGeminiContentParts(parts);
}

/**
 * Gemini `generateContent` via REST (fetch + tools), for Curl transport in Model Lab.
 * @param {{ apiKey: string, model: string, messages: Array<Record<string, unknown>>, sqlDb: import('sql.js').Database | null, data?: object | null }} p
 * @returns {Promise<{ replyText: string, thread: Array<Record<string, unknown>> }>}
 */
export async function runGeminiChatWithToolsViaRest(p) {
  const { apiKey, model, sqlDb, data = null } = p;
  const toolCtx = { sqlDb, data };
  /** @type {Array<Record<string, unknown>>} */
  let stepMessages = [...p.messages];

  const endpoint = geminiGenerateContentUrl(model.trim());

  for (let iter = 0; iter < LAB_MAX_TOOL_ITERATIONS; iter++) {
    const { contents, systemInstruction } = openAiMessagesToGeminiContents(stepMessages);
    /** @type {Record<string, unknown>} */
    const body = {
      contents,
      tools: buildGeminiToolsJsonForRest(),
      toolConfig: {
        functionCallingConfig: {
          mode: 'AUTO',
        },
      },
    };
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = json?.error?.message || json?.message || res.statusText || String(res.status);
      throw new Error(errMsg);
    }

    const { text, toolCallInfos } = parseGeminiRestGenerateContent(json);
    if (toolCallInfos.length) {
      /** @type {Array<Record<string, unknown>>} */
      const tool_calls = [];
      for (let i = 0; i < toolCallInfos.length; i++) {
        const fc = toolCallInfos[i];
        const id = `gemini_rest_${iter}_${i}_${fc.name}`;
        /** @type {Record<string, unknown>} */
        const tc = {
          id,
          type: 'function',
          function: {
            name: fc.name,
            arguments: JSON.stringify(fc.args && typeof fc.args === 'object' ? fc.args : {}),
          },
        };
        if (fc.thoughtSignature !== undefined) tc.geminiThoughtSignature = fc.thoughtSignature;
        tool_calls.push(tc);
      }
      stepMessages.push({
        role: 'assistant',
        content: null,
        tool_calls,
      });
      for (let i = 0; i < toolCallInfos.length; i++) {
        const fc = toolCallInfos[i];
        const id = `gemini_rest_${iter}_${i}_${fc.name}`;
        const args = fc.args && typeof fc.args === 'object' ? fc.args : {};
        const raw = executeChatTool(fc.name, args, toolCtx);
        const content = truncateToolResultForApi(raw);
        stepMessages.push({
          role: 'tool',
          tool_call_id: id,
          name: fc.name,
          content,
        });
      }
      continue;
    }
    return { replyText: text, thread: stepMessages };
  }

  throw new Error('Tool loop limit exceeded');
}

/**
 * @param {{ apiKey: string, baseUrl: string, model: string, messages: Array<Record<string, unknown>>, sqlDb: import('sql.js').Database | null, data?: object | null }} p
 * @returns {Promise<{ replyText: string, thread: Array<Record<string, unknown>> }>}
 */
export async function runOpenAiChatWithTools(p) {
  const { apiKey, baseUrl, model, sqlDb, data = null } = p;
  const toolCtx = { sqlDb, data };
  const url = openAiChatCompletionsUrl(baseUrl);
  /** @type {Array<Record<string, unknown>>} */
  let stepMessages = [...p.messages];

  for (let iter = 0; iter < LAB_MAX_TOOL_ITERATIONS; iter++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model.trim(),
        messages: stepMessages,
        tools: getOpenAiToolsPayload(),
        tool_choice: 'auto',
        max_tokens: 2048,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = json?.error?.message || json?.message || res.statusText || String(res.status);
      throw new Error(errMsg);
    }
    const msg = json?.choices?.[0]?.message;
    if (!msg) throw new Error('No assistant message in API response');

    stepMessages.push(msg);

    const toolCalls = msg.tool_calls;
    if (Array.isArray(toolCalls) && toolCalls.length) {
      for (const tc of toolCalls) {
        const fn = tc.function;
        const name = String(fn?.name ?? '');
        let args = {};
        try {
          args = typeof fn?.arguments === 'string' ? JSON.parse(fn.arguments || '{}') : {};
        } catch {
          args = {};
        }
        const result = executeChatTool(name, args, toolCtx);
        const content = truncateToolResultForApi(result);
        stepMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name,
          content,
        });
      }
      continue;
    }

    const replyText = msg.content != null ? String(msg.content) : '';
    return { replyText, thread: stepMessages };
  }

  throw new Error('Tool loop limit exceeded');
}

/**
 * @param {{ apiKey: string, model: string, messages: Array<Record<string, unknown>>, sqlDb: import('sql.js').Database | null, data?: object | null }} p
 * @returns {Promise<{ replyText: string, thread: Array<Record<string, unknown>> }>}
 */
export async function runGeminiChatWithTools(p) {
  const { apiKey, model, sqlDb, data = null } = p;
  const toolCtx = { sqlDb, data };
  const genAI = new GoogleGenerativeAI(apiKey);
  /** @type {Array<Record<string, unknown>>} */
  let stepMessages = [...p.messages];

  for (let iter = 0; iter < LAB_MAX_TOOL_ITERATIONS; iter++) {
    const { contents, systemInstruction } = openAiMessagesToGeminiContents(stepMessages);
    const gm = genAI.getGenerativeModel({
      model: model.trim(),
      ...(systemInstruction ? { systemInstruction } : {}),
      tools: buildGeminiToolsArray(),
      toolConfig: buildGeminiToolConfig(),
    });

    const result = await gm.generateContent({ contents });
    const response = result.response;
    const parts = response?.candidates?.[0]?.content?.parts;
    const { text, toolCallInfos } = parseGeminiContentParts(parts);

    if (toolCallInfos.length) {
      /** @type {Array<Record<string, unknown>>} */
      const tool_calls = [];
      for (let i = 0; i < toolCallInfos.length; i++) {
        const fc = toolCallInfos[i];
        const id = `gemini_${iter}_${i}_${fc.name}`;
        /** @type {Record<string, unknown>} */
        const tc = {
          id,
          type: 'function',
          function: {
            name: fc.name,
            arguments: JSON.stringify(fc.args && typeof fc.args === 'object' ? fc.args : {}),
          },
        };
        if (fc.thoughtSignature !== undefined) tc.geminiThoughtSignature = fc.thoughtSignature;
        tool_calls.push(tc);
      }

      stepMessages.push({
        role: 'assistant',
        content: null,
        tool_calls,
      });

      for (let i = 0; i < toolCallInfos.length; i++) {
        const fc = toolCallInfos[i];
        const id = `gemini_${iter}_${i}_${fc.name}`;
        const args = fc.args && typeof fc.args === 'object' ? fc.args : {};
        const raw = executeChatTool(fc.name, args, toolCtx);
        const content = truncateToolResultForApi(raw);
        stepMessages.push({
          role: 'tool',
          tool_call_id: id,
          name: fc.name,
          content,
        });
      }
      continue;
    }

    const replyText = text !== '' ? text : (response.text?.() ?? '');
    return { replyText, thread: stepMessages };
  }

  throw new Error('Tool loop limit exceeded');
}
