import { Check } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { PAPERS, paperDef } from '../../assets/paper';
import { reinkForPaper } from '../../lib/addElements';
import { Field } from '../ui/Field';
import { ColorInput } from '../ui/ColorInput';

function Swatch({ id, color }: { id: string; color: string }) {
  const def = paperDef(id as never);
  const defs = def.defs(color);
  return (
    <svg viewBox="0 0 160 100" className="h-full w-full">
      {defs && <defs dangerouslySetInnerHTML={{ __html: defs }} />}
      <rect width="160" height="100" fill={def.fill(color)} />
      <text x="14" y="62" fontFamily="Caveat, cursive" fontSize="34" fill={def.ink}>Aa</text>
    </svg>
  );
}

/** Project-level "Set paper" panel. */
export function PaperPanel() {
  const project = useStore((s) => s.project);
  const updateProject = useStore((s) => s.updateProject);
  const current = paperDef(project.paper);

  const choose = (id: (typeof PAPERS)[number]['id']) => {
    const next = paperDef(id);
    const prevInk = current.ink;
    updateProject({
      paper: id,
      background: next.customColor && current.customColor ? project.background : next.color,
    });
    if (prevInk !== next.ink) reinkForPaper(prevInk, next.ink);
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="grid grid-cols-2 gap-2">
        {PAPERS.map((p) => {
          const active = p.id === project.paper;
          const color = p.customColor && active ? project.background : p.color;
          return (
            <button
              key={p.id}
              type="button"
              className={
                'df-ui-anim relative overflow-hidden rounded-xl border-2 bg-panel text-left transition-colors ' +
                (active ? 'border-accent' : 'border-line hover:border-[#b9c2cf]')
              }
              onClick={() => choose(p.id)}
            >
              <div className="h-16 w-full">
                <Swatch id={p.id} color={color} />
              </div>
              <div className={`px-2 py-1.5 text-[11.5px] ${active ? 'font-semibold text-t1' : 'text-t2'}`}>{p.label}</div>
              {active && (
                <span className="absolute top-1.5 right-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-accent text-white">
                  <Check size={11} strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {current.customColor && (
        <Field label="Paper colour">
          <ColorInput value={project.background} onChange={(v) => updateProject({ background: v })} />
        </Field>
      )}
    </div>
  );
}
