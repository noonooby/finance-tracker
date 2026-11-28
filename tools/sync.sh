#!/bin/bash
# Bring the app in line with the ledger file: find what differs, apply it, read back and check. Usage: sync.sh <label>
cd "$(dirname "$0")" || exit 1
# The ledger's export folder: on the NAS when it is mounted, else where it was first made. LEDGER_DIR overrides both.
NAS="/Volumes/home/91 Projects/personal-finance/finance/export"
OLD="/Users/Rithul/Library/Application Support/Claude/scratch-workspaces/10a89fe9-b0d1-4508-8b27-0abe5105a146/5c7c02e4-467d-43e2-b577-52e66f7bb3b4/scratch-2026-11-27-43f1be/finance/export"
X="${LEDGER_DIR:-$([ -f "$NAS/expense_history.json" ] && echo "$NAS" || echo "$OLD")}"
[ -f "$X/expense_history.json" ] || { echo "The ledger file is not at $X"; exit 1; }
echo "ledger: $X"
# The ledger can be rebuilt at any moment: work from one copy taken now, so the compare and the check read the same file.
SNAP="$(mktemp -d)"; trap 'rm -rf "$SNAP"' EXIT
cp "$X"/expense_history.json "$SNAP"/ && cp "$X"/changes_*_bnpl.json "$SNAP"/ 2>/dev/null
X="$SNAP"
get() { curl -s --compressed -H "x-export-key: $(cat ~/.config/finance-export.key)" https://finance.nobodystack.com/api/export -o live.json; }
get
N=$(python3 -I mk_sync.py "$X" "$1.json" | awk '{print $4}')
echo "rows that differ: $N"
if [ "$N" != "0" ]; then
  scp -q -i ~/.ssh/oracle_vm "$1.json" ubuntu@40.233.96.77:stack/ && ssh -i ~/.ssh/oracle_vm ubuntu@40.233.96.77 "bash ~/stack/apply_remote.sh $1.json $1 --replace" 2>&1 | sed 's/"kinds":{[^}]*},//' | cut -c1-330
  get
fi
rm -f "$1.json"
node ~/code/finance-tracker/server/ledger-check.js "$X/expense_history.json" live.json | tr -d '\n' | cut -c1-900; echo
python3 -I totals.py
rm -f live.json
