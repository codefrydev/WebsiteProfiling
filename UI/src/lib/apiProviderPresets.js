/**
 * Helpers for LLM API presets (Gemini, OpenAI-compatible) and curl export.
 */

const DEFAULT_OPENAI_BASE = 'https://api.openai.com/v1';

export function normalizeOpenAiBaseUrl(base) {
  const b = String(base || '').trim() || DEFAULT_OPENAI_BASE;
  return b.replace(/\/$/, '');
}

/**
 * @param {{ baseUrl: string, apiKey: string, model: string, prompt: string }} p
 */
export function buildOpenAiChatRequestBody(p) {
  return {
    model: p.model.trim(),
    messages: [{ role: 'user', content: p.prompt }],
    max_tokens: 512,
  };
}

/**
 * Example Chat Completions body: multi-turn history, JSON mode, temperature.
 * @param {{ model: string }} p
 */
export function openAiChatCompletionsExampleBody(p) {
  const model = String(p.model || '').trim() || 'gpt-4o-mini';
  return {
    model,
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello, what was our last topic?' },
      { role: 'assistant', content: 'We were discussing curl commands.' },
      { role: 'user', content: 'Great, continue.' },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  };
}

/**
 * @param {{ baseUrl: string, apiKey: string, model: string, prompt: string }} p
 */
export function openAiChatCompletionsUrl(baseUrl) {
  return `${normalizeOpenAiBaseUrl(baseUrl)}/chat/completions`;
}

/**
 * Shell-escape for use inside single-quoted bash segments.
 * @param {string} s
 */
export function shellEscapeSingleQuoted(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/**
 * @param {{ baseUrl: string, apiKey: string, model: string, prompt: string }} p
 */
export function buildOpenAiCurlCommand(p) {
  const url = openAiChatCompletionsUrl(p.baseUrl);
  const body = buildOpenAiChatRequestBody(p);
  const json = JSON.stringify(body);
  return [
    'curl',
    '-sS',
    '-X',
    'POST',
    url,
    '-H',
    shellEscapeSingleQuoted('Content-Type: application/json'),
    '-H',
    shellEscapeSingleQuoted(`Authorization: Bearer ${p.apiKey}`),
    '-d',
    shellEscapeSingleQuoted(json),
  ].join(' ');
}

/**
 * Google Generative Language API: `generateContent` endpoint (no query key; use `X-goog-api-key` header).
 * @param {string} model - e.g. `gemini-flash-latest` (v1beta path segment)
 */
export function geminiGenerateContentUrl(model) {
  const modelPath = String(model || 'gemini-flash-latest')
    .replace(/^models\//, '')
    .trim() || 'gemini-flash-latest';
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelPath)}:generateContent`;
}

/**
 * @param {{ apiKey: string, model: string, prompt: string }} p
 */
/**
 * Example `generateContent` body: multi-turn `contents` with roles + JSON via GenerationConfig.
 */
export function geminiGenerateContentExampleBody() {
  return {
    contents: [
      {
        role: 'user',
        parts: [{ text: 'Remember that my order number is 12345.' }],
      },
      {
        role: 'model',
        parts: [{ text: 'I have noted that. Your order number is 12345.' }],
      },
      {
        role: 'user',
        parts: [{ text: 'What is my order number? Respond in JSON.' }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
    },
  };
}

export function buildGeminiCurlCommand(p) {
  const url = geminiGenerateContentUrl(p.model);
  const body = JSON.stringify({
    contents: [{ parts: [{ text: p.prompt }] }],
  });
  return [
    'curl',
    '-sS',
    '-X',
    'POST',
    url,
    '-H',
    shellEscapeSingleQuoted('Content-Type: application/json'),
    '-H',
    shellEscapeSingleQuoted(`X-goog-api-key: ${p.apiKey}`),
    '-d',
    shellEscapeSingleQuoted(body),
  ].join(' ');
}
