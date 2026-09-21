// One builder per pack: reads the downloaded source, cleans each SVG and
// returns index entries { id, name, category, tags, src }.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composePeeps } from './peeps.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const words = (s) => String(s ?? '').toLowerCase().replace(/[_\-./]+/g, ' ').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
const title = (s) => { const w = words(s).join(' '); return w.charAt(0).toUpperCase() + w.slice(1); };
const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));

async function writeSvg(normalize, file, outFile, opts) {
  const raw = fs.readFileSync(file, 'utf8');
  const clean = await normalize(raw, opts);
  if (!clean) return false;
  fs.writeFileSync(outFile, clean);
  return true;
}

// --- Tabler ---------------------------------------------------------------
const TABLER_CATEGORY = {
  Design: 'Objects', System: 'Objects', Photography: 'Technology', Media: 'Technology', Devices: 'Technology',
  Computers: 'Technology', Database: 'Technology', Development: 'Technology', Electrical: 'Technology', Communication: 'Technology',
  Map: 'Travel & Places', Buildings: 'Travel & Places', Vehicles: 'Travel & Places',
  Document: 'Business & Finance', 'E-commerce': 'Business & Finance', Currencies: 'Business & Finance', Charts: 'Business & Finance', Badges: 'Business & Finance',
  Math: 'Education & Science', Food: 'Food & Drink', Health: 'Health & Safety', Sport: 'Activities', Games: 'Activities',
  Weather: 'Animals & Nature', Nature: 'Animals & Nature', Animals: 'Animals & Nature',
  Shapes: 'Symbols & Arrows', Symbols: 'Symbols & Arrows', Zodiac: 'Symbols & Arrows', Arrows: 'Symbols & Arrows', Gender: 'Symbols & Arrows',
  Mood: 'Faces', Gestures: 'People',
};
const TABLER_SKIP_CATEGORY = new Set(['Brand', 'Letters', 'Numbers', 'Text', 'Extensions', 'Version control', 'Laundry', 'Logic']);
// interface chrome that means nothing on a whiteboard
const TABLER_SKIP_NAME = /^(chevron|caret|layout|columns|rows|table|grid-|square-rounded|square-(chevron|arrow|check|x|minus|plus|dot|half|f\d|number|letter|key)|circle-(chevron|arrow|check|x|minus|plus|dot|dashed|half|number|letter|key|square|rectangle)|hexagon-(number|letter|minus|plus|\d)|pentagon-|octagon-|badge-|number-|letter-|player-|playlist|volume-|md-|h-\d|blockquote|italic|bold|underline|strikethrough|subscript|superscript|clear-formatting|line-height|letter-spacing|text-|typography|cursor|forms|paragraph|heading|spacing|separator|section|adjustments|toggle|switch-|select|checkbox|radio|input|indent|outdent|align-|baseline|box-align|box-margin|box-padding|box-model|component|container|dimensions|drag|resize|fold|unfold|maximize|minimize|window|app-window|browser|zoom|focus|crop|frame|ruler|aspect|artboard|layers|stack|brackets|code|terminal|command|keyboard|braces|source|git|border|menu|dots|circle-dot|circles-|squares-|reorder|arrow-autofit|arrows-diagonal|arrows-(maximize|minimize|double|horizontal|vertical|move|random|shuffle|sort|split|join|cross|transfer)|arrow-(bar|bounce|badge|elbow|fork|guide|iteration|merge|ramp|roundabout|rotary|sharp|wave|zig|loop|move|narrow|big|back|forward|capsule|left-|right-|up-|down-)|sort-|filter|list|blur|brightness|contrast|color|palette|pointer|hand-(click|finger|move|grab)|device-(analytics|desktop-analytics|mobile-(check|x|dollar|rotated|share|search|question|pause|off|minus|plus|exclamation|heart|star|up|vibration|down|bolt|cancel|code|cog|filled|message|pin))|(.+)-(off|filled|2|3|4|5|6)$)/;

async function tabler({ srcDir, outDir, normalize }) {
  const meta = JSON.parse(fs.readFileSync(path.join(srcDir, 'package', 'icons.json'), 'utf8'));
  const out = [];
  for (const [name, info] of Object.entries(meta)) {
    if (TABLER_SKIP_CATEGORY.has(info.category) || TABLER_SKIP_NAME.test(name)) continue;
    if (!info.styles?.outline) continue;
    const file = path.join(srcDir, 'package', 'icons', 'outline', `${name}.svg`);
    if (!fs.existsSync(file)) continue;
    // drop the invisible 24×24 hit rectangle so the hand doesn't "draw" it
    const raw = fs.readFileSync(file, 'utf8').replace(/<path stroke="none" d="M0 0h24v24H0z" fill="none"\s*\/>/, '');
    const clean = await normalize(raw, { trim: false });
    if (!clean) continue;
    fs.writeFileSync(path.join(outDir, `${name}.svg`), clean);
    out.push({
      id: `tb-${name}`, name: title(name), category: TABLER_CATEGORY[info.category] ?? 'Objects',
      tags: uniq([...(info.tags ?? []).flatMap(words), ...words(info.category), 'icon', 'line']),
      src: `/library/tabler/${name}.svg`,
    });
  }
  return out;
}

// --- Health Icons ---------------------------------------------------------
const HEALTH_CATEGORY = {
  people: 'People', places: 'Travel & Places', vehicles: 'Travel & Places', emotions: 'Faces', nutrition: 'Food & Drink',
  exercise: 'Activities', objects: 'Objects', graphs: 'Business & Finance', symbols: 'Symbols & Arrows',
};
const HEALTH_SKIP = new Set(['typography', 'shapes']);

async function healthicons({ srcDir, outDir, normalize }) {
  const meta = JSON.parse(fs.readFileSync(path.join(srcDir, 'package', 'public', 'icons', 'meta-data.json'), 'utf8'));
  const out = [];
  for (const m of meta) {
    if (HEALTH_SKIP.has(m.category)) continue;
    const file = path.join(srcDir, 'package', 'public', 'icons', 'svg', 'outline', `${m.path}.svg`);
    if (!fs.existsSync(file)) continue;
    const name = `${m.category}-${m.id}`;
    if (!(await writeSvg(normalize, file, path.join(outDir, `${name}.svg`), { trim: false }))) continue;
    out.push({
      id: `hi-${name}`, name: m.title || title(m.id), category: HEALTH_CATEGORY[m.category] ?? 'Health & Safety',
      tags: uniq([...(m.tags ?? []).filter((t) => !t.includes(':')).flatMap(words), ...words(m.category), 'health', 'medical', 'icon']),
      src: `/library/healthicons/${name}.svg`,
    });
  }
  return out;
}

// --- Flowbite -------------------------------------------------------------
async function flowbite({ srcDir, outDir, normalize, listFiles }) {
  const files = listFiles(srcDir, (p) => /\/src\/[^/]+\/light\/[^/]+\.svg$/.test(p));
  const out = [];
  for (const file of files) {
    const base = path.basename(file, '.svg').replace(/-light$/, '');
    if (!(await writeSvg(normalize, file, path.join(outDir, `${base}.svg`), { trim: true }))) continue;
    out.push({
      id: `fb-${base}`, name: title(base), category: 'Illustrations',
      tags: uniq([...words(base), 'illustration', 'flat', 'scene', 'modern']),
      src: `/library/flowbite/${base}.svg`,
    });
  }
  return out;
}

// --- illlustrations -------------------------------------------------------
async function illlustrations({ srcDir, outDir, normalize, listFiles }) {
  const files = listFiles(srcDir, (p) => /\/content\/illlustrations\/[^/]+\/[^/]+\.svg$/.test(p));
  const out = [];
  const seen = new Set();
  for (const file of files) {
    const base = path.basename(file, '.svg').replace(/^(day-?\d+|\d+)[-_]?/i, '');
    if (!base || seen.has(base)) continue;
    seen.add(base);
    if (!(await writeSvg(normalize, file, path.join(outDir, `${base}.svg`), { stripBackground: true, stripBottomBand: 0.09, trim: true }))) continue;
    out.push({
      id: `il-${base}`, name: title(base), category: 'Illustrations',
      tags: uniq([...words(base), 'illustration', 'colour', 'sticker']),
      src: `/library/illlustrations/${base}.svg`,
    });
  }
  return out;
}

// --- Mega Doodles ---------------------------------------------------------
async function megadoodles({ srcDir, outDir, normalize, listFiles }) {
  const names = JSON.parse(fs.readFileSync(path.join(HERE, 'names', 'megadoodles.json'), 'utf8'));
  const files = listFiles(srcDir, (p) => /\/doodles\/svg\/doodle-\d+\.svg$/.test(p));
  const out = [];
  for (const file of files) {
    const base = path.basename(file, '.svg');
    const entry = names[base];
    if (!entry) continue;
    const [name, tags] = entry;
    if (!(await writeSvg(normalize, file, path.join(outDir, `${base}.svg`), { trim: true }))) continue;
    out.push({
      id: `md-${base}`, name, category: 'Cartoons',
      tags: uniq([...tags.flatMap(words), ...words(name), 'doodle', 'cartoon', 'cute', 'hand drawn']),
      src: `/library/megadoodles/${base}.svg`,
    });
  }
  return out;
}

// --- Open Peeps -----------------------------------------------------------
async function openpeeps(ctx) {
  return composePeeps(ctx);
}

// --- OpenMoji colour twins ------------------------------------------------
// Not new entries: adds `color` (a coloured version) to the existing black glyphs.
async function openmojiColor({ srcDir, outDir, normalize, existing }) {
  const dir = path.join(srcDir, 'package', 'color', 'svg');
  let n = 0;
  for (const e of existing) {
    if (!e.id.startsWith('om-')) continue;
    const hex = e.src.split('/').pop();
    const file = path.join(dir, hex);
    if (!fs.existsSync(file)) { delete e.color; continue; }
    if (await writeSvg(normalize, file, path.join(outDir, hex), { trim: false })) { e.color = `/library/openmoji-color/${hex}`; n++; } else delete e.color;
  }
  process.stdout.write(`  ${n} colour twins\n`);
  return [];
}

export const PACKS = [
  { id: 'tabler', dir: 'tabler', source: 'tabler', build: tabler },
  { id: 'healthicons', dir: 'healthicons', source: 'healthicons', build: healthicons },
  { id: 'flowbite', dir: 'flowbite', source: 'flowbite', build: flowbite },
  { id: 'illlustrations', dir: 'illlustrations', source: 'illlustrations', build: illlustrations },
  { id: 'megadoodles', dir: 'megadoodles', source: 'megadoodles', build: megadoodles },
  { id: 'openpeeps', dir: 'openpeeps', source: 'openpeeps', build: openpeeps },
  { id: 'openmoji-color', dir: 'openmoji-color', source: 'openmoji', build: openmojiColor },
];
