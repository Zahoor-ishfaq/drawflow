// Bundled outline-illustration library (spec §11). Stroke-based, path-only,
// 24×24 viewBox. Path data adapted from / in the style of Lucide (ISC).

export interface LibraryAsset {
  id: string;
  name: string;
  group: 'Business' | 'Education' | 'Tech' | 'General';
  paths: string[];
}

const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;

export const LIBRARY: LibraryAsset[] = [
  // --- Business ---
  { id: 'bar-chart', name: 'Chart', group: 'Business',
    paths: ['M3 3v18h18', 'M7 16v-5', 'M12 16V8', 'M17 16v-3'] },
  { id: 'trending-up', name: 'Growth', group: 'Business',
    paths: ['M3 17l6-6 4 4 8-8', 'M15 7h6v6'] },
  { id: 'target', name: 'Target', group: 'Business',
    paths: [circle(12, 12, 9), circle(12, 12, 5), circle(12, 12, 1.2)] },
  { id: 'briefcase', name: 'Briefcase', group: 'Business',
    paths: ['M4 7h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z',
      'M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M2 13h20'] },
  { id: 'lightbulb', name: 'Lightbulb', group: 'Business',
    paths: ['M12 2a6.5 6.5 0 0 0-4.3 11.4c.7.6 1.3 1.4 1.3 2.6h6c0-1.2.6-2 1.3-2.6A6.5 6.5 0 0 0 12 2Z',
      'M9 19h6', 'M10 22h4'] },
  { id: 'coins', name: 'Coins', group: 'Business',
    paths: [circle(8.5, 8.5, 6), 'M15 9.4a6 6 0 1 1-5.6 5.6', 'M6.5 8.5h4', 'M8.5 6.5v4'] },

  // --- Education ---
  { id: 'book', name: 'Book', group: 'Education',
    paths: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20',
      'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z'] },
  { id: 'grad-cap', name: 'Graduation cap', group: 'Education',
    paths: ['M22 10L12 5 2 10l10 5 10-5Z', 'M6 12.5V17c3 3 9 3 12 0v-4.5', 'M22 10v5'] },
  { id: 'pencil', name: 'Pencil', group: 'Education',
    paths: ['M17 3l4 4L8 20H4v-4L17 3Z', 'M14 6l4 4'] },
  { id: 'atom', name: 'Atom', group: 'Education',
    paths: [circle(12, 12, 1.2),
      'M4.9 19.1A10 4.5 -45 1 1 19.1 4.9A10 4.5 -45 1 1 4.9 19.1Z',
      'M4.9 4.9A10 4.5 45 1 1 19.1 19.1A10 4.5 45 1 1 4.9 4.9Z'] },
  { id: 'globe', name: 'Globe', group: 'Education',
    paths: [circle(12, 12, 9), 'M3 12h18',
      'M12 3a15 15 0 0 1 4 9 15 15 0 0 1-4 9 15 15 0 0 1-4-9 15 15 0 0 1 4-9Z'] },
  { id: 'ruler', name: 'Ruler', group: 'Education',
    paths: ['M3 17L17 3l4 4L7 21l-4-4Z', 'M8.5 11.5l2 2', 'M11.5 8.5l2 2', 'M14.5 5.5l2 2'] },

  // --- Tech ---
  { id: 'laptop', name: 'Laptop', group: 'Tech',
    paths: ['M4 5h16v11H4Z', 'M2 19h20'] },
  { id: 'gear', name: 'Gear', group: 'Tech',
    paths: [circle(12, 12, 3),
      'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z'] },
  { id: 'cloud', name: 'Cloud', group: 'Tech',
    paths: ['M17.5 19H7a5 5 0 1 1 .9-9.9A7 7 0 0 1 21 12.5 4.5 4.5 0 0 1 17.5 19Z'] },
  { id: 'phone', name: 'Phone', group: 'Tech',
    paths: ['M9 2h6a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z', 'M11.5 18.5h1'] },
  { id: 'database', name: 'Database', group: 'Tech',
    paths: ['M12 2C7 2 3 3.3 3 5s4 3 9 3 9-1.3 9-3-4-3-9-3Z',
      'M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5', 'M3 12c0 1.7 4 3 9 3s9-1.3 9-3'] },
  { id: 'wifi', name: 'Wi-Fi', group: 'Tech',
    paths: ['M2 9a16 16 0 0 1 20 0', 'M5.5 12.5a11 11 0 0 1 13 0',
      'M9 15.8a6 6 0 0 1 6 0', 'M11.7 19h.6'] },

  // --- General ---
  { id: 'arrow-right', name: 'Arrow', group: 'General',
    paths: ['M4 12h15', 'M13 5l7 7-7 7'] },
  { id: 'check', name: 'Check', group: 'General',
    paths: ['M4 12.5l5.5 5.5L20 6'] },
  { id: 'star', name: 'Star', group: 'General',
    paths: ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z'] },
  { id: 'heart', name: 'Heart', group: 'General',
    paths: ['M19.5 13.6c1.4-1.5 2.5-3 2.5-5.1A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.1 1.1 3.6 2.5 5.1L12 21l7.5-7.4Z'] },
  { id: 'map-pin', name: 'Location pin', group: 'General',
    paths: ['M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z', circle(12, 10, 3)] },
  { id: 'speech', name: 'Speech bubble', group: 'General',
    paths: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z'] },
];

export const LIBRARY_GROUPS = ['Business', 'Education', 'Tech', 'General'] as const;
