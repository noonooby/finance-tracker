# Finds every ledger row whose line in the app differs from the ledger file (category, day or pairing) and writes a correction file for them.
import json, sys, collections
X, out = sys.argv[1], sys.argv[2]
d = json.load(open(X + '/expense_history.json'))
# Notes the ledger keeps beside the file (which instalment a debit was) are put on the rows they belong to.
import glob
for f in glob.glob(X + '/changes_*_bnpl.json'):
    rows = {str(l['id']): l for l in d['lines']}
    for p in json.load(open(f))['payments']:
        r = rows.get(str(p.get('external_id')))
        if r and not r.get('note') and r['date'] == p['debit_date']: r['note'] = f"{p['provider']} {p['plan']} instalment{' (' + p['merchant'] + ')' if p.get('merchant') else ''}, due {p['portal_date']}"
live = json.load(open('live.json'))
by = {str(l['id']): l for l in d['lines']}
grp = collections.defaultdict(list)
for l in d['lines']:
    if l['transfer_id']: grp[l['transfer_id']].append(str(l['id']))
line_ids, want = {}, set()
for l in live['lines']:
    if l['source'] != 'import' or l['updated_at'] or l['undone']: continue
    ids = [str(x) for x in l['external_ids']]
    for x in ids: line_ids[x] = ids
    first = by.get(ids[0])
    groups = {by[x]['transfer_id'] or 'alone ' + x for x in ids if x in by}
    labels = l.get('side_labels') or {}
    if any(by[x].get('note') and by[x]['note'] not in (l.get('notes') or '') for x in ids if x in by): want.update(x for x in ids if x in by)
    if not first or (first['category'] or None) != (l['ledger_category'] or None) or first['date'] != l['date'] or (len(ids) > 1 and len(groups) > 1) \
            or any(x in by and (labels[x] or None) != (by[x]['category'] or None) for x in labels) \
            or (' · '.join(x for x in [first.get('counterparty'), first.get('note')] if x) or None) != (l.get('notes') or None) and l['type'] in ('expense', 'income', 'refund'):
        want.update(x for x in ids if x in by)
kinds = collections.defaultdict(set)
for l in live['lines']:
    if l['source'] == 'import' and l['type'] in ('income', 'refund'): kinds[l['ledger_category']].add(l['type'])
for l in live['lines']:
    if l['source'] == 'import' and not l['updated_at'] and l['type'] in ('income', 'refund') and len(kinds[l['ledger_category']]) > 1: want.update(str(x) for x in l['external_ids'])
for k, v in grp.items():
    if len({tuple(line_ids.get(x, [x])) for x in v}) > 1 and len({by[x]['account'] for x in v}) > 1: want.update(v)
# a row of the file that is on no line yet comes along with whatever it pairs with
want.update(str(l['id']) for l in d['lines'] if str(l['id']) not in line_ids and round(l['amount'] * 100))
todo = list(want)
while todo:
    x = todo.pop()
    for y in line_ids.get(x, []) + grp.get(by[x]['transfer_id'], []):
        if y not in want: want.add(y); todo.append(y)
rules = json.load(open('rules.json'))
rules['refunds'] = sorted(set(rules['refunds'] + ['Housing: Rent']))
json.dump({'rules': rules, 'accounts': d['accounts'], 'lines': [l for l in d['lines'] if str(l['id']) in want], 'schedules': d['schedules']}, open(out, 'w'))
print('rows to send', len(want))
