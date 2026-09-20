// Built-in starter templates. Each is a small script of text and library
// pictures laid out in scenes; the pictures are fetched from the bundled
// library when the template is opened (so the app bundle stays small).

import type { DrawElement, Project, Scene } from '../types';
import { loadLibraryIndex, loadLibrarySvg, type LibraryEntry } from './illustrations';
import { normalizeSvg } from '../lib/svgImport';
import { textToPaths } from '../lib/textToPaths';
import { measurePaths } from '../lib/drawing';
import { DEFAULT_PROJECT } from '../store/useStore';

export interface TemplateDef {
  id: string;
  name: string;
  description: string;
  /** rough length, for the card */
  seconds: number;
  paper?: Project['paper'];
  background?: string;
  hand?: string;
  scenes: {
    name: string;
    transition?: Scene['transition'];
    clearBefore?: boolean;
    items: TemplateItem[];
  }[];
}

type TemplateItem =
  | { text: string; x: number; y: number; size?: number; font?: string; bold?: boolean; align?: 'left' | 'center' | 'right'; draw?: number; pause?: number; style?: DrawElement['style']; emphasis?: DrawElement['emphasis'] }
  | { pic: string; x: number; y: number; size?: number; draw?: number; pause?: number; style?: DrawElement['style'] };

const W = 1920, H = 1080;

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'explainer', name: 'Explainer', description: 'Problem → idea → how it works → result. The classic whiteboard explainer arc.', seconds: 40,
    scenes: [
      { name: 'The problem', items: [
        { text: 'Every team has the same problem', x: W / 2, y: 260, size: 120, align: 'center', bold: true },
        { pic: 'om-1FAE9', x: 700, y: 620, size: 340 },
        { text: 'too many tools,\ntoo little time', x: 1180, y: 560, size: 90 },
      ] },
      { name: 'The idea', transition: 'fade', clearBefore: true, items: [
        { pic: 'om-1F4A1', x: W / 2, y: 380, size: 360, emphasis: { kind: 'pulse', duration: 0.7, delay: 0.1, repeat: 2 } },
        { text: 'What if it all lived in one place?', x: W / 2, y: 760, size: 100, align: 'center' },
      ] },
      { name: 'How it works', transition: 'wipe', clearBefore: true, items: [
        { text: '1. Connect', x: 320, y: 240, size: 90, bold: true },
        { pic: 'om-1F517', x: 320, y: 520, size: 260 },
        { text: '2. Organise', x: 960, y: 240, size: 90, bold: true },
        { pic: 'om-1F4C2', x: 960, y: 520, size: 260 },
        { text: '3. Share', x: 1600, y: 240, size: 90, bold: true },
        { pic: 'om-1F4E3', x: 1600, y: 520, size: 260 },
      ] },
      { name: 'The result', transition: 'fade', clearBefore: true, items: [
        { pic: 'om-1F4C8', x: 640, y: 540, size: 420 },
        { text: 'More done.\nLess stress.', x: 1250, y: 460, size: 120, bold: true },
        { text: 'Try it today', x: 1250, y: 760, size: 80, style: 'pop' },
      ] },
    ],
  },
  {
    id: 'youtube-intro', name: 'YouTube intro', description: 'A 10-second channel opener: name, tagline, subscribe.', seconds: 12,
    scenes: [
      { name: 'Intro', items: [
        { pic: 'om-1F3AC', x: 560, y: 520, size: 420, style: 'pop', draw: 0.8 },
        { text: 'YOUR CHANNEL', x: 1250, y: 440, size: 130, bold: true, font: 'inter', draw: 1.6 },
        { text: 'new videos every week', x: 1250, y: 620, size: 70, font: 'inter', draw: 1.2 },
        { pic: 'om-1F514', x: 1250, y: 860, size: 160, style: 'bounce', draw: 0.9, emphasis: { kind: 'shake', duration: 0.6, delay: 0, repeat: 2 } },
      ] },
    ],
  },
  {
    id: 'educational', name: 'Educational lesson', description: 'Title, three key points with pictures, and a recap.', seconds: 45,
    paper: 'lined',
    scenes: [
      { name: 'Title', items: [
        { text: "Today's lesson", x: W / 2, y: 300, size: 90, align: 'center' },
        { text: 'How plants make food', x: W / 2, y: 470, size: 140, align: 'center', bold: true },
        { pic: 'om-1F331', x: W / 2, y: 800, size: 300 },
      ] },
      { name: 'Key points', transition: 'wipe', clearBefore: true, items: [
        { pic: 'om-1F33B', x: 360, y: 360, size: 260 },
        { text: 'Sunlight', x: 360, y: 620, size: 80, align: 'center' },
        { pic: 'om-1F343', x: 960, y: 360, size: 260 },
        { text: 'Water', x: 960, y: 620, size: 80, align: 'center' },
        { pic: 'om-1F636-200D-1F32B-FE0F', x: 1560, y: 360, size: 260 },
        { text: 'Carbon dioxide', x: 1560, y: 620, size: 80, align: 'center' },
        { text: '→ sugar + oxygen', x: W / 2, y: 880, size: 110, align: 'center', bold: true, style: 'pop' },
      ] },
      { name: 'Recap', transition: 'fade', clearBefore: true, items: [
        { text: 'Remember:', x: 300, y: 260, size: 100, bold: true },
        { text: '• plants use light, water and CO₂\n• they make sugar to grow\n• and release the oxygen we breathe', x: 300, y: 450, size: 80 },
        { pic: 'om-1F33F', x: 1560, y: 600, size: 360 },
      ] },
    ],
  },
  {
    id: 'product-demo', name: 'Product demo', description: 'Introduce a product, show three features, end with a call to action.', seconds: 40,
    scenes: [
      { name: 'Meet the product', items: [
        { pic: 'om-1F4F1', x: 640, y: 540, size: 520 },
        { text: 'Meet Pocket', x: 1300, y: 420, size: 140, bold: true },
        { text: 'your money, sorted', x: 1300, y: 600, size: 80 },
      ] },
      { name: 'Features', transition: 'wipe', clearBefore: true, items: [
        { pic: 'om-1F4B3', x: 420, y: 400, size: 240 },
        { text: 'See every card in one list', x: 720, y: 400, size: 70 },
        { pic: 'om-1F4CA', x: 420, y: 660, size: 240 },
        { text: 'Spending charts that make sense', x: 720, y: 660, size: 70 },
        { pic: 'om-1F514', x: 420, y: 920, size: 240 },
        { text: 'Alerts before you overspend', x: 720, y: 920, size: 70 },
      ] },
      { name: 'Call to action', transition: 'fade', clearBefore: true, items: [
        { text: 'Get Pocket free', x: W / 2, y: 420, size: 150, align: 'center', bold: true, style: 'pop' },
        { pic: 'om-2B07', x: W / 2, y: 700, size: 220, emphasis: { kind: 'bounce', duration: 0.8, delay: 0, repeat: 3 } },
        { text: 'link in the description', x: W / 2, y: 940, size: 70, align: 'center' },
      ] },
    ],
  },
  {
    id: 'business', name: 'Business presentation', description: 'Agenda, numbers, a plan and next steps — clean sans-serif text.', seconds: 45,
    scenes: [
      { name: 'Agenda', items: [
        { text: 'Q3 review', x: 300, y: 240, size: 140, bold: true, font: 'inter' },
        { text: '1. Where we are\n2. What we learned\n3. The plan for Q4', x: 300, y: 460, size: 80, font: 'inter' },
        { pic: 'om-1F4CB', x: 1500, y: 560, size: 380 },
      ] },
      { name: 'Numbers', transition: 'wipe', clearBefore: true, items: [
        { pic: 'om-1F4C8', x: 560, y: 520, size: 520 },
        { text: '+32%', x: 1300, y: 420, size: 200, bold: true, font: 'inter', style: 'scale' },
        { text: 'revenue vs last quarter', x: 1300, y: 620, size: 70, font: 'inter' },
      ] },
      { name: 'Plan', transition: 'fade', clearBefore: true, items: [
        { text: 'The plan', x: W / 2, y: 220, size: 120, bold: true, font: 'inter', align: 'center' },
        { pic: 'om-1F3AF', x: 480, y: 600, size: 300 },
        { text: 'Focus', x: 480, y: 860, size: 70, font: 'inter', align: 'center' },
        { pic: 'om-1F91D', x: 960, y: 600, size: 300 },
        { text: 'Partner', x: 960, y: 860, size: 70, font: 'inter', align: 'center' },
        { pic: 'om-1F680', x: 1440, y: 600, size: 300 },
        { text: 'Launch', x: 1440, y: 860, size: 70, font: 'inter', align: 'center' },
      ] },
    ],
  },
  {
    id: 'social', name: 'Social media (vertical)', description: 'A 9:16 clip with a hook, a punchline and a follow prompt.', seconds: 15,
    scenes: [
      { name: 'Hook', items: [
        { text: 'Stop scrolling.', x: 540, y: 420, size: 150, align: 'center', bold: true, draw: 1.2 },
        { pic: 'om-270B', x: 540, y: 820, size: 380, style: 'pop' },
      ] },
      { name: 'Punchline', transition: 'fade', clearBefore: true, items: [
        { text: 'One habit\nchanged\neverything', x: 540, y: 520, size: 140, align: 'center', bold: true },
        { pic: 'om-2705', x: 540, y: 1300, size: 300, style: 'bounce' },
      ] },
      { name: 'Follow', transition: 'wipe', clearBefore: true, items: [
        { text: 'Follow for part 2', x: 540, y: 900, size: 110, align: 'center', bold: true, style: 'pop', emphasis: { kind: 'pulse', duration: 0.7, delay: 0.2, repeat: 3 } },
      ] },
    ],
  },
  {
    id: 'training', name: 'Training video', description: 'Step-by-step instructions with numbered steps and a safety note.', seconds: 50,
    paper: 'grid',
    scenes: [
      { name: 'Title', items: [
        { text: 'How to file a report', x: W / 2, y: 400, size: 140, align: 'center', bold: true },
        { text: '4 steps · 5 minutes', x: W / 2, y: 600, size: 80, align: 'center' },
      ] },
      { name: 'Steps', transition: 'wipe', clearBefore: true, items: [
        { text: 'Step 1 — Open the portal', x: 260, y: 240, size: 80, bold: true },
        { pic: 'om-1F4BB', x: 1560, y: 300, size: 220 },
        { text: 'Step 2 — Pick "New report"', x: 260, y: 440, size: 80, bold: true },
        { pic: 'om-1F4DD', x: 1560, y: 500, size: 220 },
        { text: 'Step 3 — Fill in the details', x: 260, y: 640, size: 80, bold: true },
        { pic: 'om-270F', x: 1560, y: 700, size: 220 },
        { text: 'Step 4 — Submit', x: 260, y: 840, size: 80, bold: true },
        { pic: 'om-2705', x: 1560, y: 900, size: 220, style: 'pop' },
      ] },
      { name: 'Remember', transition: 'fade', clearBefore: true, items: [
        { pic: 'om-26A0', x: 560, y: 540, size: 380 },
        { text: 'Never share your login.\nAsk your manager if unsure.', x: 1250, y: 480, size: 90 },
      ] },
    ],
  },
  {
    id: 'marketing', name: 'Marketing promo', description: 'Offer, benefits, urgency: a punchy 20-second promo.', seconds: 22,
    paper: 'cream',
    scenes: [
      { name: 'Offer', items: [
        { pic: 'om-1F381', x: 600, y: 520, size: 460, style: 'bounce' },
        { text: '30% off', x: 1300, y: 420, size: 200, bold: true, style: 'pop' },
        { text: 'this week only', x: 1300, y: 640, size: 90 },
      ] },
      { name: 'Why', transition: 'wipe', clearBefore: true, items: [
        { pic: 'om-1F69A', x: 480, y: 500, size: 300 },
        { text: 'Free delivery', x: 480, y: 780, size: 70, align: 'center' },
        { pic: 'om-1F970', x: 960, y: 500, size: 300 },
        { text: 'Loved by 10,000+', x: 960, y: 780, size: 70, align: 'center' },
        { pic: 'om-1F504', x: 1440, y: 500, size: 300 },
        { text: '30-day returns', x: 1440, y: 780, size: 70, align: 'center' },
      ] },
      { name: 'Go', transition: 'fade', clearBefore: true, items: [
        { text: 'Shop now', x: W / 2, y: 500, size: 180, align: 'center', bold: true, emphasis: { kind: 'pulse', duration: 0.7, delay: 0.1, repeat: 3 } },
        { pic: 'om-23F3', x: W / 2, y: 820, size: 220 },
      ] },
    ],
  },
];

/** Resolve a template into project + elements (fetches the pictures it uses). */
export async function buildTemplate(t: TemplateDef): Promise<{ project: Project; elements: DrawElement[] }> {
  const index = await loadLibraryIndex().catch(() => [] as LibraryEntry[]);
  const byId = new Map(index.map((e) => [e.id, e]));
  const vertical = t.id === 'social';
  const width = vertical ? 1080 : W, height = vertical ? 1920 : H;
  const scenes: Scene[] = t.scenes.map((sc) => ({
    id: crypto.randomUUID(), name: sc.name, transition: sc.transition ?? 'cut', transitionDuration: 0.6, clearBefore: sc.clearBefore,
  }));
  const project: Project = {
    ...DEFAULT_PROJECT, name: t.name, width, height, paper: t.paper ?? 'plain',
    background: t.background ?? (t.paper === 'cream' ? '#fbf5e6' : t.paper === 'lined' ? '#fdfdfb' : '#ffffff'),
    scenes, markers: [],
  };
  const ink = t.paper === 'cream' ? '#2b2418' : t.paper === 'lined' ? '#1f2a44' : '#1a1a1a';
  const elements: DrawElement[] = [];
  let z = 0;
  // every scene gets its own stretch of paper, side by side, so the edit view reads like slides
  const sceneGap = width * 1.2;
  for (let si = 0; si < t.scenes.length; si++) {
    const ox = si * sceneGap;
    for (const item of t.scenes[si].items) {
      const base = {
        id: crypto.randomUUID(), label: '', rotation: 0, startTime: 0, transitionIn: 0.5,
        pauseAfter: item.pause ?? 0.6, slideFrom: 'left' as const, zIndex: z++, camera: 'scene' as const, cameraZoom: 1,
        sceneId: scenes[si].id, style: item.style ?? 'draw', fillAfterDraw: false, fillColor: 'none',
        strokeColor: ink, strokeWidth: 4, scale: 1,
      };
      if ('text' in item) {
        const size = item.size ?? 100;
        const paths = await textToPaths(item.text, item.font ?? 'caveat', size, { bold: item.bold, align: item.align });
        const b = measurePaths(paths).bbox;
        // anchor: centre for centred text, left edge otherwise
        const x = ox + (item.align === 'center' ? item.x - (b.x + b.width / 2) : item.x - b.x);
        const y = item.y - (b.y + b.height / 2);
        elements.push({
          ...base, kind: 'text', paths, label: item.text.split('\n')[0].slice(0, 24), text: item.text, fontFamily: item.font ?? 'caveat', fontSize: size,
          fontWeight: item.bold ? 'bold' : 'normal', align: item.align, x, y, fillColor: ink, fillAfterDraw: true,
          strokeWidth: 2 + (item.bold ? size * 0.028 : 0),
          drawDuration: item.draw ?? Math.min(6, Math.max(1.2, item.text.length * 0.09)),
          emphasis: item.emphasis ?? null,
        });
      } else {
        const entry = byId.get(item.pic);
        if (!entry) continue;
        try {
          const art = normalizeSvg(await loadLibrarySvg(entry.src));
          const size = item.size ?? 300;
          const scale = size / Math.max(art.width, art.height, 1);
          const b = measurePaths(art.paths).bbox;
          elements.push({
            ...base, kind: 'svg', paths: art.paths, label: entry.name, scale,
            x: ox + item.x - (b.x + b.width / 2) * scale, y: item.y - (b.y + b.height / 2) * scale,
            fillRule: art.evenOdd ? 'evenodd' : undefined,
            ...(art.monochrome
              ? { strokeWidth: Math.min(10, Math.max(3, (Math.max(art.width, art.height) / 40) * scale)) }
              : { pathFills: art.fills, pathStrokes: art.strokes, fillColor: ink, fillAfterDraw: true, strokeWidth: Math.min(2.5, Math.max(0.8, (Math.max(art.width, art.height) / 400) * scale)) }),
            drawDuration: item.draw ?? Math.min(4, Math.max(1.5, art.paths.length * 0.2)),
          });
        } catch { /* skip a picture that fails to load */ }
      }
    }
  }
  return { project, elements };
}
