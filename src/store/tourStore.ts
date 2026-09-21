import { create } from 'zustand';
import { TOURS } from '../lib/tours';

interface TourState {
  tourId: string | null;
  step: number;
  start(id: string): void;
  next(): void;
  back(): void;
  stop(): void;
}

const run = (id: string, step: number) => {
  const tour = TOURS.find((t) => t.id === id);
  tour?.steps[step]?.before?.();
};

/** Which guided tour is running and where it is. */
export const useTourStore = create<TourState>((set, get) => ({
  tourId: null,
  step: 0,
  start(id) { run(id, 0); set({ tourId: id, step: 0 }); },
  next() {
    const { tourId, step } = get();
    const tour = TOURS.find((t) => t.id === tourId);
    if (!tour) return;
    if (step + 1 >= tour.steps.length) { set({ tourId: null, step: 0 }); return; }
    run(tour.id, step + 1);
    set({ step: step + 1 });
  },
  back() {
    const { tourId, step } = get();
    if (!tourId || step === 0) return;
    run(tourId, step - 1);
    set({ step: step - 1 });
  },
  stop() { set({ tourId: null, step: 0 }); },
}));
