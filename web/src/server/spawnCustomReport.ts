import { spawn } from 'child_process';
import { formatPythonSpawnError, resolvePythonExecutable } from '@/server/resolvePython';
import { getPipelineSpawnEnv, getRepoRoot } from '@/server/pipelineSpawnEnv';

export interface ComposeCustomReportInput {
  title: string;
  sections: Array<Record<string, unknown>>;
  propertyId: number;
  reportId?: number | null;
}

export interface ExportCustomReportInput {
  reportSpecId: string;
  format: 'html' | 'pdf';
  propertyId: number;
  reportId?: number | null;
}

function runPythonJson(script: string, argvPayload: string, propertyId: number): Promise<{
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
  error?: string;
}> {
  const repoRoot = getRepoRoot();
  const pythonExe = resolvePythonExecutable(null, repoRoot);
  return new Promise((resolve) => {
    const proc = spawn(pythonExe, ['-c', script, argvPayload], {
      cwd: repoRoot,
      env: getPipelineSpawnEnv(repoRoot, propertyId),
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
        const data = JSON.parse(stdout.trim() || '{}') as Record<string, unknown>;
        if (code !== 0 || data.error) {
          resolve({
            ok: false,
            status: 500,
            data,
            error: String(data.error || stderr.trim() || 'Custom report failed'),
          });
          return;
        }
        resolve({ ok: true, status: 200, data });
      } catch {
        resolve({
          ok: false,
          status: 500,
          data: {},
          error: stderr.trim() || stdout.trim() || 'Invalid custom report response',
        });
      }
    });
  });
}

const COMPOSE_SCRIPT = `
import json, sys
from website_profiling.tools.audit_tools.export_tools import compose_custom_report
from website_profiling.tools.audit_tools.context import AuditToolContext
from website_profiling.db.storage import db_session

payload = json.loads(sys.argv[1])
ctx = AuditToolContext(property_id=int(payload["propertyId"]), report_id=payload.get("reportId"))
with db_session() as conn:
    result = compose_custom_report(conn, ctx, {
        "title": payload["title"],
        "sections": payload["sections"],
        "property_id": payload["propertyId"],
        "report_id": payload.get("reportId"),
    })
print(json.dumps(result))
`;

const EXPORT_SCRIPT = `
import json, sys, base64
from website_profiling.tools.audit_tools.export_tools import export_custom_report
from website_profiling.tools.audit_tools.context import AuditToolContext
from website_profiling.db.storage import db_session
from website_profiling.tools.export_artifacts import read_artifact_bytes

payload = json.loads(sys.argv[1])
ctx = AuditToolContext(property_id=int(payload["propertyId"]), report_id=payload.get("reportId"))
with db_session() as conn:
    result = export_custom_report(conn, ctx, {
        "format": payload["format"],
        "report_spec_id": payload["reportSpecId"],
        "property_id": payload["propertyId"],
        "report_id": payload.get("reportId"),
    })
if result.get("error"):
    print(json.dumps(result))
    sys.exit(1)
aid = result.get("artifact_id")
if not aid:
    print(json.dumps({"error": "no artifact_id"}))
    sys.exit(1)
loaded = read_artifact_bytes(str(aid))
if not loaded:
    print(json.dumps({"error": "artifact not found"}))
    sys.exit(1)
meta, raw = loaded
print(json.dumps({
    "filename": meta.get("filename") or result.get("filename"),
    "mime_type": meta.get("mime_type") or result.get("mime_type"),
    "data_b64": base64.b64encode(raw).decode("ascii"),
}))
`;

export function composeCustomReport(input: ComposeCustomReportInput) {
  return runPythonJson(
    COMPOSE_SCRIPT,
    JSON.stringify({
      title: input.title,
      sections: input.sections,
      propertyId: input.propertyId,
      reportId: input.reportId ?? null,
    }),
    input.propertyId,
  );
}

export function exportCustomReportArtifact(input: ExportCustomReportInput) {
  return runPythonJson(
    EXPORT_SCRIPT,
    JSON.stringify({
      reportSpecId: input.reportSpecId,
      format: input.format,
      propertyId: input.propertyId,
      reportId: input.reportId ?? null,
    }),
    input.propertyId,
  );
}
