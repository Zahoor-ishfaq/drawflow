import { useState } from 'react';
import {
  ArrowRight, Check, Circle, MessageSquare, Minus, RectangleHorizontal, Square, Star, Type,
} from 'lucide-react';
import { addShapeElement, addTextElement } from '../../lib/addElements';
import { DEFAULT_FONT_ID, DEFAULT_FONT_SIZE, FONTS } from '../../lib/textToPaths';
import { Button } from '../ui/Button';
import { SectionHeader } from '../ui/Field';
import { Dropzone } from './Dropzone';

const SHAPE_ICONS: { id: string; label: string; Icon: typeof Square }[] = [
  { id: 'rect', label: 'Rectangle', Icon: Square },
  { id: 'rounded-rect', label: 'Rounded rect', Icon: RectangleHorizontal },
  { id: 'ellipse', label: 'Ellipse', Icon: Circle },
  { id: 'line', label: 'Line', Icon: Minus },
  { id: 'arrow', label: 'Arrow', Icon: ArrowRight },
  { id: 'star', label: 'Star', Icon: Star },
  { id: 'check', label: 'Checkmark', Icon: Check },
  { id: 'speech-bubble', label: 'Speech bubble', Icon: MessageSquare },
];

export function AddPanel() {
  const [showTextForm, setShowTextForm] = useState(false);
  const [text, setText] = useState('');
  const [fontId, setFontId] = useState(DEFAULT_FONT_ID);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitText = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await addTextElement(text, fontId, fontSize);
      setText('');
      setShowTextForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate text paths.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3">
      <SectionHeader>Text</SectionHeader>
      {!showTextForm ? (
        <Button variant="secondary" className="w-full justify-center" onClick={() => setShowTextForm(true)}>
          <Type size={14} />
          Add text
        </Button>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border border-line bg-panel2 p-2">
          <textarea
            className="df-input min-h-[54px] resize-y"
            placeholder="Type something…"
            value={text}
            autoFocus
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submitText();
            }}
          />
          <div className="flex gap-2">
            <select
              className="df-input flex-1"
              value={fontId}
              onChange={(e) => setFontId(e.target.value)}
            >
              {FONTS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
            <input
              type="number"
              className="df-input w-16"
              min={12}
              max={600}
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value, 10) || DEFAULT_FONT_SIZE)}
              title="Font size"
            />
          </div>
          {error && <div className="text-[11px] text-red-400">{error}</div>}
          <div className="flex justify-end gap-1.5">
            <Button onClick={() => { setShowTextForm(false); setError(null); }}>Cancel</Button>
            <Button variant="secondary" onClick={() => void submitText()} disabled={busy || !text.trim()}>
              {busy ? 'Adding…' : 'Add'}
            </Button>
          </div>
        </div>
      )}

      <SectionHeader>Shapes</SectionHeader>
      <div className="grid grid-cols-4 gap-1.5">
        {SHAPE_ICONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            title={label}
            aria-label={label}
            className="df-ui-anim flex h-11 items-center justify-center rounded-sm border border-line bg-panel2 text-t2 transition-colors hover:bg-hov hover:text-t1"
            onClick={() => addShapeElement(id)}
          >
            <Icon size={16} />
          </button>
        ))}
      </div>

      <SectionHeader>Import</SectionHeader>
      <Dropzone />
    </div>
  );
}
