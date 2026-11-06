# BudgetApp

A monthly budget you plan ahead and then reconcile. It replaces the earlier Windows desktop version (.NET/WPF + SQLite).

- **Budget creator** (Plan tab): set up income, recurring bills (monthly, every 2 weeks, weekly, yearly) and debt payoff plans, then build any range of months from them. You get a preview first. Closed months, lines already marked paid, and amounts you changed by hand are never overwritten.
- **Month view**: planned vs. actual for every line, a check-off for paid or received, per-line transactions, unplanned spending, and closing a month.
- **Bank import**: drop in a CSV export from TD EasyWeb (or any bank CSV with date, description and amount columns). Each transaction is matched to a line, and your corrections are saved as payee rules for next time. Transactions you've already imported are skipped.
- **Overview**: cash-flow chart, projected bank balance, debt payoff dates.

## How it runs

`index.html` is one self-contained page published as a claude.ai Artifact. Budget data lives in that artifact's private per-user store (`data/users/<you>/…`), not in this repo.

**This repository is public. Never commit budget data, bank CSVs or database files.** `.gitignore` blocks the common ones.

## Layout

| Path | What it is |
|---|---|
| `src/app.html` | Page markup, styles and UI code |
| `src/logic.js` | Pure budget logic: month generation, debt schedules, totals, CSV parsing, payee matching |
| `build.py` | Inlines `logic.js` into `app.html` → `index.html` |
| `index.html` | Built page (what gets published) |
| `tests/logic.test.js` | `node tests/logic.test.js` |
| `tools/convert_budget_db.py` | One-time importer from the old desktop app's `budget.db` |

## Data model

- `plan`: profile (bank balance), `income[]`, `bills[]`, `debts[]`, `savings[]`, `rules[]` (payee → line)
- `m-YYYY-MM`: `{ym, closed, lines[]}`. Each line is `{id, kind: income|bill|debt|spend, label, src, planned, actual, done, manual, items[]}`. When `items` is non-empty, the actual amount is their sum.
- `imports`: keys of bank transactions already imported, used to skip duplicates.
