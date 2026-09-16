export type DrawStyle = 'draw' | 'appear' | 'fade';
export type HandStyle = 'marker' | 'pencil' | 'chalk' | 'none';
export type ElementKind = 'text' | 'shape' | 'svg' | 'image';

/** How the camera frames an element while it is being drawn. */
export type CameraMode = 'auto' | 'whole' | 'previous' | 'custom';

export interface CameraView {
  cx: number;   // canvas coords of the view centre
  cy: number;
  zoom: number; // 1 = whole artboard fits the frame; 2 = 2× magnification
}

export interface DrawElement {
  id: string;
  kind: ElementKind;
  label: string;              // shown on the timeline card
  paths: string[];            // SVG path 'd' strings in local units
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;        // in canvas px (divided by scale at render time)
  fillAfterDraw: boolean;

  // transform (applied via a wrapping <g transform=...>)
  x: number;
  y: number;
  scale: number;
  rotation: number;

  // timeline — VideoScribe model: elements play one after another.
  // startTime is derived from the sequence (see rechain in the store).
  startTime: number;          // seconds; when drawing starts
  drawDuration: number;       // "Animate": seconds to draw this element
  pauseAfter: number;         // "Pause": camera holds on it after drawing
  transitionIn: number;       // "Transition": camera travel time into it
  style: DrawStyle;
  zIndex: number;             // stacking order

  // camera
  camera: CameraMode;
  cameraZoom: number;         // auto-framing tightness multiplier (0.5 – 2)
  customCamera?: CameraView;

  // hand override (undefined → project default)
  hand?: HandStyle;

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

export type PaperStyle = 'plain' | 'grid' | 'dots' | 'lined' | 'cream' | 'chalkboard' | 'kraft';

export type CameraEasing = 'easeOut' | 'linear' | 'cut';

export interface Project {
  name: string;
  width: number;              // artboard px, default 1920
  height: number;             // default 1080
  fps: number;                // default 30
  background: string;         // paper colour, default '#ffffff'
  paper: PaperStyle;
  duration: number;           // total timeline length, seconds (derived)
  hand: HandStyle;            // default drawing hand
  cameraEasing: CameraEasing;
  zoomAtEnd: boolean;         // pull back to the whole scribe at the end
  endHold: number;            // seconds to hold the final frame
}
