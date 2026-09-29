import { create } from 'zustand';

interface BuiltInVoiceState {
  /** null until asked; false before the one-time model download */
  downloaded: boolean | null;
  /** 0–100 while the model downloads, else null */
  progress: number | null;
  refresh(): Promise<void>;
}

/** The built-in voice's model: on this computer yet, or downloading (desktop app only). */
export const useBuiltInVoice = create<BuiltInVoiceState>((set) => ({
  downloaded: null,
  progress: null,
  refresh: async () => {
    const status = await window.drawflow?.voiceStatus?.().catch(() => null);
    if (status) set({ downloaded: status.downloaded });
  },
}));

if (typeof window !== 'undefined' && window.drawflow?.onVoiceProgress) {
  window.drawflow.onVoiceProgress(({ loaded, total }) => {
    const pct = total ? Math.floor((100 * loaded) / total) : 0;
    // at 100 % the file is still being saved; `refresh` after the take confirms it is there
    useBuiltInVoice.setState({ progress: pct >= 100 ? null : pct });
  });
}
