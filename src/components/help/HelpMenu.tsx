import { useEffect, useRef, useState } from 'react';
import { CircleHelp, Github, Keyboard, Mail, MessageSquareWarning, Play, ExternalLink, BookOpen } from 'lucide-react';
import { Button } from '../ui/Button';
import { ABOUT } from '../../lib/about';
import { TOURS } from '../../lib/tours';
import { useTourStore } from '../../store/tourStore';
import { emitShortcut } from '../../hooks/useKeyboardShortcuts';

/** Top-right "Help": pick a feature for a guided tour, shortcuts, contact. */
export function HelpMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const start = useTourStore((s) => s.start);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  const go = (id: string) => { setOpen(false); start(id); };

  return (
    <div ref={ref} className="relative">
      <Button variant="secondary" onClick={() => setOpen((v) => !v)} data-tour="help" aria-expanded={open} aria-haspopup="menu" title="Guided tours, shortcuts and contact">
        <CircleHelp size={15} /> Help
      </Button>
      {open && (
        <div role="menu" className="absolute top-[calc(100%+6px)] right-0 z-[60] w-[400px] rounded-2xl border border-line bg-panel p-2 shadow-[0_12px_40px_rgba(25,35,55,0.22)]">
          <div className="px-2 pt-1.5 pb-1 text-[10.5px] font-semibold tracking-[0.1em] text-t3 uppercase">Show me how — pick a feature</div>
          <div className="grid grid-cols-2 gap-1">
            {TOURS.map((t) => (
              <button key={t.id} type="button" role="menuitem" className="group flex items-start gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-hov" onClick={() => go(t.id)}>
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-weak text-accent">
                  {t.id === 'shortcuts' ? <Keyboard size={13} /> : <Play size={12} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-medium text-t1">{t.title}</span>
                  <span className="block truncate text-[11px] text-t3">{t.steps.length} tips · {t.blurb}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="my-1.5 h-px bg-line" />
          <button type="button" role="menuitem" className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[12.5px] text-t1 hover:bg-hov" onClick={() => { setOpen(false); emitShortcut('shortcuts-help'); }}>
            <Keyboard size={14} className="text-t2" /> All keyboard shortcuts <kbd className="ml-auto rounded-md border border-line bg-panel2 px-1.5 text-[10.5px] text-t2">?</kbd>
          </button>
          <a role="menuitem" href={`${ABOUT.repo}#readme`} target="_blank" rel="noreferrer" className="flex h-8 items-center gap-2 rounded-lg px-2 text-[12.5px] text-t1 hover:bg-hov">
            <BookOpen size={14} className="text-t2" /> Documentation <ExternalLink size={11} className="ml-auto text-t3" />
          </a>
          <div className="my-1.5 h-px bg-line" />
          <div className="px-2 pt-1 pb-1 text-[10.5px] font-semibold tracking-[0.1em] text-t3 uppercase">Contact & help</div>
          <a role="menuitem" href={ABOUT.issues} target="_blank" rel="noreferrer" className="flex h-8 items-center gap-2 rounded-lg px-2 text-[12.5px] text-t1 hover:bg-hov">
            <MessageSquareWarning size={14} className="text-t2" /> Report a problem or ask on GitHub <ExternalLink size={11} className="ml-auto text-t3" />
          </a>
          <a role="menuitem" href={ABOUT.repo} target="_blank" rel="noreferrer" className="flex h-8 items-center gap-2 rounded-lg px-2 text-[12.5px] text-t1 hover:bg-hov">
            <Github size={14} className="text-t2" /> {ABOUT.repo.replace(/^https?:\/\//, '')} <ExternalLink size={11} className="ml-auto text-t3" />
          </a>
          <a role="menuitem" href={`mailto:${ABOUT.email}?subject=${encodeURIComponent('DrawFlow')}`} className="flex h-8 items-center gap-2 rounded-lg px-2 text-[12.5px] text-t1 hover:bg-hov">
            <Mail size={14} className="text-t2" /> {ABOUT.email}
          </a>
          <div className="px-2 pt-1 pb-1.5 text-[10.5px] text-t3">{ABOUT.name} is free and open source, made by {ABOUT.author}.</div>
        </div>
      )}
    </div>
  );
}

/** Top-right "Open Source" link to the repository. */
export function OpenSourceButton() {
  return (
    <a href={ABOUT.repo} target="_blank" rel="noreferrer" title="Source code on GitHub" data-tour="open-source"
      className="df-ui-anim inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-panel2 px-3.5 text-[13px] font-medium whitespace-nowrap text-t1 transition-all hover:border-[#cbd2dc] hover:bg-hov">
      <Github size={15} /> Open Source
    </a>
  );
}
