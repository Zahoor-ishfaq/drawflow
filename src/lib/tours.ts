// Guided tours: each feature has a handful of tips anchored to parts of the
// UI (elements carry data-tour="…"). A step may open a panel first so its
// target exists. The overlay (components/help/TourOverlay) does the rest.
import { emitShortcut, SHORTCUTS } from '../hooks/useKeyboardShortcuts';
import { useStore } from '../store/useStore';

export type ToolId = 'library' | 'text' | 'voice' | 'ai' | 'layers' | 'hand' | 'paper';

/** Ask the icon rail to open (or close) a tool panel. */
export function openTool(tool: ToolId | null): void {
  window.dispatchEvent(new CustomEvent('drawflow:open-tool', { detail: tool }));
}
export function onOpenTool(handler: (tool: ToolId | null) => void): () => void {
  const fn = (e: Event) => handler((e as CustomEvent<ToolId | null>).detail);
  window.addEventListener('drawflow:open-tool', fn);
  return () => window.removeEventListener('drawflow:open-tool', fn);
}

export interface TourStep {
  /** data-tour value of the element to point at; none = centred card */
  target?: string;
  title: string;
  body: string;
  /** keys worth pressing here */
  keys?: { keys: string; action: string }[];
  /** runs before the step shows (open a panel, select a tab…) */
  before?: () => void;
}

export interface Tour {
  id: string;
  title: string;
  blurb: string;
  steps: TourStep[];
}

const keysOf = (group: string) => SHORTCUTS.filter((s) => s.group === group).map(({ keys, action }) => ({ keys, action }));
const selectSomething = () => {
  const s = useStore.getState();
  if (!s.selectedId && s.elements.length) s.select([...s.elements].sort((a, b) => a.zIndex - b.zIndex)[0].id);
};

export const TOURS: Tour[] = [
  {
    id: 'start',
    title: 'Getting started',
    blurb: 'From an empty board to a downloaded video in seven tips.',
    steps: [
      { target: 'rail-library', title: 'Add pictures', body: 'Everything begins on the left. The Library holds 5,000 pictures, shapes and people — search for what you mean ("idea", "rocket", "teacher") and click one to put it on the board.', keys: [{ keys: 'Ctrl+K', action: 'Command palette — type anything' }], before: () => openTool('library') },
      { target: 'rail-text', title: 'Write on the board', body: 'Text is drawn letter by letter with the hand, in real handwriting fonts. Type it, pick a size and font, and it lands next to what you already have.', before: () => openTool('text') },
      { target: 'stage', title: 'Arrange things on the paper', body: 'Drag an element to move it; pull a corner to resize; drag empty paper to pan; wheel to zoom. The dashed rectangle is the camera — what the video will show from here.', keys: keysOf('Canvas').slice(0, 4), before: () => openTool(null) },
      { target: 'filmstrip', title: 'This is the order they are drawn', body: 'The strip is your storyboard: one card per element, grouped by scene. Drag cards to reorder, double-click a name to rename, right-click for everything else.' },
      { target: 'inspector', title: 'Timing and animation', body: 'Select an element and this panel shows how long it takes to draw, how long it holds, how it enters and leaves, and where the camera goes while it is drawn.', before: selectSomething },
      { target: 'preview', title: 'Watch it', body: 'Preview plays the whole thing from the start, with the hand, the camera moves and the sound. Space pauses and resumes; the timeline at the bottom shows where you are.', keys: keysOf('Playback').slice(0, 3) },
      { target: 'download', title: 'Download the video', body: 'MP4, WebM or GIF, up to 4K, rendered entirely on your machine — nothing is uploaded. Projects also save themselves in the browser as you work.', keys: [{ keys: 'Ctrl+E', action: 'Export' }, { keys: 'Ctrl+O', action: 'Projects & templates' }] },
    ],
  },
  {
    id: 'library',
    title: 'Library & pictures',
    blurb: 'Search, categories, colour, people and your own uploads.',
    steps: [
      { target: 'library-search', title: 'One search for everything', body: 'Type what you mean. Plurals, synonyms and typos are understood ("bulb" finds light bulbs, "rocet" finds rockets). Results are grouped: your uploads, illustrations, shapes and icons.', before: () => openTool('library') },
      { target: 'library-tabs', title: 'Pictures, Shapes, People, Uploads', body: 'Pictures are the big library; Shapes are basic geometry and icons; People collects poses, expressions, gestures and roles; Uploads is your own SVG, PNG and JPG artwork.' },
      { target: 'library-categories', title: 'Browse by category', body: 'Illustrations are detailed flat scenes; Cartoons are hand-drawn characters; the rest are clean line icons that the hand draws stroke by stroke. Star anything to keep it under Favourites.' },
      { target: 'library-colour', title: 'Black or colour', body: 'Most glyphs exist in a colour version too. Tick this and they are shown and added in colour; leave it off for a classic black whiteboard look.' },
      { target: 'rail-text', title: 'Your own artwork', body: 'Drop any SVG, PNG or JPG onto the board, or use the Uploads tab. SVGs are drawn as vector strokes; photos are revealed with a scribble, wipe or radial reveal — or turned into a doodle by the AI tab, offline.' },
    ],
  },
  {
    id: 'timeline',
    title: 'Timeline & timing',
    blurb: 'Retime, reorder, markers, audio lanes and zoom.',
    steps: [
      { target: 'transport', title: 'Play, pause, jump', body: 'Play from the playhead, or jump to the start and end. The time readout on the right shows position and total length.', keys: keysOf('Playback') },
      { target: 'ruler', title: 'The ruler', body: 'Click to move the playhead. Double-click (or press M) to drop a marker — a named point everything snaps to. Drag markers to move them; right-click to rename or delete.' },
      { target: 'element-track', title: 'Elements on a real time axis', body: 'Each block is an element: a light lead-in (camera travel), the drawing, then the hold. Drag the edges to retime, drag the block to reorder. Elements always play one after another — tick "start together with the previous" in the Inspector to draw two at once.' },
      { target: 'lanes', title: 'Audio lanes', body: 'Music, voice and sound effects sit on their own lanes. Drag clips to move them (they never overlap), drag the ends to trim, S splits at the playhead. Clips stay on the lane they belong to.', keys: keysOf('Audio') },
      { target: 'lane-switches', title: 'Show a lane before it has clips', body: 'Lanes appear when they have something on them; tick one here to show it early so you can drop files straight onto it.' },
      { target: 'timeline-zoom', title: 'Zoom the timeline', body: 'Ctrl+wheel over the timeline zooms around the cursor; the buttons step in and out; "fit" shows the whole project. Drag the bar above the timeline to make it taller.' },
    ],
  },
  {
    id: 'scenes',
    title: 'Scenes',
    blurb: 'Group the story into scenes with transitions.',
    steps: [
      { target: 'filmstrip', title: 'Scenes group the strip', body: 'Cards are grouped under a coloured scene header. Click the header to jump to the scene, double-click to rename it, right-click for transition, paper, duplicate, reorder or delete.' },
      { target: 'add-scene', title: 'Add a scene', body: 'A new scene starts on fresh paper to the right of everything so far — the camera glides there, and the elements you add next belong to it. Right-click a card to move it into another scene.' },
      { target: 'inspector', title: 'Transitions', body: 'Right-click a scene header and choose "Scene settings": cut, fade or wipe into the scene, its length, whether the board is cleared first, and a paper style just for that scene. Elements set to "Scene" camera frame the whole scene while they draw.' },
    ],
  },
  {
    id: 'camera',
    title: 'Camera',
    blurb: 'What the video shows, and when it moves.',
    steps: [
      { target: 'view-toggle', title: 'Edit view and Camera view', body: 'Edit view is the infinite paper. Camera view shows exactly what the video shows at the current time — use it to check framing before you export.' },
      { target: 'stage', title: 'The dashed boundary', body: 'In Edit view the dashed rectangle is the camera. Pan or zoom the canvas and the boundary moves with you; elements you add share that shot until you pan away, so you build the video one shot at a time.', before: () => openTool(null) },
      { target: 'inspector', title: 'Per-element framing', body: 'Select an element: under Camera choose Stay (keep the previous shot), This shot, Zoom to it, Scene or All. "Go to shot" brings the canvas to that framing; aim the boundary and "Set from boundary" records it.', before: selectSomething },
      { target: 'inspector', title: 'How the camera moves', body: 'Project settings (nothing selected) has the camera movement style — ease out, linear or a hard cut — and how much of the frame an element fills when zooming to it. The "Transition" seconds on an element is the travel time.' },
    ],
  },
  {
    id: 'voice',
    title: 'Voice, music & sound',
    blurb: 'Record, import, AI voices, sound effects and fit-to-narration.',
    steps: [
      { target: 'rail-voice', title: 'The Voice tool', body: 'Record a voiceover while the scribe plays, upload a recording, or type text for an AI voice. Music and sound effects are here too.', before: () => openTool('voice') },
      { target: 'record', title: 'Record while it plays', body: 'Press Record: playback starts from the playhead and your microphone is recorded onto the Voice lane. Anything already on the lane underneath is trimmed or split — like a real editor.' },
      { target: 'lanes', title: 'Edit clips on the lanes', body: 'Drag to move, drag the ends to trim, S to split, and the Inspector gives volume, fades, mute, solo, normalise and background-noise clean-up.' },
      { target: 'rail-voice', title: 'Fit the drawing to the narration', body: 'In the Voice tool, "Fit to narration" retimes every element to the phrases of your voiceover — from the pauses it hears (offline) or from a transcript (Whisper with a Groq or OpenAI key).' },
    ],
  },
  {
    id: 'ai',
    title: 'AI assistant',
    blurb: 'Create elements, whole scripts with narration, and photo doodles.',
    steps: [
      { target: 'rail-ai', title: 'Bring your own key', body: 'The AI tab works with Anthropic, OpenAI, Groq or Gemini — keys stay in this browser and go only to that provider. Groq and Gemini have free tiers. Set them under the gear.', before: () => openTool('ai') },
      { target: 'ai-tabs', title: 'Create · Script · Photo', body: 'Create: describe what should be on the board and get pictures, text and drawings to add. Script: paste a script or a topic and get whole scenes, optionally narrated and timed to the voice. Photo: turn a photo into a doodle (offline) or a cartoon (with an image model).' },
      { target: 'ai-settings', title: 'Who does what', body: 'Text and scripts use the provider with the radio button; pictures use the provider under "Pictures"; voices are picked per request. If something fails, the dialog says which setting was involved.' },
    ],
  },
  {
    id: 'hand-paper',
    title: 'Hands & paper',
    blurb: 'Choose the drawing hand and the board it draws on.',
    steps: [
      { target: 'rail-hand', title: 'The drawing hand', body: 'Marker, pen or chalk, each as a right or a left hand — or upload a photo of your own hand and click where the pen tip is. An element can have its own hand under Animation.', before: () => openTool('hand') },
      { target: 'rail-paper', title: 'The paper', body: 'Plain, grid, dots, lined, cream, chalkboard or kraft, in any colour. Scenes can override it. Chalkboard turns the default ink white.', before: () => openTool('paper') },
    ],
  },
  {
    id: 'layers',
    title: 'Layers & selection',
    blurb: 'Stacking, lock, hide, group and multi-select.',
    steps: [
      { target: 'rail-layers', title: 'The Layers panel', body: 'Every element, top-most first. Drag the grip to change the order (that is also the draw order), lock things you keep grabbing by accident, hide things you are not sure about — hidden elements take no time and stay out of the video.', before: () => openTool('layers') },
      { target: 'stage', title: 'Selecting several', body: 'Shift-click adds to the selection, Shift-drag on empty paper draws a marquee, Ctrl+A selects all. With several selected you can align, distribute, group and draw them together.', keys: keysOf('Editing').slice(0, 9), before: () => openTool(null) },
    ],
  },
  {
    id: 'export',
    title: 'Download video',
    blurb: 'Formats, sizes, single scenes and speed.',
    steps: [
      { target: 'download', title: 'Export', body: 'MP4 (H.264) and WebM (VP9) use the browser\'s own encoders, several in parallel; GIF and PNG sequences are there too. Pick 720p to 4K or any height, the whole project or one scene, and cancel any time.', keys: [{ keys: 'Ctrl+E', action: 'Export' }] },
      { target: 'preview', title: 'Check before you render', body: 'Preview and Camera view show exactly what will be rendered. Shift+F opens a full-screen preview.' },
    ],
  },
  {
    id: 'shortcuts',
    title: 'Keyboard shortcuts',
    blurb: 'Every shortcut, shown where it applies.',
    steps: [
      { target: 'transport', title: 'Playback', body: 'Space is the one to remember; the rest step through time and drop markers.', keys: keysOf('Playback') },
      { target: 'stage', title: 'Editing', body: 'Standard editing keys work on the selection; the brackets change stacking.', keys: keysOf('Editing'), before: () => openTool(null) },
      { target: 'zoom-controls', title: 'Canvas', body: 'Moving around the paper and framing things.', keys: keysOf('Canvas') },
      { target: 'lanes', title: 'Audio', body: 'With a clip selected.', keys: keysOf('Audio') },
      { target: 'help', title: 'App', body: 'Dialogs and the command palette, which can do anything in the app by name.', keys: keysOf('App') },
    ],
  },
];

export const HELP_SHORTCUTS = () => emitShortcut('shortcuts-help');
