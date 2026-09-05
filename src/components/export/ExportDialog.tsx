import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { useStore } from '../../store/useStore';
import {
  exportVideo, isCrossOriginIsolated,
  type ExportFormat, type ExportPhase, type ExportResult,
} from '../../lib/exportVideo';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Field } from '../ui/Field';
import { Segmented } from '../ui/Segmented';

type DialogState =
  | { step: 'options' }
  | { step: 'working'; phase: ExportPhase }
  | { step: 'done'; result: ExportResult }
  | { step: 'error'; message: string };

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [height, setHeight] = useState<720 | 1080>(1080);
  const [state, setState] = useState<DialogState>({ step: 'options' });
  const exportProgress = useStore((s) => s.exportProgress);

  const isolated = isCrossOriginIsolated();
  const working = state.step === 'working';

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
    try {
      const result = await exportVideo({
        format,
        height,
        project: s.project,
        elements: s.elements,
        audio: s.audio,
        handStyle: s.handStyle,
        onPhase: (phase) => {
          setState({ step: 'working', phase });
          useStore.getState().setExportProgress(0);
        },
        onProgress: (p) => useStore.getState().setExportProgress(p),
      });
      useStore.getState().setFfmpegReady(true);
      setState({ step: 'done', result });
    } catch (e) {
      setState({ step: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      useStore.getState().setExporting(false);
    }
  };

  const phaseLabel =
    state.step === 'working'
      ? state.phase === 'loading'
        ? 'Loading encoder…'
        : state.phase === 'capturing'
          ? `Capturing frames… ${Math.round(exportProgress * 100)}%`
          : `Encoding… ${Math.round(exportProgress * 100)}%`
      : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[380px] rounded-md border border-line bg-panel shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
        <div className="flex h-10 items-center justify-between border-b border-line px-3">
          <span className="text-[14px] font-medium">Export video</span>
          <IconButton label="Close" onClick={onClose} disabled={working}>
            <X size={14} />
          </IconButton>
        </div>

        <div className="flex flex-col gap-3 p-4">
          {!isolated && (
            <div className="rounded-sm border border-line bg-panel2 p-2.5 text-[12px] leading-relaxed text-t2">
              <span className="text-red-400">Export unavailable.</span> This page is not
              cross-origin isolated, so the in-browser encoder can't run. Serve the app
              over HTTPS with the headers{' '}
              <code className="text-[11px]">Cross-Origin-Opener-Policy: same-origin</code> and{' '}
              <code className="text-[11px]">Cross-Origin-Embedder-Policy: require-corp</code>.
            </div>
          )}

          {(state.step === 'options' || state.step === 'error') && (
            <>
              <Field label="Format">
                <Segmented<ExportFormat>
                  value={format}
                  onChange={setFormat}
                  options={[
                    { value: 'mp4', label: 'MP4 (H.264)' },
                    { value: 'webm', label: 'WebM (VP9)' },
                  ]}
                />
              </Field>
              <Field label="Resolution">
                <Segmented<'720' | '1080'>
                  value={String(height) as '720' | '1080'}
                  onChange={(v) => setHeight(parseInt(v, 10) as 720 | 1080)}
                  options={[
                    { value: '720', label: '720p (faster)' },
                    { value: '1080', label: '1080p' },
                  ]}
                />
              </Field>
              {state.step === 'error' && (
                <div className="rounded-sm border border-red-900/60 bg-red-950/30 p-2.5 text-[12px] whitespace-pre-wrap text-red-300">
                  {state.message}
                </div>
              )}
              <p className="text-[11px] leading-relaxed text-t3">
                Rendering happens entirely in your browser. A 20–30&#8202;s clip can take
                1–3 minutes at 1080p.
              </p>
              <Button
                variant="primary"
                className="justify-center"
                onClick={() => void run()}
                disabled={!isolated}
              >
                {state.step === 'error' ? 'Retry export' : 'Export'}
              </Button>
            </>
          )}

          {state.step === 'working' && (
            <div className="flex flex-col gap-2 py-2">
              <div className="text-[12px] text-t2">{phaseLabel}</div>
              <div className="h-1 overflow-hidden rounded-full bg-panel2">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-150"
                  style={{
                    width: state.phase === 'loading' ? '4%' : `${exportProgress * 100}%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-t3">Keep this tab open while exporting.</p>
            </div>
          )}

          {state.step === 'done' && (
            <div className="flex flex-col gap-3 py-1">
              <div className="text-[12px] text-t2">
                Done — {(state.result.sizeBytes / (1024 * 1024)).toFixed(1)} MB
              </div>
              <a
                href={state.result.url}
                download={state.result.filename}
                className="inline-flex h-7 items-center justify-center gap-1.5 rounded-sm bg-accent px-2.5 text-[13px] text-white hover:brightness-110"
              >
                <Download size={14} />
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
