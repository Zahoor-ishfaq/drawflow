// Example DrawFlow plugin: an emphasis effect, an exit effect, an asset
// provider and an exporter. Install it under View → Plugins… by pasting this
// file, or host it and add it by URL.
export default {
  id: 'example.wobble',
  name: 'Wobble example',
  setup(api) {
    api.plugins.registerEffect({
      kind: 'emphasis', id: 'wobble', label: 'Wobble',
      frame: ({ p, base }) => ({ rotate: base.rotate + Math.sin(p * Math.PI * 4) * 6 }),
    });
    api.plugins.registerEffect({
      kind: 'exit', id: 'drop', label: 'Drop off the page',
      frame: ({ p, base, view }) => ({ dy: base.dy + view.height * p * p, rotate: base.rotate + 20 * p }),
    });
    api.plugins.registerAssetProvider({
      id: 'shapes', label: 'Simple shapes',
      async search(query) {
        const q = query.toLowerCase();
        const all = [
          { id: 'circle', name: 'Circle', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="none" stroke="#111" stroke-width="6"/></svg>' },
          { id: 'heart', name: 'Heart', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 85 L15 50 A20 20 0 0 1 50 25 A20 20 0 0 1 85 50 Z" fill="none" stroke="#111" stroke-width="6"/></svg>' },
        ];
        return all.filter((a) => a.name.toLowerCase().includes(q));
      },
    });
    api.plugins.registerExporter({
      id: 'log', label: 'Log to console',
      run: (result) => console.log('exported', result.filename, result.sizeBytes, 'bytes in', result.elapsedMs, 'ms'),
    });
  },
};
