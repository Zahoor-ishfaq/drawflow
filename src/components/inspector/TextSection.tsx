import { useEffect, useState } from 'react';
import type { DrawElement } from '../../types';
import { useStore } from '../../store/useStore';
import { textToPaths, boldStrokeWidth, DEFAULT_FONT_ID, DEFAULT_FONT_SIZE } from '../../lib/textToPaths';
import { Field, SectionHeader } from '../ui/Field';
import { Button } from '../ui/Button';
import { TextControls, type TextSettings } from '../library/TextControls';

function settingsOf(el: DrawElement): TextSettings {
  return {
    fontId: el.fontFamily ?? DEFAULT_FONT_ID,
    fontSize: el.fontSize ?? DEFAULT_FONT_SIZE,
    bold: el.fontWeight === 'bold',
    italic: !!el.italic,
    align: el.align,
    lineHeight: el.lineHeight,
    letterSpacing: el.letterSpacing,
    rtl: !!el.rtl,
  };
}

export function TextSection({ element: el }: { element: DrawElement }) {
  const updateElement = useStore((s) => s.updateElement);
  const customFonts = useStore((s) => s.project.fonts);
  const [text, setText] = useState(el.text ?? '');
  const [settings, setSettings] = useState<TextSettings>(settingsOf(el));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // sync when a different text element is selected
  useEffect(() => {
    setText(el.text ?? '');
    setSettings(settingsOf(el));
    setError(null);
  }, [el.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const settingsDirty = JSON.stringify(settings) !== JSON.stringify(settingsOf(el));
  const textDirty = text !== (el.text ?? '');

  const apply = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const paths = await textToPaths(text, settings.fontId, settings.fontSize, { ...settings, customFonts });
      const trimmed = text.trim();
      const wasBold = el.fontWeight === 'bold';
      const baseStroke = wasBold ? el.strokeWidth - boldStrokeWidth(el.fontSize ?? DEFAULT_FONT_SIZE) : el.strokeWidth;
      updateElement(el.id, {
        paths,
        text,
        fontFamily: settings.fontId,
        fontSize: settings.fontSize,
        fontWeight: settings.bold ? 'bold' : 'normal',
        italic: !!settings.italic,
        align: settings.align,
        lineHeight: settings.lineHeight,
        letterSpacing: settings.letterSpacing,
        rtl: !!settings.rtl,
        strokeWidth: Math.max(0.5, baseStroke) + (settings.bold ? boldStrokeWidth(settings.fontSize) : 0),
        label: trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not regenerate text.');
    } finally {
      setBusy(false);
    }
  };

  // style changes apply straight away; text edits wait for the button (or Ctrl+Enter)
  useEffect(() => {
    if (!textDirty && settingsDirty) void apply();
  }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-2.5">
      <SectionHeader>Text</SectionHeader>
      <Field label="Content">
        <textarea
          className="df-input min-h-[54px] resize-y"
          value={text}
          dir={settings.rtl ? 'rtl' : undefined}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void apply(); }}
        />
      </Field>
      <TextControls value={settings} onChange={setSettings} />
      {error && <div className="text-[12px] text-red-500">{error}</div>}
      {textDirty && (
        <Button variant="secondary" className="justify-center" onClick={() => void apply()} disabled={busy || !text.trim()}>
          {busy ? 'Updating…' : 'Update text'}
        </Button>
      )}
    </div>
  );
}
