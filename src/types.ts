/**
 * Entrance effect. 'draw' = hand draws it (scribble-reveal for raster images);
 * 'typewriter' shows text glyph by glyph.
 */
export type DrawStyle =
  | 'draw' | 'appear' | 'fade' | 'slide' | 'wipe' | 'scale' | 'pop' | 'bounce' | 'typewriter';
export type Direction = 'left' | 'right' | 'top' | 'bottom';
/** @deprecated use Direction */
export type SlideFrom = Direction;
/** Built-in hands, or `custom:<id>` for a hand the user uploaded (Project.customHands). */
export type HandStyle = 'marker' | 'pen' | 'chalk' | 'none' | (string & {});
export type ElementKind = 'text' | 'shape' | 'svg' | 'image';

/** How a raster image is revealed while the hand "draws" it. */
export type RevealMode = 'scribble' | 'wipe' | 'radial' | 'center';
/** Order the hand draws an element's sub-paths in. */
export type StrokeOrder =
  | 'file' | 'reverse' | 'leftToRight' | 'rightToLeft' | 'topToBottom' | 'bottomToTop' | 'centerOut';
export type MotionEasing = 'easeOut' | 'easeIn' | 'easeInOut' | 'linear';

export type EmphasisKind = 'pulse' | 'shake' | 'bounce' | 'spin' | 'grow' | 'highlight';
export interface Emphasis {
  kind: EmphasisKind;
  duration: number;   // seconds per repeat
  delay: number;      // seconds after drawing finishes
  repeat: number;     // 1..n
}

export type ExitKind = 'fade' | 'slide' | 'wipe' | 'erase' | 'reverseDraw' | 'shrink';
export interface Exit {
  kind: ExitKind;
  duration: number;
  /** seconds after the element's slot (draw + emphasis + pause) ends */
  delay: number;
  direction: Direction;
}

/** Raster picture attached to an 'image' element. */
export interface ImageRef {
  src: string;      // data: URL (embedded so export can rasterize it)
  width: number;    // natural pixel size
  height: number;
}

/** Fractions (0..1) trimmed from each side of an image. */
export interface Crop { left: number; top: number; right: number; bottom: number }

/** How the camera frames an element while it is being drawn. */
export type CameraMode = 'auto' | 'whole' | 'previous' | 'custom' | 'scene';

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
  /** per-path colour overrides for imported coloured artwork (null → element colour) */
  pathFills?: (string | null)[];
  pathStrokes?: (string | null)[];
  fillRule?: 'nonzero' | 'evenodd';
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;        // in canvas px (divided by scale at render time)
  fillAfterDraw: boolean;

  // transform (applied via a wrapping <g transform=...>)
  x: number;
  y: number;
  scale: number;
  rotation: number;
  flipX?: boolean;
  flipY?: boolean;
  opacity?: number;           // 0..1, default 1
  crop?: Crop;                // images only

  // editing state
  locked?: boolean;           // can't be moved/selected on the canvas
  hidden?: boolean;           // left out of the video and the timeline
  /** stacking offset on top of play order (bring forward / send backward) */
  layer?: number;
  /** elements this one was made from, so it can be ungrouped */
  groupChildren?: DrawElement[];
  /** scene this element belongs to (Project.scenes) */
  sceneId?: string;

  // timeline — VideoScribe model: elements play one after another.
  // startTime is derived from the sequence (see rechain in the store).
  startTime: number;          // seconds; when drawing starts
  drawDuration: number;       // "Animate": seconds to draw this element
  pauseAfter: number;         // "Pause": camera holds on it after drawing
  transitionIn: number;       // "Transition": camera travel time into it
  /** start together with the previous element instead of after it */
  withPrevious?: boolean;
  style: DrawStyle;
  slideFrom: Direction;       // direction for slide / wipe entrances and wipe reveals
  easing?: MotionEasing;      // for fade / slide / wipe / scale entrances
  strokeOrder?: StrokeOrder;
  revealMode?: RevealMode;    // images with style 'draw'
  emphasis?: Emphasis | null;
  exit?: Exit | null;
  zIndex: number;             // play order (stacking = play order + layer)

  // raster image (kind === 'image'); `paths` then holds the scribble-reveal path
  image?: ImageRef;

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
  fontWeight?: 'normal' | 'bold';
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;        // multiple of the font size, default 1.25
  letterSpacing?: number;     // em, default 0
}

export type AudioLaneKind = 'music' | 'voice' | 'sfx';

/** A decoded audio file or recording. Clips reference it by id. */
export interface AudioSource {
  id: string;
  name: string;
  blob: Blob;                 // original bytes (for export + persistence)
  buffer: AudioBuffer;        // decoded, for waveform + playback
  duration: number;           // seconds
}

/** A piece of a source placed on the timeline (splitting yields two clips). */
export interface AudioClip {
  id: string;
  name: string;
  lane: AudioLaneKind;
  sourceId: string;
  startTime: number;          // timeline position, seconds
  offset: number;             // seconds into the source where the clip begins
  duration: number;           // clip length on the timeline
  volume: number;             // 0..1.5
  fadeIn: number;             // seconds
  fadeOut: number;            // seconds
  muted: boolean;
  solo?: boolean;
  /** clip follows this scene when scenes are reordered */
  sceneId?: string;
}

export type PaperStyle = 'plain' | 'grid' | 'dots' | 'lined' | 'cream' | 'chalkboard' | 'kraft';

export type CameraEasing = 'easeOut' | 'linear' | 'cut';

export type SceneTransition = 'cut' | 'fade' | 'wipe';

/** A named, contiguous run of elements in play order. */
export interface Scene {
  id: string;
  name: string;
  transition: SceneTransition;     // how the picture changes when this scene starts
  transitionDuration: number;      // seconds
  /** paper overrides for this scene (undefined → project defaults) */
  background?: string;
  paper?: PaperStyle;
  /** clear the board when this scene starts (previous elements vanish) */
  clearBefore?: boolean;
}

export interface Marker {
  id: string;
  time: number;
  name: string;
  color: string;
}

/** A hand photo the user uploaded (transparent PNG/WebP), with its pen tip. */
export interface CustomHand {
  id: string;
  name: string;
  src: string;        // data: URL
  width: number;
  height: number;
  tipX: number;       // pen tip in image pixels
  tipY: number;
  /** fraction of the frame height the hand image spans */
  frameFraction?: number;
}

export interface CustomFont {
  id: string;
  name: string;
  data: string;       // data: URL of the TTF/OTF
}

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
  /** auto-framing: fraction of the frame an element fills (0.25 tight … 0.9 wide) */
  cameraFill: number;
  zoomAtEnd: boolean;         // pull back to the whole scribe at the end
  endHold: number;            // seconds to hold the final frame
  scenes?: Scene[];
  markers?: Marker[];
  /** hand image offset from the pen tip, in fractions of the hand height */
  handOffset?: { x: number; y: number };
  /** 0 = hand sits exactly on the stroke, 1 = heavily smoothed motion */
  handSmoothing?: number;
  customHands?: CustomHand[];
  fonts?: CustomFont[];
}
