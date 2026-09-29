import { create } from 'zustand';
import { explainAiError } from '../lib/ai/errors';
import { getAiSettings, updateAiSettings } from '../lib/ai/settings';
import { isLocalNotSetUp, listLocalVoices } from '../lib/ai/speech';

/** unknown: not checked yet · offline: nothing answers (not installed / not running) · error: it answered with a problem */
export type LocalVoiceStatus = 'unknown' | 'checking' | 'connected' | 'offline' | 'error';

interface LocalVoiceState {
  status: LocalVoiceStatus;
  /** what went wrong, for 'error' */
  message: string | null;
  /** the "what to download, how it works" popup */
  guideOpen: boolean;
  openGuide(): void;
  closeGuide(): void;
  /** Look for the voice app; on success its voices are loaded and it becomes a voice service everywhere. */
  check(): Promise<boolean>;
}

let running: Promise<boolean> | null = null;

/** Whether the voice app on this computer answers — shared by the Voice panel, the setup popup and AI settings. */
export const useLocalVoice = create<LocalVoiceState>((set) => ({
  status: 'unknown',
  message: null,
  guideOpen: false,
  openGuide: () => set({ guideOpen: true }),
  closeGuide: () => set({ guideOpen: false }),
  check: () => {
    if (running) return running;
    set({ status: 'checking', message: null });
    running = (async () => {
      const lv = getAiSettings().localVoice;
      try {
        const voices = await listLocalVoices(lv.url, lv.key);
        updateAiSettings({ localVoice: { ...getAiSettings().localVoice, enabled: true, voices: voices ?? [] } });
        set({ status: 'connected' });
        return true;
      } catch (e) {
        if (isLocalNotSetUp(e)) set({ status: 'offline' });
        else set({ status: 'error', message: explainAiError(e, 'local', 'voice').title });
        return false;
      } finally {
        running = null;
      }
    })();
    return running;
  },
}));
