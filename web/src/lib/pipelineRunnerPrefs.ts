import { getCachedClientPreferences, patchClientPreferences } from '@/lib/clientPreferences';

const STORAGE_KEY = 'wp-pipeline-runner:v1';

export interface PipelineRunnerPrefs {
  pythonExe: string;
  repoRoot: string;
}

const DEFAULTS: PipelineRunnerPrefs = {
  pythonExe: 'python3',
  repoRoot: '',
};

export function loadPipelineRunnerPrefs(): PipelineRunnerPrefs {
  const cp = getCachedClientPreferences();
  return {
    pythonExe: cp.pipelinePythonExe.trim() || DEFAULTS.pythonExe,
    repoRoot: cp.pipelineRepoRoot,
  };
}

export function savePipelineRunnerPrefs(prefs: PipelineRunnerPrefs): void {
  const normalized = {
    pythonExe: prefs.pythonExe.trim() || DEFAULTS.pythonExe,
    repoRoot: prefs.repoRoot.trim(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // private browsing / quota
  }
  patchClientPreferences({
    pipelinePythonExe: normalized.pythonExe,
    pipelineRepoRoot: normalized.repoRoot,
  });
}
