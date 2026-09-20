import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, CloudOff, FilePlus2, FolderOpen, History, LayoutTemplate, Loader2, Save } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { exportProjectFile, importProjectFile, newProject, saveNow, saveTemplate, saveVersion, useSaveStatus } from '../../lib/persistence';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ProjectsDialog } from './ProjectsDialog';
import { onShortcut } from '../../hooks/useKeyboardShortcuts';

function ago(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Small inline prompt for a name (templates, versions). */
function NamePrompt({ title, placeholder, onSubmit, onCancel }: { title: string; placeholder: string; onSubmit: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#101623]/45" onMouseDown={onCancel}>
      <div className="w-[360px] rounded-2xl border border-line bg-panel p-4 shadow-[0_20px_60px_rgba(15,25,45,0.3)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-2 text-[14px] font-semibold">{title}</div>
        <input autoFocus className="df-input" placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onSubmit(name.trim()); if (e.key === 'Escape') onCancel(); }} />
        <div className="mt-3 flex justify-end gap-1.5">
          <button type="button" className="h-8 rounded-full px-3.5 text-[13px] text-t2 hover:bg-hov" onClick={onCancel}>Cancel</button>
          <button type="button" className="h-8 rounded-full bg-accent px-3.5 text-[13px] font-medium text-white disabled:opacity-40" disabled={!name.trim()} onClick={() => onSubmit(name.trim())}>Save</button>
        </div>
      </div>
    </div>
  );
}

export function ProjectMenu() {
  const status = useSaveStatus();
  const [open, setOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [projects, setProjects] = useState<null | 'projects' | 'templates' | 'versions'>(null);
  const [prompt, setPrompt] = useState<null | 'template' | 'version' | 'scene'>(null);
  const [problems, setProblems] = useState<string[] | null>(null);
  const [, tick] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scenes = useStore((s) => s.project.scenes ?? []);

  useEffect(() => onShortcut((n) => {
    if (n === 'open-projects') setProjects('projects');
    else if (n === 'open-templates') setProjects('templates');
    else if (n === 'open-versions') setProjects('versions');
  }), []);

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
      const p = await importProjectFile(file);
      if (p.length) setProblems(p);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not open this file.');
    }
    setOpen(false);
  };

  const fresh = () => {
    const s = useStore.getState();
    setOpen(false);
    if (s.elements.length > 0 || s.audioClips.length > 0) { setConfirmNew(true); return; }
    void newProject();
  };

  const submitPrompt = async (name: string) => {
    const s = useStore.getState();
    if (prompt === 'version') await saveVersion(name);
    else if (prompt === 'template') await saveTemplate(name, '', 'project', s.elements);
    else if (prompt === 'scene') {
      const sceneId = s.elements.find((e) => e.id === s.selectedId)?.sceneId ?? scenes[scenes.length - 1]?.id;
      const members = sceneId ? s.elements.filter((e) => e.sceneId === sceneId) : s.elements;
      await saveTemplate(name, '', 'scene', members);
    }
    setPrompt(null);
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
        <div className="absolute top-9 right-0 z-50 w-72 overflow-hidden rounded-xl border border-line bg-panel py-1 shadow-[0_12px_40px_rgba(25,35,55,0.18)]">
          <MenuItem icon={<FolderOpen size={14} />} label="Projects, templates & history…" hint="everything saved in this browser" onClick={() => { setProjects('projects'); setOpen(false); }} />
          <MenuItem icon={<FilePlus2 size={14} />} label="New project" hint="the current one stays in your projects" onClick={fresh} />
          <MenuItem icon={<LayoutTemplate size={14} />} label="New from template…" onClick={() => { setProjects('templates'); setOpen(false); }} />
          <div className="my-1 h-px bg-line" />
          <MenuItem icon={<Save size={14} />} label="Save checkpoint now" hint="auto-saved after every change" onClick={() => { void saveNow(); setOpen(false); }} />
          <MenuItem icon={<History size={14} />} label="Save version…" hint="a named point in the history you can go back to" onClick={() => { setPrompt('version'); setOpen(false); }} />
          <MenuItem icon={<LayoutTemplate size={14} />} label="Save project as template…" onClick={() => { setPrompt('template'); setOpen(false); }} />
          <MenuItem icon={<LayoutTemplate size={14} />} label={scenes.length ? 'Save scene as template…' : 'Save selection as scene template…'} hint={scenes.length ? "the selected element's scene (or the last one)" : 'reusable in any project'} onClick={() => { setPrompt('scene'); setOpen(false); }} />
          <div className="my-1 h-px bg-line" />
          <MenuItem icon={<FolderOpen size={14} />} label="Save to file…" hint="a .drawflow.json you can back up or share" onClick={() => void saveToFile()} />
          <MenuItem icon={<FolderOpen size={14} />} label="Open file…" hint="opens as a new project" onClick={() => fileRef.current?.click()} />
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { void openFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      )}
      {confirmNew && (
        <ConfirmDialog
          title="Start a new project?"
          message="The current project is kept in your projects list; a blank one opens."
          confirmLabel="New project"
          cancelLabel="Keep working"
          onConfirm={() => { setConfirmNew(false); void newProject(); }}
          onCancel={() => setConfirmNew(false)}
        />
      )}
      {projects && <ProjectsDialog initialTab={projects} onClose={() => setProjects(null)} />}
      {prompt && (
        <NamePrompt
          title={prompt === 'version' ? 'Save a version' : prompt === 'template' ? 'Save as template' : 'Save scene as template'}
          placeholder={prompt === 'version' ? 'e.g. Before the redesign' : 'Template name'}
          onSubmit={(n) => void submitPrompt(n)}
          onCancel={() => setPrompt(null)}
        />
      )}
      {problems && (
        <ConfirmDialog
          title="Opened with fixes"
          message={`Some parts of the file were adjusted:\n• ${problems.slice(0, 6).join('\n• ')}${problems.length > 6 ? `\n… and ${problems.length - 6} more` : ''}`}
          confirmLabel="OK"
          cancelLabel="Close"
          onConfirm={() => setProblems(null)}
          onCancel={() => setProblems(null)}
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
