import {
  ArrowRight, Check, Circle, MessageSquare, Minus, RectangleHorizontal, Square, Star,
} from 'lucide-react';
import { addShapeElement } from '../../lib/addElements';

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
    <div className="grid grid-cols-3 gap-2 p-4">
      {SHAPE_ICONS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          title={`Add ${label.toLowerCase()}`}
          className="df-ui-anim flex h-[68px] flex-col items-center justify-center gap-1.5 rounded-xl border border-line bg-panel2 text-t2 transition-colors hover:border-accent hover:bg-accent-weak hover:text-accent"
          onClick={() => addShapeElement(id)}
        >
          <Icon size={20} />
          <span className="text-[10.5px] font-medium">{label}</span>
        </button>
      ))}
    </div>
  );
}
