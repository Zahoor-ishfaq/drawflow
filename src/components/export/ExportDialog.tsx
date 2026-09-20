import { useEffect, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import { useStore } from '../../store/useStore';
import {
  exportVideo, hasNativeEncoder, isCancelled, isCrossOriginIsolated, EXPORT_FORMATS,
  type ExportFormat, type ExportPhase, type ExportResult,
} from '../../lib/exportVideo';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Field } from '../ui/Field';
import { Segmented } from '../ui/Segmented';
import { NumberInput } from '../ui/NumberInput';

type DialogState =
  | { step: 'options' }
  | { step: 'working'; phase: ExportPhase }
  | { step: 'done'; result: ExportResult }
  | { step: 'error'; message: string };

type Size = '720' | '1080' | '1440' | '2160' | 'custom';
const SIZES: { value: Size; label: string }[] = [
  { value: '720', label: '720p' },
  { value: '1080', label: '1080p' },
  { value: '1440', label: '1440p' },
  { value: '2160', label: '4K' },
  { value: 'custom', label: 'Custom' },
];

const PHASE_LABEL: Record<ExportPhase, string> = {
  loading: 'Preparing…',
  capturing: 'Rendering frames…',
  encoding: 'Mixing audio…',
  finishing: 'Writing file…',
};

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [size, setSize] = useState<Size>('1080');
  const [customHeight, setCustomHeight] = useState(1080);
  const [state, setState] = useState<DialogState>({ step: 'options' });
  const exportProgress = useStore((s) => s.exportProgress);
  const project = useStore((s) => s.project);
  const abortRef = useRef<AbortController | null>(null);

  const native = hasNativeEncoder();
  const fallbackBlocked = !native && !isCrossOriginIsolated();
  const working = state.step === 'working';
  const height = size === 'custom' ? Math.max(2, Math.round(customHeight / 2) * 2) : parseInt(size, 10);
  const width = Math.round((project.width * height) / project.height / 2) * 2;

  // free the result blob when the dialog goes away
  useEffect(() => {
    return () => {
      if (state.step === 'done') URL.revokeObjectURL(state.result.url);
    };
  }, [state]);

  const run = async () => {
    const s = useStore.getState();
    s.pause();
    s.setExporting(true);
    setState({ step: 'working', phase: 'loading' });
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const result = await exportVideo({
        format,
        height,
        project: s.project,
        elements: s.elements,
        audioClips: s.audioClips,
        time: s.currentTime,
        signal: abort.signal,
        onPhase: (phase) => {
          setState({ step: 'working', phase });
          useStore.getState().setExportProgress(0);
        },
        onProgress: (p) => useStore.getState().setExportProgress(p),
      });
      setState({ step: 'done', result });
    } catch (e) {
      if (isCancelled(e)) setState({ step: 'options' });
      else setState({ step: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      abortRef.current = null;
      useStore.getState().setExporting(false);
    }
  };

  const cancel = () => abortRef.current?.abort();

  const isVideo = format === 'mp4' || format === 'webm';
  const phaseLabel = state.step === 'working'
    ? `${PHASE_LABEL[state.phase]}${state.phase === 'capturing' ? ` ${Math.round(exportProgress * 100)}%` : ''}`
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101623]/45">
      <div className="w-[440px] rounded-2xl border border-line bg-panel shadow-[0_20px_60px_rgba(15,25,45,0.3)]">
        <div className="flex h-12 items-center justify-between border-b border-line pr-2.5 pl-4">
          <span className="text-[15px] font-semibold">Export</span>
          <IconButton label="Close" onClick={onClose} disabled={working}>
            <X size={15} />
          </IconButton>
        </div>

        <div className="flex flex-col gap-3.5 p-4">
          {fallbackBlocked && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] leading-relaxed text-red-600">
              <span className="font-semibold">Video export unavailable.</span> This browser has no
              built-in video encoder and the page is not cross-origin isolated, so the fallback
              encoder can't run either. GIF, PNG frames and snapshots still work.
            </div>
          )}

          {(state.step === 'options' || state.step === 'error') && (
            <>
              <Field label="Format">
                <Segmented<ExportFormat>
                  value={format}
                  onChange={setFormat}
                  options={EXPORT_FORMATS.map((f) => ({ value: f.value, label: f.label }))}
                />
              </Field>
              <Field label="Size">
                <Segmented<Size> value={size} onChange={setSize} options={SIZES} />
              </Field>
              <div className="flex items-center gap-3 text-[12px] text-t3">
                {size === 'custom' ? (
                  <NumberInput
                    label="Height"
                    value={customHeight}
                    onChange={(v) => setCustomHeight(Math.max(64, Math.min(4320, Math.round(v))))}
                    step={2}
                  />
                ) : null}
                <span>
                  {width} × {height} px · {project.fps} fps
                  {format === 'gif' ? ` (GIF plays at ${Math.round(project.fps / Math.max(1, Math.round(project.fps / 15)))} fps)` : ''}
                </span>
              </div>
              {state.step === 'error' && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] whitespace-pre-wrap text-red-600">
                  {state.message}
                </div>
              )}
              <p className="text-[11.5px] leading-relaxed text-t3">
                {format === 'png'
                  ? 'Saves the frame at the current playhead position as a PNG.'
                  : format === 'png-sequence'
                    ? 'Every frame as a numbered PNG inside a ZIP — for compositing elsewhere.'
                    : format === 'gif'
                      ? 'Animated GIF, no audio. Keep it short and small; 480p or less is best.'
                      : native
                        ? 'Rendered in your browser with its built-in video encoder — a 30 s clip usually takes under a minute.'
                        : 'This browser has no built-in encoder; the slower software encoder will be used.'}
              </p>
              <Button
                variant="primary"
                className="justify-center"
                onClick={() => void run()}
                disabled={isVideo && fallbackBlocked}
              >
                {state.step === 'error' ? 'Retry export' : 'Start export'}
              </Button>
            </>
          )}

          {state.step === 'working' && (
            <div className="flex flex-col gap-2.5 py-2">
              <div className="text-[13px] font-medium text-t1">{phaseLabel}</div>
              <div className="h-2 overflow-hidden rounded-full bg-panel2">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-150"
                  style={{
                    width: state.phase === 'capturing' ? `${exportProgress * 100}%`
                      : state.phase === 'loading' ? '3%' : '100%',
                  }}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[11.5px] text-t3">Keep this tab open while exporting.</p>
                <Button onClick={cancel}>Cancel</Button>
              </div>
            </div>
          )}

          {state.step === 'done' && (
            <div className="flex flex-col gap-3 py-1">
              <div className="text-[13px] text-t2">
                Done — {(state.result.sizeBytes / (1024 * 1024)).toFixed(1)} MB
              </div>
              <a
                href={state.result.url}
                download={state.result.filename}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-accent px-4 text-[13px] font-medium text-white shadow-[0_2px_8px_rgba(13,157,151,0.35)] hover:brightness-105"
              >
                <Download size={15} />
                Download {state.result.filename}
              </a>
              <Button className="justify-center" onClick={() => setState({ step: 'options' })}>
                Export another
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
