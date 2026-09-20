import { useEffect, useState } from 'react';
import { AlertTriangle, Ban, CloudOff, Copy, Gauge, KeyRound, ServerCrash, Settings, Wallet, Check, ExternalLink } from 'lucide-react';
import { Button } from '../ui/Button';
import { useProblemStore } from '../../store/problemStore';
import { AiSettingsDialog } from '../library/AiSettingsDialog';
import type { Problem, ProblemKind } from '../../lib/ai/errors';

const ICONS: Record<ProblemKind, typeof AlertTriangle> = {
  key: KeyRound, quota: Gauge, credit: Wallet, model: Ban, network: CloudOff, busy: ServerCrash, content: Ban, request: AlertTriangle, other: AlertTriangle,
};

function ProblemDialog({ problem, onClose, onSettings }: { problem: Problem; onClose: () => void; onSettings: () => void }) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const Icon = ICONS[problem.kind];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${problem.title}\n${problem.message}\n\n${problem.details ?? ''}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#101623]/45" onMouseDown={onClose}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="problem-title"
        className="w-[440px] max-w-[calc(100vw-32px)] rounded-2xl border border-line bg-panel p-5 shadow-[0_20px_60px_rgba(15,25,45,0.3)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <Icon size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="problem-title" className="text-[15px] font-semibold leading-snug text-t1">{problem.title}</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-t2">{problem.message}</p>
          </div>
        </div>

        {problem.steps.length > 0 && (
          <div className="mt-4 rounded-xl bg-panel2 px-4 py-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-t3">What you can do</div>
            <ol className="mt-1.5 flex flex-col gap-1 text-[12.5px] leading-relaxed text-t1">
              {problem.steps.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="w-4 shrink-0 text-right tabular text-t3">{i + 1}.</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {problem.details && (
          <div className="mt-3">
            <button type="button" className="text-[11.5px] text-t3 underline-offset-2 hover:text-t1 hover:underline" onClick={() => setShowDetails((v) => !v)}>
              {showDetails ? 'Hide the provider\'s message' : 'Show the provider\'s message'}
            </button>
            {showDetails && (
              <div className="relative mt-1.5">
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-panel2 p-2.5 pr-9 font-mono text-[10.5px] leading-relaxed text-t2">{problem.details}</pre>
                <button type="button" className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-md text-t3 hover:bg-hov hover:text-t1" title="Copy" onClick={() => void copy()}>
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex items-center gap-2">
          {problem.link && (
            <a href={problem.link.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline">
              {problem.link.label} <ExternalLink size={12} />
            </a>
          )}
          <div className="flex-1" />
          {problem.settings && (
            <Button variant="secondary" onClick={onSettings}><Settings size={13} /> AI settings</Button>
          )}
          <Button variant="primary" onClick={onClose} autoFocus>OK</Button>
        </div>
      </div>
    </div>
  );
}

/** Mount once; shows whatever `showProblem` / `reportAiError` raised. */
export function ProblemHost() {
  const problem = useProblemStore((s) => s.problem);
  const clear = useProblemStore((s) => s.clear);
  const [settings, setSettings] = useState(false);
  return (
    <>
      {problem && <ProblemDialog problem={problem} onClose={clear} onSettings={() => { clear(); setSettings(true); }} />}
      {settings && <AiSettingsDialog onClose={() => setSettings(false)} />}
    </>
  );
}
