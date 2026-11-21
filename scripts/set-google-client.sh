#!/bin/bash
# Puts a new Google sign-in client into finance/.env on the server, without showing or printing the values.
# Asks for the client ID and secret with hidden typing, backs up .env, replaces the two lines, restarts only finance.
set -euo pipefail
HOST=ubuntu@40.233.96.77
KEY=~/.ssh/oracle_vm

printf 'Paste the Client ID (hidden), then press Return: '; stty -echo; IFS= read -r CID; stty echo; echo
printf 'Paste the Client secret (hidden), then press Return: '; stty -echo; IFS= read -r CSEC; stty echo; echo
CID="${CID//[[:space:]]/}"; CSEC="${CSEC//[[:space:]]/}"
case "$CID" in *.apps.googleusercontent.com) ;; *) echo "That Client ID does not end in .apps.googleusercontent.com. Nothing changed."; exit 1;; esac
[ ${#CSEC} -ge 10 ] || { echo "The secret looks too short. Nothing changed."; exit 1; }

# The values go over ssh on standard input, never on a command line.
printf '%s\n%s\n' "$CID" "$CSEC" | ssh -i "$KEY" "$HOST" 'set -e
cd ~/stack
IFS= read -r CID; IFS= read -r CSEC
B=finance/.env.bak-$(date +%Y%m%d-%H%M%S)
cp -p finance/.env "$B"; chmod 600 "$B"
CID="$CID" CSEC="$CSEC" python3 - <<"PY"
import os
p = "finance/.env"
lines = open(p).read().splitlines()
out, seen = [], set()
for l in lines:
    if l.startswith("GOOGLE_CLIENT_ID="): out.append("GOOGLE_CLIENT_ID=" + os.environ["CID"]); seen.add("id")
    elif l.startswith("GOOGLE_CLIENT_SECRET="): out.append("GOOGLE_CLIENT_SECRET=" + os.environ["CSEC"]); seen.add("s")
    else: out.append(l)
if "id" not in seen: out.append("GOOGLE_CLIENT_ID=" + os.environ["CID"])
if "s" not in seen: out.append("GOOGLE_CLIENT_SECRET=" + os.environ["CSEC"])
fd = os.open(p + ".new", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
os.write(fd, ("\n".join(out) + "\n").encode()); os.close(fd)
os.replace(p + ".new", p)
PY
chmod 600 finance/.env
docker compose up -d --no-deps --force-recreate finance >/dev/null 2>&1
echo "Saved. Backup: $B. Finance restarted."'
unset CID CSEC
echo "Done. You can close this tab."
