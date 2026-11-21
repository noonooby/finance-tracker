# Finance Tracker

Personal finance tracker: bank accounts, cash, credit and gift cards, loans, income schedules, transfers, reports,
and adding transactions from a screenshot of a bank or card app.

Live at https://finance.nobodystack.com (once deployed).

## How it works

- `server/server.js`: plain Node `http` server with the built-in SQLite (`node:sqlite`), no dependencies.
  Sign-in is Google only. Every row belongs to one user and the server sets and checks that itself.
- Every balance change goes through `/api/money`: the balance changes and the records of one money event are saved
  together or not at all. Amounts are added up in cents. A once-only key stops a schedule or a double click from
  recording the same thing twice. Undo (`/api/transactions/:id/reverse`) puts back exactly what was moved, on the
  same accounts. Limits (overdraft, cash, gift card value, loan balance) are checked inside the same step.
- `src/utils/money.js` is the only place the app builds money events; `src/utils/supabase.js` is the small client for
  the server (it keeps the query style the screens were written with).
- `server/reader.js` reads a screenshot with Gemini and proposes lines; nothing is saved until the user confirms.
  Lines are matched to accounts by card number, then name. Overlapping screenshots are not double counted, and a
  posted line replaces its pending version.

## Run locally

```bash
npm ci
npm run build
NODE_ENV=development DEV_USER=you@example.com PORT=3001 npm run server
```

Open http://localhost:3001 and use "Sign in as the test user". For live reload of the screens, also run `npm start`
(it forwards `/api` to port 3001).

## Tests

```bash
npm run test:scenarios
```

Runs the personal finance scenarios (expenses, cards, refunds, gift cards, overdraft, cash, income schedules,
transfers, loans, undo, edits, two users, screenshots) against a throwaway database. Gemini is never called in tests.

## Settings (environment)

| Name | What it does |
| --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in. Redirect URI: `https://finance.nobodystack.com/auth/google/callback` |
| `ALLOWED_EMAILS` | Comma-separated Google accounts allowed in. Empty: any Google account. |
| `GEMINI_API_KEY` | Reading screenshots. Without it the screenshot page says it is not set up. |
| `GEMINI_MODEL` | Default `gemini-2.5-flash`. |
| `PUBLIC_URL` | Default `https://finance.nobodystack.com`. |
| `DB_PATH` | SQLite file. Default `/data/finance.db` in the container. |

## Deploy (Oracle server, Docker Compose and Caddy)

In the server's deploy folder (the one with `compose.yml`):

1. Clone this repo as `./finance` and create `./finance/.env` with the settings above.
2. Add to `compose.yml`:

   ```yaml
     finance:
       build: ./finance
       restart: unless-stopped
       env_file: ./finance/.env
       volumes: [./finance-data:/data]
       mem_limit: 512m
   ```

3. Add to `Caddyfile`:

   ```
   finance.nobodystack.com {
   	header Strict-Transport-Security "max-age=31536000"
   	encode gzip
   	reverse_proxy finance:8080
   }
   ```

4. DNS: an A record for `finance.nobodystack.com` to the server's address.
5. Add `finance-data` to the nightly backup in `backup.sh`, and `https://finance.nobodystack.com/api/config` to the uptime check.
6. `docker compose up -d --build finance caddy`
