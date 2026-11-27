// One question on a sheet, in place of the browser's own box. ask() answers true or false.
let show = null;
export const onAsk = (fn) => { show = fn; return () => { if (show === fn) show = null; }; };
export const ask = (message, { ok = 'Yes', cancel = 'No' } = {}) => new Promise((resolve) => {
  if (!show) return resolve(typeof window !== 'undefined' && window.confirm ? window.confirm(message) : true);
  show({ message: String(message), ok, cancel, resolve });
});
