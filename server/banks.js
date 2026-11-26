// A bank's name as it is kept, whatever way it was typed: "scotia" and "bank of nova scotia" are both Scotiabank.
// The same list is in src/utils/accounts.js for the screens; a test keeps the two in step.
const BANKS = [
  ['Scotiabank', 'scotia, scotiabank, scotia bank, bns, bank of nova scotia'], ['TD', 'td, td bank, td canada trust, toronto dominion, td canada'], ['RBC', 'rbc, royal bank, rbc royal bank, royal bank of canada'],
  ['BMO', 'bmo, bank of montreal'], ['CIBC', 'cibc'], ['National Bank', 'national bank, nbc, banque nationale, national bank of canada'], ['Tangerine', 'tangerine'], ['Simplii Financial', 'simplii, simplii financial'],
  ['EQ Bank', 'eq, eq bank, equitable bank'], ['Wealthsimple', 'wealthsimple, wealth simple, ws'], ['Questrade', 'questrade'], ['Desjardins', 'desjardins'], ['HSBC', 'hsbc'], ['Laurentian Bank', 'laurentian, laurentian bank'],
  ['Manulife Bank', 'manulife bank'], ['Manulife', 'manulife'], ['PC Financial', 'pc, pc financial, presidents choice, presidents choice financial, pc money'], ['American Express', 'amex, american express'], ['MBNA', 'mbna'],
  ['Canadian Tire Bank', 'canadian tire, canadian tire bank, ctb, triangle'], ['Rogers Bank', 'rogers, rogers bank'], ['Capital One', 'capital one, capitalone'], ['Neo Financial', 'neo, neo financial'], ['KOHO', 'koho'],
  ['Wise', 'wise'], ['PayPal', 'paypal'], ['Home Trust', 'home trust'], ['Motive Financial', 'motive, motive financial'], ['Alterna', 'alterna, alterna bank'], ['Meridian', 'meridian'], ['Vancity', 'vancity'],
  ['ATB Financial', 'atb, atb financial'], ['Coast Capital', 'coast capital'], ['Oaken Financial', 'oaken, oaken financial'], ['Peoples Bank', 'peoples bank'], ['Interactive Brokers', 'ibkr, interactive brokers'],
  ['Fidelity', 'fidelity'], ['Sun Life', 'sun life, sunlife'], ['Canada Life', 'canada life'], ['Coinbase', 'coinbase'], ['Kraken', 'kraken'], ['Shakepay', 'shakepay'], ['Newton', 'newton'], ['Binance', 'binance'],
];
const plain = (s) => String(s || '').toLowerCase().replace(/['’`.]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const BY = new Map(BANKS.flatMap(([name, also]) => also.split(',').map((a) => [plain(a), name])));
function bankName(text) {
  const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!t) return '';
  const known = BY.get(plain(t));
  if (known) return known;
  // Typed with its own capitals ("iA Financial"): kept. All lower or all upper: each word gets a capital.
  if (/[a-z]/.test(t) && /[A-Z]/.test(t)) return t;
  return t.toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
}
module.exports = { bankName, BANKS };
