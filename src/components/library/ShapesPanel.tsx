import {
  ArrowRight, Check, Circle, MessageSquare, Minus, RectangleHorizontal, Square, Star,
} from 'lucide-react';
import { addLibraryElement, addShapeElement } from '../../lib/addElements';
import { ICONS, ICON_GROUPS } from '../../assets/library';

const SHAPE_ICONS: { id: string; label: string; Icon: typeof Square }[] = [
  { id: 'rect', label: 'Rectangle', Icon: Square },
  { id: 'rounded-rect', label: 'Rounded', Icon: RectangleHorizontal },
  { id: 'ellipse', label: 'Ellipse', Icon: Circle },
  { id: 'line', label: 'Line', Icon: Minus },
  { id: 'arrow', label: 'Arrow', Icon: ArrowRight },
  { id: 'star', label: 'Star', Icon: Star },
  { id: 'check', label: 'Check', Icon: Check },
  { id: 'speech-bubble', label: 'Bubble', Icon: MessageSquare },
];

export function ShapesPanel() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-t2">Shapes</span>
      <div className="grid grid-cols-4 gap-2">
        {SHAPE_ICONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            title={`Add ${label.toLowerCase()}`}
            className="df-ui-anim flex h-[60px] flex-col items-center justify-center gap-1 rounded-xl border border-line bg-panel2 text-t2 transition-colors hover:border-accent hover:bg-accent-weak hover:text-accent"
            onClick={() => addShapeElement(id)}
          >
            <Icon size={18} />
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        ))}
      </div>

      <div className="mt-1 border-t border-line pt-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-t2">Icons</span>
      </div>
      {ICON_GROUPS.map((group) => (
        <div key={group}>
          <div className="mb-1.5 text-[11px] text-t3">{group}</div>
          <div className="grid grid-cols-4 gap-1.5">
            {ICONS.filter((a) => a.group === group).map((asset) => (
              <button
                key={asset.id}
                type="button"
                title={asset.name}
                aria-label={`Add ${asset.name}`}
                className="df-ui-anim flex h-12 items-center justify-center rounded-xl border border-line bg-panel2 text-t2 transition-colors hover:border-accent hover:bg-accent-weak hover:text-accent"
                onClick={() => addLibraryElement(asset)}
              >
                <svg viewBox="0 0 24 24" width={20} height={20} fill="none"
                  stroke="currentColor" strokeWidth={1.6}
                  strokeLinecap="round" strokeLinejoin="round">
                  {asset.paths.map((d, i) => <path key={i} d={d} />)}
                </svg>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
