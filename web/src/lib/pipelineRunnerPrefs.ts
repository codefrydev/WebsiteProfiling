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
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<PipelineRunnerPrefs>;
    return {
      pythonExe:
        typeof parsed.pythonExe === 'string' && parsed.pythonExe.trim()
          ? parsed.pythonExe.trim()
          : DEFAULTS.pythonExe,
      repoRoot: typeof parsed.repoRoot === 'string' ? parsed.repoRoot : DEFAULTS.repoRoot,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePipelineRunnerPrefs(prefs: PipelineRunnerPrefs): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        pythonExe: prefs.pythonExe.trim() || DEFAULTS.pythonExe,
        repoRoot: prefs.repoRoot.trim(),
      }),
    );
  } catch {
    // private browsing / quota
  }
}
