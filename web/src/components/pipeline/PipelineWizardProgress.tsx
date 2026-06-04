'use client';

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
                  clickable ? 'cursor-pointer' : 'cursor-default'
                }`}
                aria-current={active ? 'step' : undefined}
              >
                <span
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors ${
                    done
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : active
                        ? 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300'
                        : reachable
                          ? 'border-muted-foreground/30 bg-brand-800 text-muted-foreground group-hover:border-muted-foreground/50'
                          : 'border-muted/60 bg-brand-900/50 text-muted-foreground/60'
                  }`}
                >
                  {done ? <Check className="h-4 w-4" aria-hidden /> : step.id}
                </span>
                <span
                  className={`truncate text-center text-xs font-medium sm:text-left sm:text-sm ${
                    active ? 'text-foreground' : done ? 'text-muted-foreground' : 'text-muted-foreground/70'
                  }`}
                >
                  {step.label}
                </span>
              </button>
              {index < STEPS.length - 1 ? (
                <div
                  className={`mx-1 hidden h-px flex-1 sm:mx-3 sm:block ${
                    step.id < currentStep ? 'bg-blue-500/50' : 'bg-muted'
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
