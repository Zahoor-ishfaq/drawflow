import { useState } from 'react';
import { addTextElement } from '../../lib/addElements';
import { DEFAULT_FONT_ID, DEFAULT_FONT_SIZE, FONTS } from '../../lib/textToPaths';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';

export function TextPanel({ onAdded }: { onAdded?: () => void }) {
  const [text, setText] = useState('');
  const [fontId, setFontId] = useState(DEFAULT_FONT_ID);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await addTextElement(text, fontId, fontSize);
      setText('');
      onAdded?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate text paths.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <Field label="Your text">
        <textarea
          className="df-input min-h-[64px] resize-y"
          placeholder="Type something…"
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submit();
          }}
        />
      </Field>
      <div className="grid grid-cols-[1fr_76px] gap-2">
        <Field label="Font">
          <select className="df-input" value={fontId} onChange={(e) => setFontId(e.target.value)}>
            {FONTS.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Size">
          <input
            type="number"
            className="df-input"
            min={12}
            max={600}
            value={fontSize}
            onChange={(e) => setFontSize(parseInt(e.target.value, 10) || DEFAULT_FONT_SIZE)}
          />
        </Field>
      </div>
      {error && <div className="text-[12px] text-red-500">{error}</div>}
      <Button
        variant="primary"
        className="justify-center"
        onClick={() => void submit()}
        disabled={busy || !text.trim()}
      >
        {busy ? 'Adding…' : 'Add to canvas'}
      </Button>
      <p className="text-[11.5px] leading-relaxed text-t3">
        The handwritten font looks most convincing when drawn. Text is written
        letter by letter by the animated hand.
      </p>
    </div>
  );
}
