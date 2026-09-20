// One search over every kind of asset: bundled illustrations, shapes, icons,
// people and the user's uploads. Ranks by how well the words match (name,
// then tags, then category), accepts prefixes, common synonyms, plurals and
// one-letter typos, so "bulb", "lightbulb" and "idea" all find the light bulb.

import type { LibraryEntry } from '../assets/illustrations';
import type { LibraryAsset } from '../assets/library';
import { SHAPES } from '../assets/shapes';
import type { GalleryItem } from './gallery';

export type SearchHit =
  | { kind: 'illustration'; id: string; name: string; score: number; entry: LibraryEntry }
  | { kind: 'shape'; id: string; name: string; score: number; shapeId: string }
  | { kind: 'icon'; id: string; name: string; score: number; asset: LibraryAsset }
  | { kind: 'upload'; id: string; name: string; score: number; item: GalleryItem };

/** Words people type → words that appear in asset names/tags. */
const SYNONYMS: Record<string, string[]> = {
  idea: ['light bulb', 'bulb'], bulb: ['light bulb'], lightbulb: ['light bulb'],
  money: ['coin', 'dollar', 'bank', 'banknote', 'purse', 'money bag'], cash: ['banknote', 'dollar', 'money'],
  phone: ['mobile phone', 'telephone'], smartphone: ['mobile phone'], cellphone: ['mobile phone'], mobile: ['mobile phone'],
  computer: ['laptop', 'desktop computer'], pc: ['desktop computer', 'laptop'], mac: ['laptop'],
  person: ['people', 'doodle', 'man', 'woman'], people: ['doodle', 'person'], man: ['person', 'people'], woman: ['person', 'people'], human: ['person'],
  boy: ['child', 'person'], girl: ['child', 'person'], kid: ['child'], kids: ['child'],
  happy: ['smiling face', 'grinning'], sad: ['crying face', 'frowning', 'pensive'], angry: ['angry face', 'pouting'], love: ['heart', 'kiss'], heart: ['red heart', 'heart'],
  car: ['automobile'], auto: ['automobile'], bike: ['bicycle'], plane: ['airplane'], aeroplane: ['airplane'], ship: ['boat'],
  house: ['house', 'home'], home: ['house'], office: ['office building'], building: ['office building', 'house'],
  doctor: ['health worker'], nurse: ['health worker'], medicine: ['pill', 'syringe'], pill: ['pill'],
  food: ['pizza', 'burger', 'sandwich', 'bread'], burger: ['hamburger'], coffee: ['hot beverage', 'coffee'], tea: ['teacup'], beer: ['beer mug'],
  chart: ['chart', 'bar chart', 'chart increasing'], graph: ['chart', 'chart increasing'], growth: ['chart increasing'], stats: ['bar chart'],
  clock: ['clock', 'alarm clock', 'watch'], time: ['clock', 'hourglass', 'watch'], calendar: ['calendar', 'tear-off calendar'],
  mail: ['envelope', 'e-mail'], email: ['e-mail', 'envelope'], letter: ['envelope'],
  search: ['magnifying glass'], find: ['magnifying glass'], zoom: ['magnifying glass'],
  settings: ['gear'], cog: ['gear'], tools: ['hammer and wrench', 'wrench'], fix: ['wrench', 'hammer'],
  question: ['question mark'], warning: ['warning'], alert: ['warning'], error: ['cross mark'], ok: ['check mark', 'thumbs up'], yes: ['check mark'], no: ['cross mark'], done: ['check mark'],
  star: ['star', 'glowing star'], win: ['trophy', 'medal'], winner: ['trophy'], prize: ['trophy'], award: ['trophy', 'medal'],
  school: ['school', 'graduation cap', 'books'], study: ['books', 'student'], learn: ['books', 'student'], teacher: ['teacher'], student: ['student', 'graduation cap'],
  music: ['musical note', 'headphone'], song: ['musical note'], speaker: ['loudspeaker', 'megaphone'], announce: ['megaphone'],
  talk: ['speech balloon'], chat: ['speech balloon'], speech: ['speech balloon'], bubble: ['speech balloon', 'thought balloon'], think: ['thought balloon', 'thinking face'],
  arrow: ['arrow', 'right arrow', 'left arrow', 'up arrow', 'down arrow'], right: ['right arrow'], left: ['left arrow'], up: ['up arrow'], down: ['down arrow'],
  world: ['globe'], earth: ['globe'], map: ['world map'], location: ['round pushpin'], pin: ['pushpin'],
  shop: ['shopping cart', 'shopping bags', 'convenience store'], buy: ['shopping cart'], cart: ['shopping cart'],
  team: ['handshake', 'people'], meeting: ['handshake', 'office'], deal: ['handshake'], agree: ['handshake'],
  fast: ['rocket', 'high voltage'], rocket: ['rocket'], launch: ['rocket'], power: ['high voltage'], energy: ['high voltage', 'battery'],
  plant: ['seedling', 'potted plant'], tree: ['deciduous tree', 'evergreen tree'], flower: ['blossom', 'sunflower', 'tulip'], nature: ['leaf', 'tree'],
  dog: ['dog'], cat: ['cat'], animal: ['dog', 'cat'], bird: ['bird'],
  gift: ['wrapped gift'], present: ['wrapped gift'], party: ['party popper', 'balloon'], celebrate: ['party popper'],
  lock: ['locked'], secure: ['locked', 'shield'], security: ['shield', 'locked'], key: ['key'],
  cloud: ['cloud'], weather: ['sun', 'cloud', 'umbrella'], rain: ['cloud with rain', 'umbrella'], sun: ['sun'],
  sport: ['soccer ball', 'basketball', 'running'], football: ['soccer ball'], run: ['running'], running: ['running', 'runner'],
  video: ['clapper board', 'movie camera', 'television'], film: ['clapper board'], camera: ['camera'], photo: ['camera'],
  document: ['page facing up', 'memo'], paper: ['page facing up'], note: ['memo'], list: ['clipboard'], report: ['clipboard'],
  box: ['package'], parcel: ['package'], delivery: ['package', 'delivery truck'],
  read: ['reading', 'open book'], sit: ['sitting'], relax: ['chilling', 'meditating'], yoga: ['meditating'], dance: ['dancing'], sleep: ['sleeping'],
  rectangle: ['rectangle'], square: ['rectangle'], circle: ['ellipse', 'circle'], oval: ['ellipse'], round: ['ellipse', 'rounded'],
};

const stem = (w: string) => w.replace(/(ies)$/, 'y').replace(/(sses|shes|ches|xes)$/, (m) => m.slice(0, -2)).replace(/s$/, '');

function tokens(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Cheap Levenshtein ≤ 1 check (typos), only for longer words. */
function nearlyEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Score one query word against name / tag / category tokens. */
function wordScore(qw: string, name: string[], tags: string[], cat: string[]): number {
  const q = stem(qw);
  const best = (list: string[], full: number, prefix: number, fuzzy: number) => {
    let s = 0;
    for (const t of list) {
      const ts = stem(t);
      if (ts === q) return full;
      if (ts.startsWith(q) && q.length >= 2) s = Math.max(s, prefix);
      else if (nearlyEqual(ts, q)) s = Math.max(s, fuzzy);
    }
    return s;
  };
  return Math.max(best(name, 10, 6, 4), best(tags, 5, 3, 2), best(cat, 2, 1, 0));
}

type HitBase = SearchHit extends infer H ? (H extends { score: number } ? Omit<H, 'score'> : never) : never;
interface Indexed { hit: HitBase; name: string[]; tags: string[]; cat: string[]; phrase: string }

function expand(query: string): string[][][] {
  // every query word → alternatives; a multi-word synonym must match as a whole
  return tokens(query).map((w) => [[w], ...(SYNONYMS[w] ?? []).map(tokens)]);
}

export interface SearchSources {
  illustrations: LibraryEntry[];
  icons: LibraryAsset[];
  uploads: GalleryItem[];
}

export function buildIndex(src: SearchSources): Indexed[] {
  const out: Indexed[] = [];
  for (const e of src.illustrations) {
    out.push({ hit: { kind: 'illustration', id: e.id, name: e.name, entry: e }, name: tokens(e.name), tags: e.tags.flatMap(tokens), cat: tokens(e.category), phrase: `${e.name} ${e.tags.join(' ')}`.toLowerCase() });
  }
  for (const s of SHAPES) {
    out.push({ hit: { kind: 'shape', id: `shape:${s.id}`, name: s.label, shapeId: s.id }, name: tokens(s.label), tags: ['shape', 'basic'], cat: ['shapes'], phrase: `${s.label} shape`.toLowerCase() });
  }
  for (const a of src.icons) {
    out.push({ hit: { kind: 'icon', id: `icon:${a.id}`, name: a.name, asset: a }, name: tokens(a.name), tags: ['icon', 'outline', ...tokens(a.group)], cat: ['icons', ...tokens(a.group)], phrase: `${a.name} ${a.group} icon`.toLowerCase() });
  }
  for (const u of src.uploads) {
    out.push({ hit: { kind: 'upload', id: u.id, name: u.name, item: u }, name: tokens(u.name), tags: (u.tags ?? []).flatMap(tokens), cat: ['uploads', 'mine'], phrase: `${u.name} ${(u.tags ?? []).join(' ')}`.toLowerCase() });
  }
  return out;
}

/** Ranked hits for a query; every query word must match something (a synonym counts). */
export function searchAll(index: Indexed[], query: string, limit = 120): SearchHit[] {
  const groups = expand(query);
  if (groups.length === 0) return [];
  const q = query.trim().toLowerCase();
  const scored: SearchHit[] = [];
  for (const it of index) {
    let total = 0;
    let ok = true;
    for (const alternatives of groups) {
      let best = 0;
      alternatives.forEach((alt, k) => {
        // every word of the alternative has to match; synonyms count a little less
        const score = Math.min(...alt.map((w) => wordScore(w, it.name, it.tags, it.cat)));
        best = Math.max(best, score * (k === 0 ? 1 : 0.85));
      });
      if (best === 0) { ok = false; break; }
      total += best;
    }
    if (!ok) continue;
    if (it.phrase.includes(q)) total += 6;                 // the whole phrase appears
    if (it.name.join(' ') === q) total += 10;              // exact name
    total += it.hit.kind === 'upload' ? 1.5 : 0;           // the user's own pictures first on ties
    scored.push({ ...it.hit, score: total } as SearchHit);
  }
  return scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}
