// What the app knows about merchants before it has seen any of your own lines: which category a name on a bank or
// card statement belongs to. It is part of the app, so it is there from the first line after a fresh start.
// Your own choices always come first (see categoryRules.js): this only fills a category that would be empty.
//
// Names are separated by commas. A name is matched as whole words anywhere in the description ("tim hortons" in "TIM HORTONS #1769 ETOBICOKE ON").
// A trailing * matches the start of a word ("amzn*" in "AMZN Mktp CA*5E1RB0V71"). When several fit, the longest
// wins, so "uber eats" is Dining and "uber" alone is Transportation.
// Sources: the chains listed for Canada (supermarkets, restaurants, fuel brands), the deposit labels Canadian banks
// and the Canada Revenue Agency use, and the merchants seen on this app's own statements.
const KNOWN = {
  groceries: `loblaws*, no frills, nofrills*, real canadian superstore, superstore, rcss*, zehrs*, fortinos*, valu mart, valumart*, your independent grocer, independent city market, provigo*, maxi, atlantic superstore, sobeys*, safeway*, freshco*, foodland*, iga, thrifty foods, farm boy, longos*, metro, food basics, super c, adonis*, t and t supermarket, tnt supermarket, t t supermarket, costco*, walmart supercentre, whole foods*, wholefds*, save on foods, saveonfoods*, buy low foods, co op food, calgary co op, nesters market, pusateris*, summerhill market, galleria supermarket, h mart, hmart*, nations fresh, oceans fresh, food depot, al premium, btrust*, sunny foodmart, fresh value, apna food bazaar, apna bazaar, iqbal halal foods, iqbal foods, panchvati*, subzi mandi, titan etobicoke, valley farm*, highland farms, starsky*, bulk barn, m and m food market, mm food market, instacart*, voila*, pc express, grocery gateway, yummy market, coppas*, supermarket*, grocer*, food mart, foodmart*`,
  dining: `tim hortons, tim horton*, tims, mcdonald*, starbucks*, subway, a and w, burger king, wendys*, harveys*, kfc, popeyes*, mary browns*, swiss chalet, st hubert*, pizza hut, pizza pizza, dominos*, little caesars*, papa johns*, pizzaville*, pizza nova, 241 pizza, boston pizza, east side marios*, the keg, keg steakhouse, montanas*, kelseys*, milestones*, earls*, cactus club*, moxies*, jack astors*, scaddabush*, red lobster, olive garden, chipotle*, taco bell, freshii*, booster juice, jugo juice, second cup, coffee time, balzacs*, dairy queen, dq grill, baskin robbins*, krispy kreme, cinnabon*, five guys*, south st burger*, hero certified burgers, hero burger, fat bastard burrito, mucho burrito, quesada*, barburrito*, osmows*, lazeez*, paramount fine foods, shawarma*, pho, sushi*, ramen*, thai express, mandarin restaurant, congee*, nandos*, chick fil a, wingstop*, wild wing, st louis bar*, firehouse subs, jersey mikes*, mr sub, pita pit, panera*, sunset grill, eggsmart*, dennys*, ihop, white spot, triple os*, smittys*, uber eats, ubereats*, uber canada ubereats, doordash*, skipthedishes*, skip the dishes, skipthe*, foodora*, la vecchia, szechuan express, lcbo*, the beer store, beer store, wine rack, restaurant*, bistro*, cafe, coffee, bakery*, diner, grill, pizzeria*, tavern*, pub, eatery*, bbq, burrito*, tacos, noodle*, pizza, burger*`,
  transportation: `petro canada, petrocan*, esso, shell, ultramar*, pioneer gas, pioneer energy, husky, chevron*, mobil, canadian tire gas, gas bar, circle k, macs convenience, couche tard*, fas gas, co op gas, costco gas, costco gasoline*, irving oil, sunoco*, presto*, ttc, go transit, metrolinx*, up express, via rail, miway*, brampton transit, yrt, oc transpo, stm, translink*, bc transit, uber, uber trip, uber canada, toyota financial, toyota credit, lexus financial, honda financial, honda canada finance, acura financial, nissan canada finance, infiniti financial, hyundai capital, hyundai motor finance, kia finance, kia motors finance, ford credit, gm financial, gmf*, mazda financial, subaru financial, vw credit, volkswagen finance, audi finance, bmw financial, mercedes benz financial, mbfs*, stellantis financial, scotia dealer advantage, td auto finance, car lease, auto lease, vehicle lease, lease payment, lease pmt, car loan, auto loan, lyft*, taxi*, beck taxi, co op cabs, zipcar*, communauto*, enterprise rent*, hertz*, avis, budget rent*, turo, green p parking, greenp*, impark*, indigo park*, precise parklink*, spothero*, honk mobile, honkmobile*, parking*, pearson parking, 407 etr, 407etr*, service ontario, serviceontario*, drivetest*, air canada, westjet*, porter airlines, flair airlines*, air transat*, sunwing*, expedia*, jiffy lube, mr lube, midas, active green ross, ok tire, kal tire, car wash, carwash*, bike share`,
  utilities: `toronto hydro, hydro one, hydro ottawa, hydro quebec, alectra*, enbridge*, union gas, fortis*, bc hydro, epcor*, enmax*, atco, manitoba hydro, nova scotia power, nb power, sask power, saskpower*, saskenergy*, direct energy, reliance comfort, enercare*, toronto water, utility*, water bill, rogers*, fido*, bell canada, bell mobility, bell internet, bell aliant, virgin plus, virgin mobile, telus*, koodo*, public mobile, freedom mobile, chatr*, lucky mobile, fizz, videotron*, shaw cable, shaw communications, eastlink*, sasktel*, teksavvy*, start ca, distributel*, cogeco*, xplore*, xplornet*, oxio*, carrytel*, beanfield*, starlink*, bell mobilite, rogers wireless, fido mobile, telus mobility, koodo mobile, shaw mobile, eastlink mobile, videotron mobile, pc mobile, speakout*, good2go*, cityfone*, zoomer wireless, simply connect, petro canada mobility, mobile bill, phone bill, wireless bill, cell phone*, cellphone*, hydro*`,
  entertainment: `netflix*, spotify*, disney plus, disneyplus*, crave*, prime video, amazon prime*, primevideo*, apple com bill, apple tv, apple music, itunes*, youtube premium, youtubepremium*, google youtube, audible*, kindle*, paramount plus, hayu, dazn*, sportsnet*, tsn direct, playstation*, xbox*, nintendo*, steam games, steampowered*, epic games, twitch*, cineplex*, landmark cinemas, imagine cinemas, ticketmaster*, stubhub*, eventbrite*, live nation, the rec room, rec room, dave and busters, bowlero*, topgolf*, canadas wonderland, ripleys*, cn tower, royal ontario museum, art gallery of ontario, toronto zoo, ontario science*, goodlife*, planet fitness, la fitness, fit4less*, anytime fitness, orangetheory*, ymca*, movie*, theatre*, cinema*`,
  healthcare: `shoppers drug mart, shoppers drugmart, shoppersdrugmart*, shoppers drug*, rexall*, pharmasave*, guardian pharmacy, ida pharmacy, london drugs, jean coutu*, pharmaprix*, uniprix*, costco pharmacy, walmart pharmacy, pharmacy*, pharmacie*, drug mart, drugstore*, dental*, dentist*, orthodont*, optometr*, optical*, specsavers*, lenscrafters*, hakim optical, physio*, chiropract*, massage*, clinic*, medical*, lifelabs*, dynacare*, hospital*, veterinar*, animal hospital, manulife*, sun life, sunlife*, canada life, green shield*, blue cross, maple health, felix health, well ca`,
  shopping: `amazon*, amzn*, walmart*, wal mart, dollarama*, dollar tree, dollar store, giant tiger, canadian tire*, winners*, homesense*, marshalls*, ikea*, home depot, homedepot*, lowes*, rona, home hardware, best buy, bestbuy*, staples*, the source, apple store, apple online store, uniqlo*, h and m, zara*, old navy, banana republic, aritzia*, lululemon*, simons*, hudsons bay, the bay, nordstrom*, saks*, sport chek, sportchek*, decathlon*, mountain equipment*, foot locker, footlocker*, nike*, adidas*, sephora*, bath and body works, indigo books, chapters*, michaels*, bed bath*, wayfair*, structube*, the brick, leons*, sleep country, ebay*, etsy*, aliexpress*, temu, shein*, klarna*, afterpay*, affirm*, sezzle*, paypal, pypl*, pay in 4, payin4*, ray ban, fendrihan*, alpha technology system*, cf sherway*, sherway gardens, yorkdale*, eaton centre, canada post, cpc scp, ups store, purolator*, fedex*, toys r us, mastermind toys, lego*, golf town, pet valu, petsmart*`,
  housing: `rent, rent payment, condo fee*, condo fees, maintenance fee*, common element*, strata fee*, property tax*, tax bill, toronto tax, city of toronto tax, municipal tax*, taxes municipales, realty tax*, mortgage*, mortgage pmt, mtg pmt, mtg payment, hypotheque*, pine, pine mortgage, pine financial, first national, mcap, rmg mortgage*, merix*, cmls*, nesto*, true north mortgage, home trust, street capital, lendwise*, chexy*, rentmoola*, rent panda, rentcafe*, yardi*, buildium*, tenantpay*, payprop*, letus*, condo control, firstservice residential, del property management, crossbridge condominium, tscc*, mtcc*, ycc*, pscc*, dscc*, hscc*, pcc, landlord*`,
  insurance: `sonnet*, intact*, aviva*, belairdirect*, belair*, td insurance, td ins, td home and auto, rbc insurance, rbc ins, desjardins insurance, desjardins general, the personal, la personnelle, co operators, cooperators*, wawanesa*, economical*, definity*, allstate*, state farm, caa insurance, onlia*, square one insurance, pembridge*, travelers*, gore mutual, northbridge*, aha insurance, scoop insurance, duuo*, apollo insurance, policyme*, trupanion*, pets plus us, fetch pet, security national, johnson insurance, johnson inc, sgi canada, icbc*, mpi insurance, saaq*, car insurance, auto insurance, home insurance, tenant insurance, life insurance, insurance*, assurance*`,
  loan_payments: `payplan*, rbc payplan, payplan by rbc, rbc ampli, fairstone*, easyfinancial*, goeasy*, nslsc*, student loan*, osap*, canada student loan, loan payment, loan pmt, loan pymt, flexiti*, paybright*, installment loan, instalment loan`,
  salary: `payroll*, salary*, paycheque*, pay cheque, direct deposit, interac corp*, adp, ceridian*, dayforce*, paychex*, wages*`,
  other_income: `canada rit, canada fed, canada pro, canada ccb, canada gst, gst hst credit, canada child benefit, ontario trillium*, trillium benefit, climate action*, carbon rebate, canada carbon*, ei canada, employment insurance, canada pension, old age security, cra refund, tax refund, e transfer, etransfer*, e tfr, interac e transfer, interac etransfer*, autodeposit*, cash received, reimbursement*, rebate*, refund*, cashback*, cash back`,
  investment: `dividend*, interest paid, interest earned, interest credit, deposit interest, savings interest, gic interest, distribution*, capital gain*`,
};
const NAMES = { groceries: 'Groceries', dining: 'Dining', transportation: 'Transportation', utilities: 'Utilities', entertainment: 'Entertainment', healthcare: 'Healthcare',
  shopping: 'Shopping', housing: 'Housing', insurance: 'Insurance', loan_payments: 'Loan payments', salary: 'Salary', other_income: 'Other Income', investment: 'Investment' };
const INCOME = new Set(['salary', 'other_income', 'investment']);

// "McDonald's #14146 ETOBICOKE ON" -> "mcdonalds 14146 etobicoke on"
export const plainName = (s) => String(s || '').toLowerCase().replace(/['’`]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

// Every name, longest first, each with the category it belongs to.
const RULES = Object.entries(KNOWN)
  .flatMap(([cat, text]) => text.split(',').map((n) => n.trim()).filter(Boolean).map((name) => ({ cat, words: name.replace(/\*$/, ''), open: name.endsWith('*') })))
  .sort((a, b) => b.words.length - a.words.length);

// -> { id, name, income } for the category a description belongs to, or null when the app does not know the merchant.
export function knownCategory(description, income) {
  const text = ` ${plainName(description)} `;
  if (text.length < 4) return null;
  for (const r of RULES) {
    if (income != null && INCOME.has(r.cat) !== !!income) continue;
    if (text.includes(r.open ? ` ${r.words}` : ` ${r.words} `)) return { id: r.cat, name: NAMES[r.cat], income: INCOME.has(r.cat) };
  }
  return null;
}

// A category word from a reading ("Fuel", "Phone", "Subscriptions") as one of the app's own categories.
const GUESS = { fuel: 'transportation', transport: 'transportation', transportation: 'transportation', travel: 'transportation', groceries: 'groceries', dining: 'dining',
  bills: 'utilities', rent: 'housing', housing: 'housing', mortgage: 'housing', 'property tax': 'housing', 'condo fees': 'housing', insurance: 'insurance', loan: 'loan_payments', 'loan payment': 'loan_payments', utilities: 'utilities', phone: 'utilities', internet: 'utilities', shopping: 'shopping', gifts: 'shopping', entertainment: 'entertainment',
  subscriptions: 'entertainment', health: 'healthcare', healthcare: 'healthcare', 'personal care': 'healthcare', salary: 'salary', freelance: 'freelance',
  interest: 'investment', government: 'other_income', refund: 'other_income', 'other income': 'other_income' };
export function guessCategory(guess) {
  const id = GUESS[String(guess || '').toLowerCase().trim()];
  return id ? { id, name: NAMES[id] || id, income: INCOME.has(id) || id === 'freelance' } : null;
}

// The person's own category that stands for a built-in one: the same id, else the same name.
export function ownCategory(known, categories) {
  if (!known) return null;
  const pool = (categories || []).filter((c) => c.is_income == null || !!c.is_income === !!known.income);
  return pool.find((c) => String(c.id) === known.id) || pool.find((c) => String(c.name || '').toLowerCase() === String(known.name).toLowerCase()) || null;
}

// A service that pays a bill for you by card (Chexy and the like). The same name on the statement can be the rent,
// the condo fees, the property tax or the car lease, so the name alone does not say which category it is.
const THROUGH = [['chexy', 'Chexy'], ['plastiq', 'Plastiq'], ['paysimply', 'PaySimply'], ['pay simply', 'PaySimply'], ['paytm', 'Paytm']];
export function throughService(description) {
  const text = ` ${plainName(description)} `;
  const hit = THROUGH.find(([w]) => text.includes(` ${w}`));
  return hit ? hit[1] : null;
}
// What a payment through such a service is for, in this order: the line of the same amount you categorised before
// (the lease is the same amount every month), then a word in the description ("CHEXY RENT"), then Housing.
const WHAT = [[/lease|auto|car |vehicle|financial/, 'transportation'], [/insur|assur/, 'insurance'], [/hydro|utilit|enbridge|water|gas bill|electric/, 'utilities'], [/rent|condo|tax|mortgage|maint|strata/, 'housing']];
export function throughCategory(description, amount, past = []) {
  if (!throughService(description)) return null;
  const a = Number(amount);
  const same = a > 0 && [...past].sort((x, y) => String(y.date).localeCompare(String(x.date)))
    .find((t) => t.category_id && throughService(t.description) === throughService(description) && Math.abs(Number(t.amount) - a) <= Math.max(0.02, a * 0.01));
  if (same) return { category_id: String(same.category_id) };
  const text = ` ${plainName(description)} `;
  const hit = WHAT.find(([re]) => re.test(text));
  const id = hit ? hit[1] : 'housing';
  return { known: { id, name: NAMES[id], income: false } };
}
