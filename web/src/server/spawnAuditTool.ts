import { spawn } from 'child_process';
import { formatPythonSpawnError, resolvePythonExecutable } from '@/server/resolvePython';
import { getPipelineSpawnEnv, getRepoRoot } from '@/server/pipelineSpawnEnv';
import { isAllowedAuditTool } from '@/server/auditToolAllowlist';

export interface SpawnAuditToolInput {
  toolName: string;
  propertyId: number;
  reportId?: number | null;
  args?: Record<string, unknown>;
}

export interface SpawnAuditToolResult {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
  error?: string;
}

function buildAuditToolScript(): string {
  return `
import json, sys
from website_profiling.tools.audit_tools.registry import dispatch_tool
from website_profiling.tools.audit_tools.context import AuditToolContext
from website_profiling.db.storage import db_session

payload = json.loads(sys.argv[1])
tool_name = payload["toolName"]
tool_args = dict(payload.get("args") or {})
property_id = int(payload["propertyId"])
report_id = payload.get("reportId")
if report_id is not None:
    report_id = int(report_id)
    tool_args.setdefault("report_id", report_id)
tool_args.setdefault("property_id", property_id)
ctx = AuditToolContext(property_id=property_id, report_id=report_id)
with db_session() as conn:
    result = dispatch_tool(tool_name, tool_args, context=ctx, conn=conn)
print(json.dumps(result if isinstance(result, dict) else {"result": result}))
`;
}

export function spawnAuditTool(input: SpawnAuditToolInput): Promise<SpawnAuditToolResult> {
  const toolName = String(input.toolName || '').trim();
  if (!isAllowedAuditTool(toolName)) {
    return Promise.resolve({
      ok: false,
      status: 400,
      data: {},
      error: `Tool not allowed: ${toolName}`,
    });
  }
  if (!input.propertyId) {
    return Promise.resolve({
      ok: false,
      status: 400,
      data: {},
      error: 'propertyId required',
    });
  }

  const repoRoot = getRepoRoot();
  const pythonExe = resolvePythonExecutable(null, repoRoot);
  const script = buildAuditToolScript();
  const argvPayload = JSON.stringify({
    toolName,
    propertyId: input.propertyId,
    reportId: input.reportId ?? null,
    args: input.args ?? {},
  });

  return new Promise((resolve) => {
    const proc = spawn(pythonExe, ['-c', script, argvPayload], {
      cwd: repoRoot,
      env: getPipelineSpawnEnv(repoRoot, input.propertyId),
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (c: Buffer | string) => {
      stdout += c.toString();
    });
    proc.stderr?.on('data', (c: Buffer | string) => {
      stderr += c.toString();
    });
    proc.on('error', (err: Error) => {
      resolve({
        ok: false,
        status: 500,
        data: {},
        error: formatPythonSpawnError(err, pythonExe, repoRoot),
      });
    });
    proc.on('close', (code) => {
      try {
        const trimmed = stdout.trim();
        const data = trimmed ? (JSON.parse(trimmed) as Record<string, unknown>) : {};
        if (code !== 0) {
          resolve({
            ok: false,
            status: 500,
            data,
            error: stderr.trim() || 'Audit tool failed',
          });
          return;
        }
        resolve({ ok: true, status: 200, data });
      } catch {
        resolve({
          ok: false,
          status: 500,
          data: {},
          error: stderr.trim() || stdout.trim() || 'Invalid audit tool response',
        });
      }
    });
  });
}
