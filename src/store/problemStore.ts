import { create } from 'zustand';
import { explainAiError, type AiProviderId, type AiRole, type Problem } from '../lib/ai/errors';

interface ProblemState {
  problem: Problem | null;
  show(problem: Problem): void;
  clear(): void;
}

/** One app-wide "something went wrong" dialog; anything can raise it. */
export const useProblemStore = create<ProblemState>((set) => ({
  problem: null,
  show: (problem) => set({ problem }),
  clear: () => set({ problem: null }),
}));

export const showProblem = (problem: Problem) => useProblemStore.getState().show(problem);

/** Explain an AI failure in the dialog; returns the explanation for inline use too. */
export function reportAiError(err: unknown, provider?: AiProviderId, role?: AiRole): Problem {
  const problem = explainAiError(err, provider, role);
  showProblem(problem);
  return problem;
}
