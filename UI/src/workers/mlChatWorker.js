/**
 * Runs @xenova/transformers chat pipeline off the main thread so the UI stays responsive.
 */
import { createProgressAggregator, isPipelineReady, loadPipeline } from '../lib/transformersClient.js';

function serializeGenerationResult(out) {
  const first = Array.isArray(out) ? out[0] : out;
  const gen = first?.generated_text;
  if (Array.isArray(gen)) {
    return {
      generated_text: gen.map((item) => ({
        role: item.role,
        content: String(item.content ?? ''),
      })),
    };
  }
  if (typeof gen === 'string') {
    return { generated_text: gen };
  }
  return { generated_text: gen ?? null };
}

/** Token length of the prompt (matches TextGenerationPipeline chat path). */
function getPromptTokenLength(pipeline, thread) {
  const inputs = [
    pipeline.tokenizer.apply_chat_template(thread, {
      tokenize: false,
      add_generation_prompt: true,
    }),
  ];
  pipeline.tokenizer.padding_side = 'left';
  const { input_ids } = pipeline.tokenizer(inputs, {
    add_special_tokens: false,
    padding: true,
    truncation: true,
  });
  return input_ids.dims[input_ids.dims.length - 1];
}

self.onmessage = async (event) => {
  const data = event.data;
  const { id, modelId, thread, genOptions } = data;
  try {
    const wasCached = isPipelineReady('text-generation', modelId);
    const progressCallback = wasCached
      ? undefined
      : createProgressAggregator((u) => {
          self.postMessage({ id, type: 'progress', payload: u });
        });
    const pipeline = await loadPipeline('text-generation', modelId, { progressCallback });
    if (wasCached) {
      self.postMessage({ id, type: 'modelCached' });
    }
    const promptLen = getPromptTokenLength(pipeline, thread);

    const { stream = true, ...rest } = genOptions || {};
    const opts = { ...rest };

    if (stream) {
      let lastPosted = '';
      opts.callback_function = (beams) => {
        if (!beams?.length) return;
        const beam = [...beams].sort((a, b) => b.score - a.score)[0];
        const ids = beam?.output_token_ids;
        if (!ids || ids.length <= promptLen) return;
        const newIds = ids.slice(promptLen);
        const text = pipeline.tokenizer.decode(newIds, { skip_special_tokens: true });
        if (text === lastPosted) return;
        lastPosted = text;
        self.postMessage({ id, type: 'stream', text });
      };
    }

    const out = await pipeline(thread, opts);
    self.postMessage({ id, type: 'done', result: serializeGenerationResult(out) });
  } catch (e) {
    self.postMessage({
      id,
      type: 'error',
      error: { name: e?.name, message: e?.message, stack: e?.stack },
    });
  }
};
