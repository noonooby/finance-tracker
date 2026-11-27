import json, collections
d = json.load(open('live.json'))
have = sum(a['balance'] for a in d['accounts'] if not a['owed']); owe = sum(a['balance'] for a in d['accounts'] if a['owed'])
sp = collections.Counter(); inc = collections.Counter()
for l in d['lines']:
    if l['undone']: continue
    y = l['date'][:4]
    if l['type'] == 'expense': sp[y] += l['amount']
    elif l['type'] == 'refund': sp[y] -= l['amount']
    elif l['type'] == 'income': inc[y] += l['amount']
print(len(d['lines']), 'net', round(have - owe, 2), [(y, round(sp[y]), round(inc[y])) for y in sorted(sp)])
