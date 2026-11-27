import React, { useEffect, useState } from 'react';
import { api } from '../../utils/server';

// A kept picture, fetched once and shown wherever a figure read from it is in question.
const cache = new Map();          // id -> promise of a data URL, or null when the picture is not kept
const load = (id) => {
  if (!cache.has(id)) cache.set(id, api('/api/scan-picture', { id }).then((r) => `data:${r.mime};base64,${r.picture}`).catch(() => null));
  return cache.get(id);
};
function usePicture(id) {
  const [url, setUrl] = useState(null);
  useEffect(() => { let off = false; setUrl(null); if (id) load(id).then((u) => { if (!off) setUrl(u); }); return () => { off = true; }; }, [id]);
  return url;
}

// The whole picture over the page. Tap anywhere to close.
function Viewer({ url, onClose }) {
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3" role="dialog" aria-label="The picture" onClick={onClose}>
      <div className="max-w-full max-h-full overflow-auto rounded-xl"><img src={url} alt="" className="block max-w-full" /></div>
    </div>
  );
}

// A strip of the picture with what it is; tapping it opens the whole picture.
//   y: where on the picture (0 to 100) the figure is, when known: the strip is centred there and the line marked.
export function Picture({ id, url: given, label, y, mark }) {
  const fetched = usePicture(given ? null : id);
  const url = given || fetched;
  const [big, setBig] = useState(false);
  if (!url) return null;
  const at = y != null && Number.isFinite(Number(y)) ? Math.min(100, Math.max(0, Number(y))) : null;
  return (
    <>
      <button type="button" onClick={() => setBig(true)} aria-label={`Look at the whole picture${label ? `: ${label}` : ''}`} className="press relative block w-full h-28 overflow-hidden rounded-xl border border-line bg-surface-2 text-left">
        <img src={url} alt="" className="w-full h-full object-cover" style={{ objectPosition: `50% ${at == null ? 0 : at}%` }} />
        {at != null && mark && <span aria-hidden="true" className="absolute inset-x-0 h-10 border-y-2 border-warning/40 bg-warning/20" style={{ top: `calc(${at}% - 20px)` }} />}
        {label && <span className="absolute inset-x-0 bottom-0 px-2.5 py-1 text-[11px] font-medium text-white bg-gradient-to-t from-black/70 to-transparent">{label} · tap to open</span>}
      </button>
      {big && <Viewer url={url} onClose={() => setBig(false)} />}
    </>
  );
}
