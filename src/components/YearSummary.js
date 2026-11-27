import React, { useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { useFinanceData } from '../hooks/useFinanceData';
import { yearSummary, yearFiles } from '../utils/plans';
import { formatCurrency } from '../utils/helpers';
import { Card, Section, Stat, Button, EmptyState } from './shared/ui';

// One calendar year added up, for tax time: money in by source, spending by category, loan interest and fees,
// with two files to download. Everything comes from the lines already recorded.
function save(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Lines({ title, total, rows }) {
  return (
    <Section title={title} action={<span className="text-xs text-muted">{formatCurrency(total)}</span>}>
      <Card padded={false} className="divide-y divide-line">
        {rows.length === 0 && <p className="px-4 py-3 text-sm text-muted">Nothing recorded.</p>}
        {rows.map((x) => (
          <div key={x.name} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="min-w-0 truncate">{x.name}</span>
            <span className="tabular-nums shrink-0">{formatCurrency(x.amount)}</span>
          </div>
        ))}
      </Card>
    </Section>
  );
}

export default function YearSummary() {
  const { transactions = [], dataLoading } = useFinanceData();
  const years = useMemo(() => [...new Set(transactions.map((t) => String(t.date || '').slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))].sort().reverse(), [transactions]);
  const [picked, setPicked] = useState('');
  const year = picked || years[0] || String(new Date().getFullYear());
  const s = useMemo(() => yearSummary(transactions, year), [transactions, year]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">The year</h1>
        <p className="text-sm text-muted mt-1">One calendar year added up from what is recorded, for tax time. The files open in any spreadsheet.</p>
      </div>

      {!dataLoading && years.length === 0 ? (
        <Card><EmptyState icon={FileSpreadsheet} title="Nothing recorded yet" text="Once there are lines, each year shows here." /></Card>
      ) : (
        <>
          <Card className="space-y-3">
            <label className="block text-sm">
              <span className="text-muted">Year</span>
              <select value={year} onChange={(e) => setPicked(e.target.value)} className="mt-1 field">
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Money in" value={formatCurrency(s.income.total)} />
              <Stat label="Spending" value={formatCurrency(s.spending.total)} />
              <Stat label="Interest paid on loans" value={formatCurrency(s.interest)} />
              <Stat label="Fees" value={formatCurrency(s.fees)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => save(`finance-${year}-totals.csv`, yearFiles(s).totals)}>Download the totals</Button>
              <Button variant="secondary" onClick={() => save(`finance-${year}-lines.csv`, yearFiles(s).lines)}>Download every line ({s.lines.length})</Button>
            </div>
          </Card>
          <Lines title="Money in, by source" total={s.income.total} rows={s.income.by} />
          <Lines title="Spending, by category" total={s.spending.total} rows={s.spending.by} />
          <p className="text-xs text-muted">Refunds are taken off spending. Interest is the interest part of loan payments, where the loan has a rate. Card interest shows only if you recorded it as a purchase.</p>
        </>
      )}
    </div>
  );
}
