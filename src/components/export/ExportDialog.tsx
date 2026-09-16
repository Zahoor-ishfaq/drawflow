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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101623]/45">
      <div className="w-[400px] rounded-2xl border border-line bg-panel shadow-[0_20px_60px_rgba(15,25,45,0.3)]">
        <div className="flex h-12 items-center justify-between border-b border-line pr-2.5 pl-4">
          <span className="text-[15px] font-semibold">Export video</span>
          <IconButton label="Close" onClick={onClose} disabled={working}>
            <X size={15} />
          </IconButton>
        </div>

        <div className="flex flex-col gap-3.5 p-4">
          {!isolated && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] leading-relaxed text-red-600">
              <span className="font-semibold">Export unavailable.</span> This page is not
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
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] whitespace-pre-wrap text-red-600">
                  {state.message}
                </div>
              )}
              <p className="text-[11.5px] leading-relaxed text-t3">
                Rendering happens entirely in your browser. A 20–30&#8202;s clip can take
                1–3 minutes at 1080p.
              </p>
              <Button
                variant="primary"
                className="justify-center"
                onClick={() => void run()}
                disabled={!isolated}
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
                    width: state.phase === 'loading' ? '4%' : `${exportProgress * 100}%`,
                  }}
                />
              </div>
              <p className="text-[11.5px] text-t3">Keep this tab open while exporting.</p>
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
