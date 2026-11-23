import React, { useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { OTHER_APPS } from '../utils/apps';

// The guide. Each section has an id so other pages can link to /help#id.
const SECTIONS = [
  ['start', 'Getting started', (
    <ol>
      <li><b>Add your accounts</b> on the <Link to="/bank-accounts">Accounts</Link> tab: chequing, savings, and an account of kind <b>Cash</b> for the cash you carry. Enter each balance as your bank app shows it today, and count your cash.</li>
      <li><b>Add your cards and loans</b> from <Link to="/more">More</Link>: Cards and Loans. For a credit card, the balance is what you owe.</li>
      <li><b>Record money as it moves</b>: tap the round <b>+</b> button for a purchase or a payment, or the <Link to="/screenshot">Scan</Link> tab to add lines from a screenshot of your bank or card app.</li>
      <li><b>Set up your pay</b> under More, Income, so it is added on payday by itself.</li>
    </ol>
  )],
  ['home', 'Home', (
    <p>Home shows your net worth today, what you can spend, where you will be at the end of the month and what your debts cost each month. Below that: any balance that doesn't add up, payments in the next 30 days (marked autopay or you pay), what each debt costs you, and your latest transactions.</p>
  )],
  ['adding', 'Adding a purchase or a payment', (
    <>
      <p>Tap the round <b>+</b> button. Choose <b>Expense</b> for something you bought, or <b>Payment</b> for paying a credit card or a loan.</p>
      <ul>
        <li>Pick what you paid with: one of your accounts (Cash is one of them) or a card. That balance changes at once.</li>
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
        <li><b>Snapshots.</b> A balance you give (Update, or a screenshot) is a fixed point for that day. Lines dated before it, found later on a statement or an older screenshot, are kept as history and don't change today's balance again.</li>
        <li><b>Checks.</b> If a balance you saw differs from what the app's lines add up to, the difference is shown under Checks. It is either corrected (recorded as an adjustment you can undo) or left open until you add the missing lines. Nothing is changed silently.</li>
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
      <p>The <Link to="/bank-accounts">Accounts</Link> tab lists all your accounts in one list. Cash is one of them: tap <b>Add Account</b> and choose the kind <b>Cash</b>. It works like any other account; you pay with it, receive money into it and see it in your totals.</p>
      <p><b>Transfer</b> moves money between two of your accounts. Taking cash out of the bank is a transfer from the bank account to Cash; putting cash in is a transfer from Cash to the bank account.</p>
      <p>A bank account can allow an overdraft up to a limit you set, with its monthly fee, fee each time it is used and interest rate, so Home can show what it costs. A purchase that would go past the limit is refused and nothing is saved. Cash and gift cards can't go below zero: a purchase with more than the cash you have is refused.</p>
      <p>If a balance is wrong, edit the account and enter the right figure. This works the same for Cash: count it and enter what you have.</p>
    </>
  )],
  ['cards', 'Credit cards and gift cards', (
    <>
      <p>Under More, Cards. A credit card's balance is what you owe. A gift card's balance is the value left on it; spending from it lowers it, and it can't go below zero. Buying a gift card takes the price from what you paid with and adds the value to the card in one step.</p>
      <ul>
        <li><b>Autopay.</b> Choose whether the card is paid by you or automatically, from which account, and how much: the statement balance, the minimum, or a fixed amount. Automatic payments are made on the due date, once. If a date passed while the app was closed, it is paid the next time you open it, never more than what you owe.</li>
        <li><b>Paying it yourself.</b> A payment you record within 25 days before the due date, or after it, moves the due date to the same day next month. Undoing the payment puts the date back.</li>
        <li><b>Rates and fees.</b> Enter the purchase rate, cash advance rate, annual fee and any promotional rate with its end date. <b>Look up rates</b> fills in the card's public rates; only the card's name is sent. If you have a personal rate, type it over.</li>
      </ul>
    </>
  )],
  ['loans', 'Loans, mortgages, leases and payment plans', (
    <>
      <p>Under More, Loans. Choose the kind: loan, mortgage, line of credit, car lease, buy now pay later (Klarna, Affirm), equal payment plan, or student loan. Enter what you owe, the rate, the regular payment and how often it is due, and any setup fee.</p>
      <ul>
        <li>Tap <b>Make Payment</b> to record a payment. A payment larger than what is left is refused. With a payment account connected, each payment is made on its due date, once.</li>
        <li><b>Equal payment plan inside a card.</b> Choose the card the plan lives on. The plan's balance is already part of the card, so it is not counted twice; each instalment moves from the plan to the card's bill on its date.</li>
      </ul>
    </>
  )],
  ['statements', 'Statements and older history', (
    <>
      <p>On the Scan tab you can also add a PDF statement. The app reads the period, the closing balance and every line. Lines from before your latest balance are kept as history and don't change today's balance. If the statement's closing balance doesn't match what the lines add up to, the difference is shown under Checks, with the day, so you can add what is missing.</p>
    </>
  )],
  ['income', 'Income and pay schedules', (
    <>
      <p>Under More, Income. Add one-off money, or a schedule (weekly, every two weeks, monthly). On each payday the amount goes into the account you chose.</p>
      <p>Each payday is added once, even if you have the app open on two devices. If you haven't opened the app for a while, every missed payday is added when you do.</p>
    </>
  )],
  ['learning', 'Categories it learns', (
    <>
      <p>When you save a purchase or income with a category, the app remembers that category for the merchant. Next time, on the + button, Scan or an Excel upload, it fills it in for you. It only fills an empty category, and you can always change it; your change is learned too.</p>
      <p>Settings, Learned categories, lists everything it has learned. You can change a category, fix a rule so learning leaves it alone, delete a rule, add your own, or turn learning off.</p>
    </>
  )],
  ['budgets', 'Budgets', (
    <>
      <p>Set a monthly amount for a category under Settings, Category budgets. The app shows what the last three months cost on average as a starting point.</p>
      <p>Home shows each budget for this month: what you spent, what is left, and a mark for how far through the month you are. The bar turns amber when spending runs ahead of the month and red when the budget is passed. Refunds count back, and each part of a split purchase counts in its own category.</p>
      <p>Budget History in Settings shows the last six months, worked out from your transactions, so it is always current.</p>
    </>
  )],
  ['bills', 'Bills that repeat', (
    <>
      <p>When the same merchant is paid at a steady interval and amount (three times, or twice a year apart), the app offers it as a bill on Home and under More, <Link to="/bills">Bills</Link>. Track it, or say it is not a bill and it is not offered again.</p>
      <p>Tracked bills show in the next 30 days on Home, marked when the payment is recorded. A bill paid from a bank account counts in the month end; one charged to a card is paid when the card is. The app never pays a bill: you record the payment as usual. You can change the name, amount, how often and the next date, or stop tracking.</p>
    </>
  )],
  ['changing', 'Changing a saved line or a pay schedule', (
    <p>On Transactions, tap the pencil on a line to change its description, category and notes. For a plain purchase you can also change the amount, the date and the account it was paid from: the old line is taken back and the new one recorded together, so balances always match. Payments, transfers, split purchases and purchases in another currency keep their money as it was; delete and record those again. On Income, the pencil on a pay schedule changes who pays, the amount, how often, the next pay day and the accounts; it applies from the next pay day.</p>
  )],
  ['through', 'Card rewards, and paying through a service such as Chexy', (
    <p>On a card, enter its rewards rate, its rate on bill payments if that is different, and a rate of its own for up to six categories (for example 4% on groceries). Cards then shows about what each card gave back this month and last. On a loan, lease or bill that you pay by card through a service, enter the service's name and its fee (for example Chexy, 1.75). The app shows the fee each time and which of your cards comes out best once its rewards are counted. When you record a loan or lease payment from a card, the fee is added as its own purchase on that card. If the fee or a card's rate changes, change the number and everything follows.</p>
  )],
  ['ahead', 'The weeks ahead and paying debt down', (
    <p>Under More, The weeks ahead lists pay coming in and payments going out of your accounts day by day, with what is left after each day and the lowest point. Everyday spending is not guessed. Paying debt down shows which debt to put extra money on, when each one ends, and how much interest that saves against your usual payments. Neither screen moves money.</p>
  )],
  ['year', 'The year, for tax time', (
    <p>Under More, The year adds up one calendar year: money in by source, spending by category, interest paid on loans, and fees. Two files can be downloaded and opened in any spreadsheet: the totals, and every line of the year.</p>
  )],
  ['goals', 'Savings goals', (
    <p>Under More, Savings goals: give a goal a name, an amount and, if you like, a date and the account the money is kept in. The goal reads that account's balance; two goals in one account are filled in the order you made them, so no dollar counts twice. With a date, the app shows what to put aside each month. The app never moves money for a goal.</p>
  )],
  ['pay-split', 'Pay that lands in more than one account', (
    <p>When you add income, tap "Send part of it to another account" to send a fixed amount to one or two other accounts; the rest goes to the main one. It stays one line, so one undo puts all of it back. "Fill in from a pay slip or Workday screenshot" reads who pays, how much, the pay day and the accounts, and fills the form for you to check. An account it could not match is named so you can choose it.</p>
  )],
  ['bank-files', 'Bank files and statements', (
    <p>On Scan you can also choose a file exported by your bank (CSV). Say which account it is from and every line is read exactly as written, with no guessing; anything the file leaves open is stated above the lines. For a statement PDF, the app checks that the opening balance and the lines read give the closing balance, and says by how much they differ if a line was missed.</p>
  )],
  ['ask', 'Ask or tell', (
    <p>Under More, Ask or tell: ask a question such as "How much did I spend on groceries this month?" and the answer comes from the app's own figures. Or type what you spent or received, such as "coffee 4.50 on my Visa yesterday": it opens the same check screen as a screenshot, and nothing is saved until you tap Save.</p>
  )],
  ['notices', 'Things to look at', (
    <p>Home lists charges worth a second look: one at least twice what you usually pay that merchant, the same charge twice in one day, a bill whose price moved, and a goal whose date has passed. Tap "Seen" to clear a charge. On Bills, a changed price can be taken as the new usual amount or kept as it was.</p>
  )],
  ['credit', 'Credit score', (
    <p>Under More, Credit score: enter the score from Equifax, TransUnion or any other bureau on the day you check it, or choose a screenshot of it and check what was read. The app keeps each one and shows how it moved since the one before.</p>
  )],
  ['split', 'Splitting a purchase', (
    <>
      <p>On the + button, under the category, choose Split across categories and give each part a category and amount. The parts must add up to the purchase. The money moves once; reports and budgets count each part.</p>
      <p>When Scan reads a receipt, its items are kept with the purchase. Give an item its own category to split the purchase; tax and other differences go to the largest part.</p>
    </>
  )],
  ['currency', 'Other currencies', (
    <>
      <p>On the + button, choose the currency next to the amount and enter what it cost there. The app fills in the dollars from the published rate for that day; your card may charge a little more, so change it to what the card charged if you know it. The original amount and currency stay on the line.</p>
      <p>Scan does the same for a line shown only in another currency.</p>
    </>
  )],
  ['reminders', 'Reminders and using it offline', (
    <>
      <p>Settings, Reminders, turns on notifications for the device you are using: two days before and on the day a payment is due, for cards and loans you pay yourself and bills you track. On iPhone and iPad, add the app to the Home Screen first (Share, Add to Home Screen) and turn reminders on from there.</p>
      <p>The app keeps a copy of your figures on the device. Without a connection it still opens and shows them, with the time they were saved. Changes need a connection.</p>
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

export default function Help() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById('h-' + hash.slice(1));
    if (el) el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }, [hash]);
  const card = 'help rounded-2xl border border-line bg-surface p-4';
  const muted = 'text-muted';

  return (
    <div className="space-y-4">
      <div className={card}>
        <h1 className="text-2xl font-bold">Help</h1>
        <p className={`text-sm ${muted}`}>How the app works. Tap a topic.</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm">
          {SECTIONS.map(([id, title]) => <a key={id} href={`#${id}`} className="text-accent">{title}</a>)}
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
