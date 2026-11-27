// Bring a ledger's history into one person's account, from the command line on the machine that holds the database:
//   node --experimental-sqlite server/import-history.js <file.json> <email> [--dry] [--reset]
// --dry works everything out and saves nothing. --reset first removes everything recorded for that person (the sign-in stays).
const fs = require('fs');
const [file, email, ...flags] = process.argv.slice(2);
if (!file || !email) { console.error('Usage: import-history.js <file.json> <email> [--dry] [--reset]'); process.exit(2); }
// With - in place of the file, nothing is brought in: categories that are doubled are made one.
const { db, importHistory, mergeTwinCategories, userFor, tx } = require('./server');
const uid = userFor(email);
if (file === '-') { console.log(JSON.stringify({ merged: tx(() => mergeTwinCategories(uid)) })); process.exit(0); }
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
if (flags.includes('--dry')) {
  const p = require('./history').plan(data, uid);
  console.log(JSON.stringify({ dry: true, accounts: p.accounts.length, categories: p.categories.length, lines: p.rows.length, kinds: p.counts, problems: p.problems.length }));
  process.exit(0);
}
if (flags.includes('--reset')) {
  const gone = tx(() => ({ rows: Number(db.prepare('DELETE FROM rows WHERE user_id = ?').run(uid).changes), keys: Number(db.prepare('DELETE FROM money_keys WHERE user_id = ?').run(uid).changes) }));
  console.log(JSON.stringify({ reset: gone }));
}
const out = importHistory(uid, data);
console.log(JSON.stringify({ ...out, problems: out.problems.length }));
