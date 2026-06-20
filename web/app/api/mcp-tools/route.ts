import { type NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { forbiddenIfNotLocal } from '@/server/localOnly';

const execFileAsync = promisify(execFile);

const PYTHON_SCRIPT = `
import json, sys
try:
    from website_profiling.tools.audit_tools.registry import (
        TOOL_DEFINITIONS, get_tool_meta, mcp_tool_names
    )
    from website_profiling.tools.audit_tools.tool_domains import (
        MCP_DOMAIN_BUNDLES, CANONICAL_DOMAINS, classify_tool_domain
    )
    bundle_sets = {b: mcp_tool_names(b) for b in MCP_DOMAIN_BUNDLES.keys()}
    tools = []
    for spec in TOOL_DEFINITIONS:
        name = spec.get("name", "")
        if not name:
            continue
        meta = (get_tool_meta(name) or {})
        domain = meta.get("domain") or classify_tool_domain(name)
        in_bundles = [b for b, names in bundle_sets.items() if name in names]
        tools.append({
            "name": name,
            "description": spec.get("description", ""),
            "domain": domain,
            "bundles": in_bundles,
        })
    print(json.dumps({
        "tools": tools,
        "bundles": {k: sorted(v) for k, v in bundle_sets.items()},
        "domains": list(CANONICAL_DOMAINS),
    }))
except Exception as e:
    print(json.dumps({"error": str(e), "tools": [], "bundles": {}, "domains": []}))
`;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = forbiddenIfNotLocal(request);
  if (guard) return guard;

  try {
    const pythonBin = process.env.PYTHON_BIN || 'python3';
    const { stdout } = await execFileAsync(
      pythonBin,
      ['-c', PYTHON_SCRIPT],
      {
        timeout: 15_000,
        env: {
          ...process.env,
          PYTHONPATH: process.env.PYTHONPATH || 'src',
        },
      },
    );
    const data = JSON.parse(stdout.trim()) as {
      tools: { name: string; description: string; domain: string; bundles: string[] }[];
      bundles: Record<string, string[]>;
      domains: string[];
      error?: string;
    };
    if (data.error) {
      return NextResponse.json({ error: data.error, tools: [], bundles: {}, domains: [] }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Failed to load tool catalog: ${message}`, tools: [], bundles: {}, domains: [] },
      { status: 500 },
    );
  }
}
