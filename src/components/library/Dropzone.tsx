import { useState } from 'react';
import { FileUp } from 'lucide-react';
import { addImportedSvg } from '../../lib/addElements';

export function Dropzone() {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    setError(null);
    const file = files?.[0];
    if (!file) return;
    if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') {
      setError('Only SVG files are supported.');
      return;
    }
    try {
      addImportedSvg(await file.text(), file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import this SVG.');
    }
  };

  return (
    <div>
      <label
        className={
          'flex h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-[12px] ' +
          (dragOver
            ? 'border-accent bg-accent-weak text-t1'
            : 'border-line text-t3 hover:border-[#4a4a52] hover:text-t2')
        }
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
      >
        <FileUp size={14} />
        Drop SVG or click to import
        <input
          type="file"
          accept=".svg,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </label>
      {error && <div className="mt-1.5 text-[11px] text-red-400">{error}</div>}
    </div>
  );
}
