import { useState } from 'react';
import { addTextElement } from '../../lib/addElements';
import { DEFAULT_FONT_ID, DEFAULT_FONT_SIZE, looksRtl } from '../../lib/textToPaths';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { TextControls, type TextSettings } from './TextControls';

export function TextPanel({ onAdded }: { onAdded?: () => void }) {
  const [text, setText] = useState('');
  const [settings, setSettings] = useState<TextSettings>({ fontId: DEFAULT_FONT_ID, fontSize: DEFAULT_FONT_SIZE });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await addTextElement(text, settings.fontId, settings.fontSize, settings);
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
          dir={settings.rtl ? 'rtl' : undefined}
          onChange={(e) => {
            setText(e.target.value);
            // switch to right-to-left automatically for Hebrew/Arabic scripts
            if (!settings.rtl && looksRtl(e.target.value)) setSettings((s) => ({ ...s, rtl: true }));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submit();
          }}
        />
      </Field>
      <TextControls value={settings} onChange={setSettings} />
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
        letter by letter by the animated hand; "Typewriter" in the Animation tab
        types it out instead.
      </p>
    </div>
  );
}
