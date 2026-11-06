# BudgetApp

A monthly budget you plan ahead and then reconcile. It replaces the earlier Windows desktop version (.NET/WPF + SQLite).

- **Budget creator** (Plan tab): set up income, recurring bills (monthly, every 2 weeks, weekly, yearly) and debt payoff plans, then build any range of months from them. You get a preview first. Closed months, lines already marked paid, and amounts you changed by hand are never overwritten.
- **Month view**: planned vs. actual for every line, a check-off for paid or received, per-line transactions, unplanned spending, and closing a month.
- **Bank import**: drop in a CSV export from TD EasyWeb (or any bank CSV with date, description and amount columns). Each transaction is matched to a line, and your corrections are saved as payee rules for next time. Transactions you've already imported are skipped.
- **Overview**: cash-flow chart, projected bank balance, debt payoff dates.

## Two ways to run it

- **Windows app** (`desktop/`): an installer built by GitHub Actions (see *Actions → Windows app → BudgetApp-Setup*). The budget is stored in `%APPDATA%\BudgetApp\budget.json`, with a `.bak` copy kept from the last launch. Each person who installs it starts with an empty budget.
- **Web**: `index.html` published as a claude.ai Artifact, with data in that artifact's private per-user store.

The two don't sync. Use **Plan → Backup** to move a budget from one to the other.

The installer isn't code-signed, so Windows SmartScreen shows "Windows protected your PC" the first time. Click *More info → Run anyway*.

**This repository is public. Never commit budget data, bank CSVs or database files.** `.gitignore` blocks the common ones.

## Layout

| Path | What it is |
|---|---|
| `src/app.html` | Page markup, styles and UI code |
| `src/logic.js` | Pure budget logic: month generation, debt schedules, totals, CSV parsing, payee matching |
| `build.py` | Inlines `logic.js` into `app.html` → `index.html` |
| `index.html` | Built page (what gets published) |
| `desktop/` | Electron wrapper: `main.js` (window + file storage), `preload.js`, installer settings in `package.json` |
| `.github/workflows/windows.yml` | Builds the Windows installer on every push to `main` |
| `tests/logic.test.js` | `node tests/logic.test.js` |
| `tools/convert_budget_db.py` | One-time importer from the old desktop app's `budget.db` |

## Data model

- `plan`: profile (bank balance), `income[]`, `bills[]`, `debts[]`, `savings[]`, `rules[]` (payee → line)
- `m-YYYY-MM`: `{ym, closed, lines[]}`. Each line is `{id, kind: income|bill|debt|spend, label, src, planned, actual, done, manual, items[]}`. When `items` is non-empty, the actual amount is their sum.
- `imports`: keys of bank transactions already imported, used to skip duplicates.
