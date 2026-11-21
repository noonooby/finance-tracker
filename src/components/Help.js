import React, { useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { OTHER_APPS } from '../utils/apps';

// The guide. Each section has an id so other pages can link to /help#id.
const SECTIONS = [
  ['start', 'Getting started', (
    <ol>
      <li><b>Add your accounts</b> on the <Link to="/bank-accounts">Accounts</Link> tab: chequing, savings, and how much cash you carry. Enter each balance as your bank app shows it today.</li>
      <li><b>Add your cards and loans</b> from <Link to="/more">More</Link>: Cards and Loans. For a credit card, the balance is what you owe.</li>
      <li><b>Record money as it moves</b>: tap the round <b>+</b> button for a purchase or a payment, or the <Link to="/screenshot">Scan</Link> tab to add lines from a screenshot of your bank or card app.</li>
      <li><b>Set up your pay</b> under More, Income, so it is added on payday by itself.</li>
    </ol>
  )],
  ['adding', 'Adding a purchase or a payment', (
    <>
      <p>Tap the round <b>+</b> button. Choose <b>Expense</b> for something you bought, or <b>Payment</b> for paying a credit card or a loan.</p>
      <ul>
        <li>Pick what you paid with: a bank account, a card, or cash in hand. That balance changes at once.</li>
        <li>A purchase on a credit card adds to what you owe on it. Paying the card lowers both the card and the account you paid from.</li>
        <li>Paying more than a card's balance leaves a credit on the card, as your bank would show it.</li>
      </ul>
    </>
  )],
  ['scan', 'Adding from a screenshot or a photo', (
    <>
      <p>On the <Link to="/screenshot">Scan</Link> tab, take a photo of a receipt, or choose a screenshot of your bank or card app. The app reads it and lists every line it found. Nothing is saved until you tick the lines you want and tap <b>Record</b>.</p>
      <ul>
        <li>Each line is matched to your account by the last four digits of the card, or by the account's name. If it can't tell, it asks you to choose.</li>
        <li>Two identical lines in one screenshot (two coffees on the same day) are two purchases.</li>
        <li>Screenshots that overlap are safe: a line already added from an earlier screenshot is skipped.</li>
        <li>A line that was pending and has now posted updates the pending one instead of adding it again.</li>
        <li>If the screenshot shows a balance different from the app's, you can choose to correct it.</li>
      </ul>
    </>
  )],
  ['position', 'Where you stand: net worth and what is out of date', (
    <>
      <p><Link to="/position">Where you stand</Link> adds up what you have (accounts, cash, investments, property, gift cards) and what you owe (cards, loans, the mortgage). The mortgage is counted, and also shown apart so you can see your other debt on its own.</p>
      <ul>
        <li>Each figure shows the day it was last updated. One older than 35 days is marked out of date. Tap <b>Update</b> and type today's figure; it is saved as a correction you can undo.</li>
        <li>The month ahead takes what you can spend now, adds pay due before the month ends and takes off loan and card payments due by then.</li>
        <li>The line chart is your net worth on each day a figure changed.</li>
      </ul>
    </>
  )],
  ['investments', 'Investments, property and mortgages', (
    <>
      <p>Add a TFSA, RRSP, brokerage account or your home under <Link to="/investments">Investments and property</Link>, with what it is worth today. Update the value when you check it. Money you put in from a bank account is a <b>contribution</b>: it leaves the bank account and adds to the investment.</p>
      <p>For a mortgage or a loan with a rate, set the rate and the kind on the loan. Each payment is then split: the interest for the period first, and only the rest lowers what you owe. Mortgages in Canada add interest twice a year, and that is the default for the Mortgage kind. The loan shows the payoff date and the interest still to pay.</p>
    </>
  )],
  ['accounts', 'Accounts, cash and transfers', (
    <>
      <p>The <Link to="/bank-accounts">Accounts</Link> tab lists your bank accounts and the cash you carry. <b>Transfer</b> moves money between two of your accounts; <b>Withdraw</b> and <b>Deposit</b> move money between a bank account and cash.</p>
      <p>An account can allow an overdraft up to a limit you set. A purchase that would go past the limit is refused and nothing is saved. Cash and gift cards can't go below zero.</p>
      <p>If a balance is wrong, edit the account and enter the right figure. For cash, use the pencil on Cash in hand: that change is kept as a correction in your transactions.</p>
    </>
  )],
  ['cards', 'Credit cards and gift cards', (
    <>
      <p>Under More, Cards. A credit card's balance is what you owe. A gift card's balance is the value left on it; spending from it lowers it, and it can't go below zero.</p>
      <p>With a payment account connected, a card's payment is made on its due date. If a date passed while the app was closed, it is paid the next time you open it, never more than what you owe. If the account doesn't have enough, the payment waits and the card shows it as due.</p>
    </>
  )],
  ['loans', 'Loans', (
    <>
      <p>Under More, Loans. Enter what you owe, the regular payment and how often it is due. Tap <b>Make Payment</b> on a loan to record a payment. A payment larger than what is left is refused.</p>
      <p>With a payment account connected, each payment is made on its due date, once.</p>
    </>
  )],
  ['income', 'Income and pay schedules', (
    <>
      <p>Under More, Income. Add one-off money, or a schedule (weekly, every two weeks, monthly). On each payday the amount goes into the account you chose.</p>
      <p>Each payday is added once, even if you have the app open on two devices. If you haven't opened the app for a while, every missed payday is added when you do.</p>
    </>
  )],
  ['undo', 'Fixing mistakes', (
    <>
      <p>Delete a transaction from <Link to="/transactions">Transactions</Link>, or undo it from <Link to="/activity">Activity</Link>. The money goes back to exactly the account it came from.</p>
      <p>To change an amount on a pay or income entry, delete it and add it again.</p>
    </>
  )],
  ['reports', 'Reports and backup', (
    <>
      <p><Link to="/reports">Reports</Link> show spending by category, by month and by payment method.</p>
      <p>Settings, Backup and data management, downloads all your data as a file you can keep, and can restore it.</p>
    </>
  )],
  ['install', 'Put it on your phone', (
    <ul>
      <li><b>iPhone</b>: open this page in Safari, tap the Share button, then <b>Add to Home Screen</b>.</li>
      <li><b>Android</b>: open it in Chrome, tap the menu, then <b>Install app</b> or <b>Add to Home screen</b>.</li>
    </ul>
  )],
  ['privacy', 'Your data', (
    <p>You sign in with Google. Only you can see your accounts and transactions. Screenshots are read by Google's Gemini to find the lines, and are not stored by this app.</p>
  )],
  ['apps', 'Your other apps', (
    <ul>
      {OTHER_APPS.map((a) => (
        <li key={a.id}><a href={a.url} target="_blank" rel="noopener noreferrer">{a.name}</a>: {a.what.toLowerCase()}.</li>
      ))}
    </ul>
  )],
];

export default function Help({ darkMode }) {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById('h-' + hash.slice(1));
    if (el) el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }, [hash]);
  const card = `help rounded-2xl border p-4 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`;
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className="space-y-4">
      <div className={card}>
        <h1 className="text-2xl font-bold">Help</h1>
        <p className={`text-sm ${muted}`}>How the app works. Tap a topic.</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm">
          {SECTIONS.map(([id, title]) => <a key={id} href={`#${id}`} className="text-blue-600 dark:text-blue-400">{title}</a>)}
        </div>
      </div>
      {SECTIONS.map(([id, title, body]) => (
        <section key={id} id={'h-' + id} className={card} style={{ scrollMarginTop: 16 }}>
          <h2 className="text-lg font-semibold mb-2">{title}</h2>
          {body}
        </section>
      ))}
    </div>
  );
}
