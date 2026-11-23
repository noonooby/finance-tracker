// Reads a bank or card export (CSV) into the same shape the screenshot reader produces. No model is used:
// every line comes straight from the file, so nothing is guessed. What the file leaves open (which way a single
// amount column counts, day/month order) is decided by rules stated in the notes the person sees.
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, '0');
const real = (y, m, d) => { const x = new Date(y, m - 1, d); return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d; };

// Rows of cells; quoted cells may hold commas, quotes ("") and line breaks. The separator is a comma, semicolon or tab.
function rows(text) {
  const t = String(text || '').replace(/^﻿/, '');
  const first = t.split(/\r?\n/, 1)[0] || '';
  const sep = [',', ';', '\t'].map((s) => [s, first.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const out = []; let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); cell = ''; out.push(row); row = []; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  return out.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x !== ''));
}

// A cell as a date. -> { y, m, d } | { a, b, y } (two numbers whose order is not known yet) | null
function dateParts(s) {
  const v = String(s || '').trim();
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/);
  if (m) return real(+m[1], +m[2], +m[3]) ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return real(+m[1], +m[2], +m[3]) ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return { a: +m[1], b: +m[2], y: +m[3] };
  m = v.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/) || null;
  if (m && MONTHS[m[1].toLowerCase()]) return real(+m[3], MONTHS[m[1].toLowerCase()], +m[2]) ? { y: +m[3], m: MONTHS[m[1].toLowerCase()], d: +m[2] } : null;
  m = v.match(/^(\d{1,2})[- ]([A-Za-z]{3})[a-z]*[- ](\d{4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) return real(+m[3], MONTHS[m[2].toLowerCase()], +m[1]) ? { y: +m[3], m: MONTHS[m[2].toLowerCase()], d: +m[1] } : null;
  return null;
}
// A cell as money: "$1,234.56", "(12.00)", "-12.00", "12.00 CR". -> number | null
function money(s) {
  let v = String(s || '').trim();
  if (!v) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(v)) { sign = -1; v = v.slice(1, -1); }
  if (/\bDR$/i.test(v)) sign = -1;
  v = v.replace(/\s*(CR|DR)$/i, '').replace(/[$\s]/g, '').replace(/,(?=\d{3}(\D|$))/g, '');
  if (/^-/.test(v) || /-$/.test(v)) { sign = -sign; v = v.replace(/-/g, ''); }
  if (!/^\d*\.?\d+$/.test(v)) return null;
  return sign * Number(v);
}

// -> { lines: [{ date, merchant, amount, direction }], notes: [..], skipped }
function parse(text) {
  let rs = rows(text);
  if (!rs.length) return { lines: [], notes: ['The file is empty.'], skipped: 0 };
  const width = Math.max(...rs.map((r) => r.length));
  const col = (i) => rs.map((r) => r[i] || '');
  // A first row with no date in it is a header.
  let head = null;
  if (!rs[0].some((c) => dateParts(c))) { head = rs[0].map((h) => h.toLowerCase()); rs = rs.slice(1); }
  if (!rs.length) return { lines: [], notes: ['The file has a header and no lines.'], skipped: 0 };
  const share = (i, test) => { const cells = col(i).filter((c) => c !== ''); return cells.length ? cells.filter(test).length / cells.length : 0; };
  const dateCols = [...Array(width).keys()].filter((i) => share(i, (c) => !!dateParts(c)) >= 0.9);
  const numCols = [...Array(width).keys()].filter((i) => !dateCols.includes(i) && share(i, (c) => money(c) != null) >= 0.9);
  const named = (re, among) => (head ? among.find((i) => re.test(head[i] || '')) : undefined);
  const dateCol = named(/transaction|trans\.? ?date|^date$/, dateCols) ?? dateCols[0];
  if (dateCol == null) return { lines: [], notes: ['No column of dates was found in the file.'], skipped: rs.length };
  const textCols = [...Array(width).keys()].filter((i) => !dateCols.includes(i) && !numCols.includes(i));
  const avgLen = (i) => { const c = col(i).filter(Boolean); return c.length ? c.reduce((s, x) => s + x.length, 0) / c.length : 0; };
  const descCol = named(/desc|merchant|payee|details|memo|name|narrat/, textCols) ?? [...textCols].sort((a, b) => avgLen(b) - avgLen(a))[0];
  let debit = named(/debit|withdraw|money out|paid out|charge/, numCols), credit = named(/credit|deposit|money in|paid in/, numCols);
  let amountCol = named(/amount|value/, numCols), balCol = named(/balance/, numCols);
  if (!head) {
    // No header: two columns where each line fills only one are money out and money in (the usual order); a third is the balance.
    const exclusive = (a, b) => rs.every((r) => !((r[a] || '') !== '' && (r[b] || '') !== ''));
    if (numCols.length >= 2 && exclusive(numCols[0], numCols[1])) { debit = numCols[0]; credit = numCols[1]; balCol = numCols[2]; }
    else { amountCol = numCols[0]; balCol = numCols[1]; }
  } else if (debit == null && credit == null && amountCol == null) amountCol = numCols.find((i) => i !== balCol);
  const notes = [];
  if (debit == null && credit == null && amountCol == null) return { lines: [], notes: ['No column of amounts was found in the file.'], skipped: rs.length };

  // Day and month order for dates like 03/04/2026: settled by any date in the file that can only be read one way.
  const loose = col(dateCol).map(dateParts).filter((p) => p && p.a != null);
  let dayFirst = false;
  if (loose.length) {
    const aBig = loose.some((p) => p.a > 12), bBig = loose.some((p) => p.b > 12);
    dayFirst = aBig && !bBig;
    if (!aBig && !bBig) notes.push('Dates were read as month/day/year. If the file writes the day first, the dates are wrong: do not save.');
  }
  const toDate = (c) => {
    const p = dateParts(c);
    if (!p) return null;
    if (p.a == null) return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
    const [m, d] = dayFirst ? [p.b, p.a] : [p.a, p.b];
    return real(p.y, m, d) ? `${p.y}-${pad(m)}-${pad(d)}` : null;
  };

  // One signed amount column: which sign is spending. The running balance settles it when the file has one;
  // otherwise the sign most lines carry is spending.
  let outSign = -1;
  if (amountCol != null && debit == null && credit == null) {
    const vals = rs.map((r) => ({ a: money(r[amountCol]), b: balCol != null ? money(r[balCol]) : null }));
    let byBalance = null;
    if (balCol != null) {
      const score = (h, back) => { let n = 0, of = 0; for (let i = 1; i < vals.length; i++) { const cur = back ? vals[i - 1] : vals[i], prev = back ? vals[i] : vals[i - 1];
        if (cur.a == null || cur.b == null || prev.b == null) continue; of++; if (Math.abs((cur.b - prev.b) - h * cur.a) < 0.005) n++; } return of ? n / of : 0; };
      const best = [[1, false], [1, true], [-1, false], [-1, true]].map(([h, back]) => [h, score(h, back)]).sort((x, y) => y[1] - x[1])[0];
      if (best[1] >= 0.8) byBalance = best[0];
    }
    if (byBalance != null) { outSign = byBalance === 1 ? -1 : 1; notes.push('Which lines are money in and which are money out was checked against the running balance in the file.'); }
    else {
      const neg = vals.filter((v) => v.a != null && v.a < 0).length, pos = vals.filter((v) => v.a != null && v.a > 0).length;
      outSign = neg >= pos ? -1 : 1;
      notes.push(`The file has one amount column. Amounts ${outSign < 0 ? 'with a minus sign' : 'without a minus sign'} were read as money out (most lines), the others as money in. Check a line or two.`);
    }
  }

  const lines = []; let skipped = 0;
  for (const r of rs.slice(0, 3000)) {
    const date = toDate(r[dateCol]);
    let amount = null, direction = 'out';
    if (debit != null || credit != null) {
      const o = debit != null ? money(r[debit]) : null, i = credit != null ? money(r[credit]) : null;
      if (o) { amount = Math.abs(o); direction = 'out'; } else if (i) { amount = Math.abs(i); direction = 'in'; }
    } else {
      const a = money(r[amountCol]);
      if (a) { amount = Math.abs(a); direction = Math.sign(a) === outSign ? 'out' : 'in'; }
    }
    const merchant = String((descCol != null ? r[descCol] : '') || '').replace(/\s+/g, ' ').slice(0, 80);
    if (!date || !amount || !merchant) { skipped++; continue; }
    lines.push({ date, merchant, amount: Math.round(amount * 100) / 100, direction, pending: false });
  }
  if (rs.length > 3000) notes.push('Only the first 3000 lines were read.');
  if (skipped) notes.push(`${skipped} ${skipped === 1 ? 'row was' : 'rows were'} left out: no date, amount or description.`);
  notes.unshift(`${lines.length} ${lines.length === 1 ? 'line' : 'lines'} read from the file exactly as written.`);
  return { lines, notes, skipped };
}

module.exports = { parse, rows, money, dateParts };
