
import { Check } from 'lucide-react';
import { strings } from '@/lib/strings';

const s = strings.pipelineRunner;

export type WizardStep = 1 | 2 | 3;

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 1, label: s.wizardStepUrl },
  { id: 2, label: s.wizardStepWorkflow },
  { id: 3, label: s.wizardStepReview },
];

export interface PipelineWizardProgressProps {
  currentStep: WizardStep;
  maxReachableStep: WizardStep;
  onStepClick?: (step: WizardStep) => void;
}

export default function PipelineWizardProgress({
  currentStep,
  maxReachableStep,
  onStepClick,
}: PipelineWizardProgressProps) {
  return (
    <nav aria-label={s.setupStepsAria} className="mb-8">
      <ol className="flex items-center gap-2 sm:gap-0">
        {STEPS.map((step, index) => {
          const done = step.id < currentStep;
          const active = step.id === currentStep;
          const reachable = step.id <= maxReachableStep;
          const clickable = reachable && !active && onStepClick;

          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-center">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onStepClick?.(step.id)}
                className={`group flex min-w-0 flex-1 flex-col items-center gap-2 sm:flex-row sm:gap-3 ${
                  clickable ? 'press cursor-pointer' : 'cursor-default'
                }`}
                aria-current={active ? 'step' : undefined}
              >
                <span
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors ${
                    done
                      ? 'border-md-sys-primary bg-md-sys-primary text-md-sys-on-primary'
                      : active
                        ? 'border-md-sys-primary bg-md-sys-primary-container text-md-sys-on-primary-container ring-2 ring-md-sys-primary/20'
                        : reachable
                          ? 'border-md-sys-outline-variant/40 bg-md-sys-surface-container text-md-sys-on-surface-variant group-hover:border-md-sys-outline-variant/60'
                          : 'border-md-sys-outline-variant/50 bg-md-sys-surface-container-low/50 text-md-sys-on-surface-variant/60'
                  }`}
                >
                  {done ? <Check className="h-4 w-4" aria-hidden /> : step.id}
                </span>
                <span
                  className={`truncate text-center text-xs font-medium sm:text-left sm:text-sm ${
                    active ? 'text-md-sys-on-surface' : done ? 'text-md-sys-on-surface-variant' : 'text-md-sys-on-surface-variant/70'
                  }`}
                >
                  {step.label}
                </span>
              </button>
              {index < STEPS.length - 1 ? (
                <div
                  className={`mx-1 hidden h-px flex-1 sm:mx-3 sm:block ${
                    step.id < currentStep ? 'bg-md-sys-primary/50' : 'bg-md-sys-surface-container-highest/60'
                  }`}
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
