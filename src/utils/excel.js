// Excel read/write through exceljs, loaded only when a file is made or read.
export const MAX_SHEET_ROWS = 5000;

const loadExcel = async () => {
  const mod = await import('exceljs');
  return mod.default || mod;
};

// sheets: [{ name, rows, cols }] where rows is an array of arrays, or an array of objects (keys become the header row).
// cols: optional list of column widths in characters.
export async function downloadWorkbook(sheets, filename) {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  for (const { name, rows = [], cols } of sheets) {
    const ws = wb.addWorksheet(name);
    if (rows.length && !Array.isArray(rows[0])) {
      const headers = Object.keys(rows[0]);
      ws.addRow(headers);
      rows.forEach((r) => ws.addRow(headers.map((h) => r[h])));
    } else {
      rows.forEach((r) => ws.addRow(r));
    }
    if (cols) cols.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  }
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A cell's plain value: formulas give their result, rich text gives its text, dates stay Date.
function plainValue(v) {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return plainValue(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((t) => String(t.text || '')).join('');
    if ('text' in v) return String(v.text);
    return undefined;
  }
  return v;
}

// Reads one sheet into objects keyed by the header row. Only cell values are read; at most MAX_SHEET_ROWS rows.
export async function readSheetRows(file, sheetName) {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.getWorksheet(sheetName);
  if (!ws) return null;
  if (ws.rowCount - 1 > MAX_SHEET_ROWS) throw new Error(`The sheet has more than ${MAX_SHEET_ROWS} rows. Split it into smaller files.`);
  const headers = [];
  ws.getRow(1).eachCell((cell, col) => {
    const h = plainValue(cell.value);
    if (h !== undefined && h !== '__proto__' && h !== 'constructor' && h !== 'prototype') headers[col] = String(h).trim();
  });
  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const obj = Object.create(null);
    let any = false;
    headers.forEach((h, col) => {
      if (!h) return;
      const v = plainValue(row.getCell(col).value);
      if (v !== undefined && v !== '') { obj[h] = v; any = true; }
    });
    if (any) rows.push({ ...obj, __row: r });
  }
  return rows;
}

// A date cell, Excel serial number or text -> 'yyyy-mm-dd' text (or the original text when it cannot be read).
export function toDateText(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  return String(v).trim();
}
