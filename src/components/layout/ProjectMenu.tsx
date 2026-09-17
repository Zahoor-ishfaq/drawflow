import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, CloudOff, FilePlus2, FolderOpen, Loader2, Save } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { clearCheckpoint, exportProjectFile, importProjectFile, saveNow, useSaveStatus } from '../../lib/persistence';
import { clearSources } from '../../store/audioSources';
import { ConfirmDialog } from '../ui/ConfirmDialog';

function ago(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ProjectMenu() {
  const status = useSaveStatus();
  const [open, setOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [, tick] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // refresh the "x ago" label
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 15000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const label =
    status.state === 'saving' ? 'Saving…'
    : status.state === 'dirty' ? 'Unsaved changes'
    : status.state === 'saved' && status.at ? `Saved ${ago(status.at)}`
    : status.state === 'error' ? 'Save failed'
    : 'Not saved yet';

  const saveToFile = async () => {
    const { blob, filename } = await exportProjectFile();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setOpen(false);
  };

  const openFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      await importProjectFile(file);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not open this file.');
    }
    setOpen(false);
  };

  const fresh = async () => {
    const s = useStore.getState();
    setOpen(false);
    if (s.elements.length > 0 || s.audioClips.length > 0) {
      setConfirmNew(true);
      return;
    }
    await startFresh();
  };
  const startFresh = async () => {
    setConfirmNew(false);
    clearSources();
    useStore.getState().newProject();
    await clearCheckpoint();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="df-ui-anim flex h-8 items-center gap-1.5 rounded-full border border-line bg-panel px-3 text-[12px] text-t2 transition-colors hover:bg-hov hover:text-t1"
        onClick={() => setOpen((o) => !o)}
        title="Project: checkpoints are saved automatically in this browser"
      >
        {status.state === 'saving' ? <Loader2 size={13} className="animate-spin" />
          : status.state === 'saved' ? <Check size={13} className="text-accent" />
          : status.state === 'error' ? <CloudOff size={13} className="text-red-500" />
          : <Save size={13} />}
        {label}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute top-9 right-0 z-50 w-64 overflow-hidden rounded-xl border border-line bg-panel py-1 shadow-[0_12px_40px_rgba(25,35,55,0.18)]">
          <MenuItem icon={<Save size={14} />} label="Save checkpoint now" hint="auto-saved after every change" onClick={() => { void saveNow(); setOpen(false); }} />
          <MenuItem icon={<FolderOpen size={14} />} label="Save to file…" hint="a .drawflow.json you can back up" onClick={() => void saveToFile()} />
          <MenuItem icon={<FolderOpen size={14} />} label="Open file…" onClick={() => fileRef.current?.click()} />
          <div className="my-1 h-px bg-line" />
          <MenuItem icon={<FilePlus2 size={14} />} label="New project" onClick={() => void fresh()} />
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { void openFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      )}
      {confirmNew && (
        <ConfirmDialog
          title="Start a new project?"
          message="This clears the canvas, the timeline and the local checkpoint. If you want to keep the current project, save it to a file first."
          confirmLabel="Start new project"
          cancelLabel="Keep working"
          danger
          onConfirm={() => void startFresh()}
          onCancel={() => setConfirmNew(false)}
        />
      )}
    </div>
  );
}

function MenuItem({ icon, label, hint, onClick }: { icon: React.ReactNode; label: string; hint?: string; onClick: () => void }) {
  return (
    <button type="button" className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-hov" onClick={onClick}>
      <span className="mt-0.5 text-t2">{icon}</span>
      <span className="flex flex-col">
        <span className="text-[12.5px] text-t1">{label}</span>
        {hint && <span className="text-[10.5px] text-t3">{hint}</span>}
      </span>
    </button>
  );
}
