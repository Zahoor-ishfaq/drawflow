import { useEffect, useState } from 'react';
import type { DrawElement } from '../../types';
import { useStore } from '../../store/useStore';
import { textToPaths, DEFAULT_FONT_ID, DEFAULT_FONT_SIZE, FONTS } from '../../lib/textToPaths';
import { Field, SectionHeader } from '../ui/Field';
import { Button } from '../ui/Button';

export function TextSection({ element: el }: { element: DrawElement }) {
  const updateElement = useStore((s) => s.updateElement);
  const [text, setText] = useState(el.text ?? '');
  const [fontId, setFontId] = useState(el.fontFamily ?? DEFAULT_FONT_ID);
  const [fontSize, setFontSize] = useState(el.fontSize ?? DEFAULT_FONT_SIZE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // sync when a different text element is selected
  useEffect(() => {
    setText(el.text ?? '');
    setFontId(el.fontFamily ?? DEFAULT_FONT_ID);
    setFontSize(el.fontSize ?? DEFAULT_FONT_SIZE);
    setError(null);
  }, [el.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty =
    text !== (el.text ?? '') ||
    fontId !== (el.fontFamily ?? DEFAULT_FONT_ID) ||
    fontSize !== (el.fontSize ?? DEFAULT_FONT_SIZE);

  const apply = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const paths = await textToPaths(text, fontId, fontSize);
      const trimmed = text.trim();
      updateElement(el.id, {
        paths,
        text,
        fontFamily: fontId,
        fontSize,
        label: trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not regenerate text.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <SectionHeader>Text</SectionHeader>
      <Field label="Content">
        <textarea
          className="df-input min-h-[54px] resize-y"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-[1fr_64px] gap-2">
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
      {dirty && (
        <Button variant="secondary" className="justify-center" onClick={() => void apply()} disabled={busy || !text.trim()}>
          {busy ? 'Updating…' : 'Update text'}
        </Button>
      )}
    </div>
  );
}
