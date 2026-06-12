#!/usr/bin/env node
/**
 * Lighthouse User Flow runner (snapshot / timespan).
 * Usage: node lighthouse_user_flow.mjs --url=URL --mode=snapshot|timespan --strategy=mobile|desktop --output=PATH [--wait-ms=1500] [--categories=perf,seo]
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { startFlow, desktopConfig } from 'lighthouse';

function parseArgs(argv) {
  const out = {
    url: '',
    mode: 'snapshot',
    strategy: 'mobile',
    output: '',
    waitMs: 1500,
    categories: null,
  };
  for (const arg of argv) {
    if (arg.startsWith('--url=')) out.url = arg.slice(6);
    else if (arg.startsWith('--mode=')) out.mode = arg.slice(7).toLowerCase();
    else if (arg.startsWith('--strategy=')) out.strategy = arg.slice(11).toLowerCase();
    else if (arg.startsWith('--output=')) out.output = arg.slice(9);
    else if (arg.startsWith('--wait-ms=')) out.waitMs = Math.max(0, parseInt(arg.slice(10), 10) || 1500);
    else if (arg.startsWith('--categories=')) {
      const raw = arg.slice(13).trim();
      out.categories = raw ? raw.split(',').map((c) => c.trim()).filter(Boolean) : null;
    }
  }
  return out;
}

function chromeArgs() {
  const raw = (process.env.LIGHTHOUSE_CHROME_FLAGS || '').trim();
  if (!raw) return ['--headless=new', '--no-sandbox', '--disable-gpu'];
  return raw.split(/\s+/).filter(Boolean);
}

function flowConfig(strategy, categories) {
  const base = strategy === 'desktop' ? desktopConfig : undefined;
  if (!categories?.length) return base;
  const settings = { ...(base?.settings || {}), onlyCategories: categories };
  return base ? { ...base, settings } : { extends: 'lighthouse:default', settings };
}

function extractLhr(stepResult) {
  if (!stepResult) return null;
  if (stepResult.lhr) return stepResult.lhr;
  if (stepResult.lighthouseResult) return stepResult.lighthouseResult;
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url || !args.output) {
    console.error('Usage: --url=URL --output=PATH [--mode=snapshot|timespan] [--strategy=mobile|desktop]');
    process.exit(2);
  }
  if (!['snapshot', 'timespan'].includes(args.mode)) {
    console.error(`Invalid mode: ${args.mode}`);
    process.exit(2);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: chromeArgs(),
  });
  try {
    const page = await browser.newPage();
    const config = flowConfig(args.strategy, args.categories);
    const flow = await startFlow(page, {
      name: 'WebsiteProfiling audit',
      config,
    });

    await flow.navigate(args.url, { stepName: 'navigate' });

    let lhr = null;
    if (args.mode === 'snapshot') {
      const step = await flow.snapshot({ stepName: 'page' });
      lhr = extractLhr(step);
    } else {
      await flow.startTimespan({ stepName: 'timespan' });
      await new Promise((resolve) => setTimeout(resolve, args.waitMs));
      const step = await flow.endTimespan();
      lhr = extractLhr(step);
    }

    if (!lhr) {
      const flowResult = await flow.createFlowResult();
      const steps = flowResult?.steps || [];
      for (let i = steps.length - 1; i >= 0; i -= 1) {
        lhr = extractLhr(steps[i]);
        if (lhr) break;
      }
    }

    if (!lhr) {
      console.error('Lighthouse flow did not produce an LHR');
      process.exit(1);
    }

    fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
    fs.writeFileSync(args.output, JSON.stringify({ lighthouseResult: lhr }), 'utf-8');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
