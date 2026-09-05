export type DrawStyle = 'draw' | 'appear' | 'fade';
export type HandStyle = 'marker' | 'pencil' | 'chalk' | 'none';
export type ElementKind = 'text' | 'shape' | 'svg' | 'image';

export interface DrawElement {
  id: string;
  kind: ElementKind;
  label: string;              // shown on the timeline clip
  paths: string[];            // SVG path 'd' strings, already positioned
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;        // in canvas px (divided by scale at render time)
  fillAfterDraw: boolean;

  // transform (applied via a wrapping <g transform=...>)
  x: number;
  y: number;
  scale: number;
  rotation: number;

  // timeline
  startTime: number;          // seconds from timeline zero
  drawDuration: number;       // seconds to draw this element
  style: DrawStyle;
  zIndex: number;             // stacking + timeline row

  // text-only metadata (for re-editing)
  text?: string;
  fontSize?: number;
  fontFamily?: string;
}

export interface AudioTrack {
  id: string;
  name: string;
  buffer: AudioBuffer | null; // decoded, for waveform + playback
  url: string;                // object URL of the uploaded file
  startTime: number;
  volume: number;             // 0..1
}

export interface Project {
  name: string;
  width: number;              // canvas px, default 1920
  height: number;             // default 1080
  fps: number;                // default 30
  background: string;         // default '#ffffff'
  duration: number;           // total timeline length, seconds (auto-grows)
}
