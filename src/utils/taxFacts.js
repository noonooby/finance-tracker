import { useEffect, useState } from 'react';
import { api } from './server';

// The yearly tax figures (server/taxfacts.js), fetched once for every screen that needs them. The last copy is kept
// on the device so the sums still show without a connection.
const KEY = 'tax_facts';
let facts = (() => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } })();
let asked = null;
const subs = new Set();

export const taxFactsNow = () => facts;
export function loadTaxFacts() {
  if (!asked) {
    asked = api('/api/tax-facts', undefined, 'GET').then((f) => {
      facts = f;
      try { localStorage.setItem(KEY, JSON.stringify(f)); } catch { /* shown without being kept */ }
      subs.forEach((s) => s(f));
      return f;
    }).catch(() => { asked = null; return facts; });
  }
  return asked;
}
export function useTaxFacts() {
  const [f, setF] = useState(facts);
  useEffect(() => { subs.add(setF); loadTaxFacts(); return () => { subs.delete(setF); }; }, []);
  return f;
}
