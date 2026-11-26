// What the app knows about credit cards before you tell it anything: what each card gives back and in what form
// (cash back, CT Money, points), and which cards can hold payment plans inside them. It is part of the app, so it
// is there after a fresh start. A rate you set on a card yourself always comes first.
// Rates are the issuers' published ones, checked on CHECKED. Caps, welcome offers and rule changes are not counted:
// the card's own statement is the real count.
import { plainName } from './merchants';

export const CHECKED = '2026-11-26';

// name: words that must all be in the card's name (or its bank).  kind: what the card pays in.
// base: percent on everything.  cats: percent by the app's own category.  stores: percent at named merchants.
// plans: stores whose purchases can become an equal payment plan inside this card, with no interest.
const PROGRAMS = [
  { id: 'scotia_momentum_infinite', match: [['momentum', 'infinite']], kind: 'Cash back', base: 1, cats: { groceries: 4, utilities: 4, transportation: 2 },
    note: '4% on groceries and recurring bills, 2% on gas, transit and food delivery, 1% on the rest.' },
  { id: 'scotia_momentum', match: [['momentum']], kind: 'Cash back', base: 0.5, cats: { groceries: 2, utilities: 2, transportation: 2 },
    note: '2% on groceries, recurring bills, gas and drugstores, 0.5% on the rest (no-fee Momentum Visa: 1% and 0.5%).' },
  { id: 'amex_simplycash_preferred', match: [['simplycash', 'preferred']], kind: 'Cash back', base: 2, cats: { groceries: 4, transportation: 4 },
    note: '4% on gas and groceries, 2% on the rest.' },
  { id: 'amex_simplycash', match: [['simplycash']], kind: 'Cash back', base: 1.25, cats: { groceries: 2, transportation: 2 }, note: '2% on gas and groceries, 1.25% on the rest.' },
  { id: 'pc_world_elite', match: [['pc', 'world', 'elite'], ['presidents', 'choice', 'world', 'elite']], kind: 'PC Optimum points', base: 1, stores: [{ names: 'shoppers drug*, shoppersdrugmart*, pharmaprix*', percent: 4.5 }, { names: 'loblaws*, no frills, nofrills*, real canadian superstore, superstore, rcss*, zehrs*, fortinos*, valu mart, your independent grocer, provigo*, maxi, atlantic superstore, pc express', percent: 3 }],
    note: '45 points a dollar at Shoppers Drug Mart, 30 at Loblaw grocery stores, 10 elsewhere. 10,000 points are worth $10.' },
  { id: 'pc_mastercard', match: [['pc', 'mastercard'], ['presidents', 'choice']], kind: 'PC Optimum points', base: 1, stores: [{ names: 'shoppers drug*, shoppersdrugmart*, pharmaprix*', percent: 2.5 }],
    note: '25 points a dollar at Shoppers Drug Mart, 10 elsewhere. 10,000 points are worth $10.' },
  { id: 'tangerine_money_back', match: [['money', 'back']], kind: 'Cash back', base: 0.5, note: '2% in the two or three categories you chose with Tangerine, 0.5% on the rest. Add your 2% categories on the card.' },
  { id: 'triangle_world_elite', match: [['triangle', 'world', 'elite'], ['world', 'elite', 'canadian', 'tire']], kind: 'CT Money', base: 1, cats: { groceries: 3 },
    stores: [{ names: 'canadian tire*, sport chek, sportchek*, marks, mark s, lequipeur*, atmosphere*, party city, sports experts, pro hockey life, partsource*', percent: 4 }],
    plans: 'canadian tire, party city, sport chek, sportchek, marks, lequipeur, atmosphere, sports experts, pro hockey life, partsource',
    note: '4% at Canadian Tire, Sport Chek, Mark\'s, Party City and their sister stores, 3% on groceries, 1% on the rest.' },
  { id: 'triangle', match: [['triangle'], ['canadian', 'tire']], kind: 'CT Money', base: 0.5, cats: { groceries: 1.5 },
    stores: [{ names: 'canadian tire*, sport chek, sportchek*, marks, mark s, lequipeur*, atmosphere*, party city, sports experts, pro hockey life, partsource*', percent: 4 }],
    plans: 'canadian tire, party city, sport chek, sportchek, marks, lequipeur, atmosphere, sports experts, pro hockey life, partsource',
    note: '4% at Canadian Tire, Sport Chek, Mark\'s, Party City and their sister stores, 1.5% on groceries, 0.5% on the rest.' },
  { id: 'rogers_world_elite', match: [['rogers', 'world', 'elite']], kind: 'Cash back', base: 1.5, note: '1.5% on everything, 2% when you have a Rogers, Fido or Shaw service. Set 2 on the card if that is you.' },
  { id: 'rogers', match: [['rogers']], kind: 'Cash back', base: 1, note: '1% on everything, 2% when you have a Rogers, Fido or Shaw service (the World Elite card gives 1.5%). Set your rate on the card.' },
  { id: 'amazon_mbna', match: [['amazon']], kind: 'Amazon.ca rewards', base: 1, stores: [{ names: 'amazon*, amzn*, whole foods*, wholefds*', percent: 2.5 }], plans: 'amazon, amzn',
    note: '2.5% at Amazon.ca and Whole Foods with Prime (1.5% without), 1% on the rest.' },
  { id: 'mbna', match: [['mbna']], kind: null, base: null, plans: 'amazon, amzn', note: null },
];

const words = (s) => plainName(s).split(' ').filter(Boolean);
const storeFits = (names, description) => {
  const text = ` ${plainName(description)} `;
  return String(names || '').split(',').map((n) => n.trim()).filter(Boolean).some((n) => (n.endsWith('*') ? text.includes(` ${plainName(n)}`) : text.includes(` ${plainName(n)} `)));
};

// The built-in knowledge for a card, told from its name and bank. The first one that fits wins, so the list goes
// from the most exact name to the least.
export function cardProgram(card) {
  if (!card || card.is_gift_card) return null;
  const have = new Set(words(`${card.name || ''} ${card.institution || ''} ${card.issuer || ''} ${card.provider || ''}`));
  return PROGRAMS.find((p) => p.match.some((all) => all.every((w) => have.has(w)))) || null;
}

// What the built-in knowledge says a card gives back on one purchase, in percent, or null when it says nothing.
export function programRate(card, categoryId, description) {
  const p = cardProgram(card);
  if (!p || p.base == null) return null;
  const store = description && (p.stores || []).find((s) => storeFits(s.names, description));
  if (store) return store.percent;
  const cat = String(categoryId == null ? '' : categoryId);
  const key = cat && Object.keys(p.cats || {}).find((k) => cat === k || cat.startsWith(`${k}_`));
  return key ? p.cats[key] : p.base;
}

// A payment plan told from its name ("#838 PARTY CITY - Monthly Equal Payment Plan"): the card it sits inside, when
// exactly one of your cards is known to hold plans from that store. -> the card, or null.
export function planHome(name, cards = []) {
  const fits = (cards || []).filter((c) => { const p = cardProgram(c); return p && p.plans && storeFits(p.plans, name); });
  return fits.length === 1 ? fits[0] : null;
}
// Words that say a loan is a plan inside a card.
export const looksLikePlan = (name) => /equal pay|payment plan|instal+ment|no fee no interest|plan it|paiements egaux/i.test(String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, ''));

// Loans the app knows by name: what kind they are and how they are paid.
const LENDERS = [
  { names: 'payplan*, rbc ampli, ampli', kind: 'bnpl', label: 'PayPlan by RBC', zero: true, note: 'A PayPlan by RBC loan (IKEA and other stores). Equal monthly payments taken from your bank account by pre-authorized debit, often at 0%.' },
  { names: 'klarna*, affirm*, afterpay*, sezzle*, paybright*, flexiti*, pay in 4, payin4*', kind: 'bnpl', zero: true, note: 'A pay-later plan in equal payments.' },
  { names: 'pine, first national, mcap, rmg mortgage*, merix*, cmls*, nesto*, true north mortgage, home trust, equitable bank, street capital, lendwise*, mortgage*, hypotheque*', kind: 'mortgage', note: 'A mortgage.' },
  { names: 'toyota financial, toyota credit, lexus financial, honda financial, honda canada finance, acura financial, nissan canada finance, infiniti financial, hyundai capital, hyundai motor finance, kia finance, kia motors finance, ford credit, gm financial, gmf*, mazda financial, subaru financial, vw credit, volkswagen finance, audi finance, bmw financial, mercedes benz financial, mbfs*, stellantis financial, scotia dealer advantage, td auto finance, car lease, auto lease, vehicle lease, car loan, auto loan', kind: 'car_lease', note: 'A car lease or loan.' },
  { names: 'nslsc*, student loan*, osap*, canada student loan', kind: 'student', note: 'A student loan.' },
];
export function knownLender(name) {
  const hit = LENDERS.find((l) => storeFits(l.names, name));
  return hit ? { kind: hit.kind, label: hit.label || null, zero: !!hit.zero, note: hit.note } : null;
}
