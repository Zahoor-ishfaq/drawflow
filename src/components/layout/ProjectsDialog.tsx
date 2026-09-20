import { useEffect, useState } from 'react';
import { Copy, FilePlus2, FolderOpen, History, LayoutTemplate, Trash2, X } from 'lucide-react';
import { useStore } from '../../store/useStore';
import {
  deleteProject, deleteTemplate, duplicateProject, insertSceneTemplate, listProjects, listTemplates, listVersions,
  newProject, openProject, restoreVersion, useCurrentProjectId, type ProjectSummary, type SavedTemplate, type SavedVersion,
} from '../../lib/persistence';
import { TEMPLATES, buildTemplate, type TemplateDef } from '../../assets/templates';
import { IconButton } from '../ui/IconButton';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Segmented';
import { ConfirmDialog } from '../ui/ConfirmDialog';

type Tab = 'projects' | 'templates' | 'versions';

function when(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? `today ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function Thumb({ src, label }: { src?: string; label: string }) {
  return (
    <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border border-line bg-artboard">
      {src ? <img src={src} alt="" className="h-full w-full object-cover" draggable={false} /> : <span className="text-[11px] text-t3">{label}</span>}
    </div>
  );
}

export function ProjectsDialog({ onClose, initialTab = 'projects' }: { onClose: () => void; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [versions, setVersions] = useState<SavedVersion[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'project' | 'template' | 'version'; id: string; name: string } | null>(null);
  const currentId = useCurrentProjectId();
  const elementCount = useStore((s) => s.elements.length);

  const refresh = async () => {
    setProjects(await listProjects());
    setTemplates(await listTemplates());
    setVersions(await listVersions(currentId));
  };
  useEffect(() => { void refresh(); }, [currentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const startTemplate = async (t: TemplateDef) => {
    setBusy(t.id);
    try {
      const built = await buildTemplate(t);
      await newProject(built, t.name);
      onClose();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101623]/45" onMouseDown={onClose}>
      <div
        className="flex max-h-[86vh] w-[820px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_20px_60px_rgba(15,25,45,0.3)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line pr-2.5 pl-4">
          <span className="text-[15px] font-semibold">Projects</span>
          <div className="w-[360px]">
            <Segmented<Tab>
              value={tab}
              onChange={setTab}
              options={[{ value: 'projects', label: 'My projects' }, { value: 'templates', label: 'Templates' }, { value: 'versions', label: 'Version history' }]}
            />
          </div>
          <IconButton label="Close" onClick={onClose}><X size={15} /></IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'projects' && (
            <>
              <div className="mb-3 flex items-center gap-2">
                <Button variant="primary" onClick={() => { void newProject().then(onClose); }}>
                  <FilePlus2 size={14} /> New blank project
                </Button>
                <Button variant="secondary" onClick={() => setTab('templates')}>
                  <LayoutTemplate size={14} /> Start from a template
                </Button>
                <span className="text-[11.5px] text-t3">Projects live in this browser; use “Save to file…” to back one up.</span>
              </div>
              {projects.length === 0 ? (
                <p className="text-[12.5px] text-t3">No saved projects yet.</p>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {projects.map((p) => (
                    <div key={p.id} className={'group flex flex-col gap-1.5 rounded-xl border p-2 ' + (p.id === currentId ? 'border-accent bg-accent-weak/40' : 'border-line hover:border-[#b9c2cf]')}>
                      <button type="button" className="text-left" onClick={() => { void openProject(p.id).then(onClose); }} title="Open">
                        <Thumb src={p.thumbnail} label={p.elementCount ? 'no preview yet' : 'empty'} />
                        <div className="mt-1.5 truncate text-[12.5px] font-medium text-t1">{p.name}{p.id === currentId ? ' (open)' : ''}</div>
                        <div className="text-[10.5px] text-t3">{p.elementCount} element{p.elementCount === 1 ? '' : 's'} · {p.duration.toFixed(0)} s · {when(p.savedAt)}</div>
                      </button>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                        <IconButton label="Duplicate" className="!h-6 !w-6" onClick={() => { void duplicateProject(p.id).then(refresh); }}><Copy size={12} /></IconButton>
                        <IconButton label="Delete" className="!h-6 !w-6 hover:!bg-red-50 hover:!text-red-500" onClick={() => setConfirm({ kind: 'project', id: p.id, name: p.name })}><Trash2 size={12} /></IconButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'templates' && (
            <>
              <div className="mb-2 text-[11px] font-medium tracking-wide text-t3 uppercase">Built in</div>
              <div className="grid grid-cols-4 gap-3">
                {TEMPLATES.map((t) => (
                  <button key={t.id} type="button" className="flex flex-col gap-1.5 rounded-xl border border-line p-2 text-left hover:border-accent disabled:opacity-60" disabled={!!busy} onClick={() => void startTemplate(t)}>
                    <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-line bg-artboard text-[24px]">
                      {busy === t.id ? <span className="text-[12px] text-t3">Building…</span> : <LayoutTemplate size={26} className="text-accent" />}
                    </div>
                    <div className="truncate text-[12.5px] font-medium text-t1">{t.name}</div>
                    <div className="line-clamp-2 text-[10.5px] leading-snug text-t3">{t.description}</div>
                    <div className="text-[10.5px] text-t3">~{t.seconds} s · {t.scenes.length} scene{t.scenes.length === 1 ? '' : 's'}</div>
                  </button>
                ))}
              </div>
              <div className="mt-4 mb-2 text-[11px] font-medium tracking-wide text-t3 uppercase">Yours</div>
              {templates.length === 0 ? (
                <p className="text-[12px] text-t3">Save any project or scene as a template from the project menu and it will appear here. Share templates by saving them to a file.</p>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {templates.map((t) => (
                    <div key={t.id} className="group flex flex-col gap-1.5 rounded-xl border border-line p-2 hover:border-[#b9c2cf]">
                      <button
                        type="button"
                        className="text-left"
                        title={t.kind === 'scene' ? 'Add this scene to the current project' : 'Start a new project from this template'}
                        onClick={() => {
                          if (t.kind === 'scene') { insertSceneTemplate(t); onClose(); }
                          else void newProject({ project: t.project, elements: t.elements }, t.name).then(onClose);
                        }}
                      >
                        <Thumb src={t.thumbnail} label="template" />
                        <div className="mt-1.5 truncate text-[12.5px] font-medium text-t1">{t.name}</div>
                        <div className="text-[10.5px] text-t3">{t.kind === 'scene' ? 'scene · adds to the current project' : 'project'} · {t.elements.length} elements</div>
                      </button>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                        <IconButton label="Delete template" className="!h-6 !w-6 hover:!bg-red-50 hover:!text-red-500" onClick={() => setConfirm({ kind: 'template', id: t.id, name: t.name })}><Trash2 size={12} /></IconButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'versions' && (
            <>
              <p className="mb-3 text-[12px] text-t3">
                <History size={12} className="mr-1 inline" />
                A version is kept every few minutes while you work (and whenever you choose “Save version”). Restoring replaces the current state; undo brings it back.
              </p>
              {versions.length === 0 ? (
                <p className="text-[12.5px] text-t3">{elementCount ? 'No versions yet — they appear after a few minutes of editing.' : 'Nothing to version yet.'}</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {versions.map((v) => (
                    <div key={v.id} className="flex items-center gap-3 rounded-xl border border-line p-2">
                      <div className="w-[120px] shrink-0"><Thumb src={v.thumbnail} label="—" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] font-medium text-t1">{v.label} · {when(v.savedAt)}</div>
                        <div className="text-[11px] text-t3">{v.elements.length} elements · {v.project.duration.toFixed(0)} s · {v.project.name}</div>
                      </div>
                      <Button variant="secondary" onClick={() => { void restoreVersion(v.id).then(onClose); }}>Restore</Button>
                      <IconButton label="Delete version" className="hover:!bg-red-50 hover:!text-red-500" onClick={() => setConfirm({ kind: 'version', id: v.id, name: v.label })}><Trash2 size={13} /></IconButton>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex h-10 shrink-0 items-center gap-2 border-t border-line px-4 text-[11px] text-t3">
          <FolderOpen size={12} /> Files: use the project menu to save to / open a .drawflow.json.
        </div>
      </div>
      {confirm && (
        <ConfirmDialog
          title={`Delete “${confirm.name}”?`}
          message={confirm.kind === 'project' ? 'The project and its version history are removed from this browser. This cannot be undone.' : 'This cannot be undone.'}
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            const c = confirm;
            setConfirm(null);
            const run = c.kind === 'project' ? deleteProject(c.id) : c.kind === 'template' ? deleteTemplate(c.id) : import('../../lib/db').then(({ dbTx }) => dbTx('versions', 'readwrite', (s) => s.delete(c.id)));
            void run.then(refresh);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
