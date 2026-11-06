"""Convert the old BudgetApp desktop SQLite db into JSON docs for the web app.
Usage: python3 tools/convert_budget_db.py budget.db out_dir   (out_dir is git-ignored data; never commit it)"""
import json, os, sqlite3, sys

db, out = sys.argv[1], sys.argv[2]
CURRENT = "2026-11"  # months before this are history
os.makedirs(out, exist_ok=True)
c = sqlite3.connect(db)
c.row_factory = sqlite3.Row
q = lambda s, *a: [dict(r) for r in c.execute(s, a)]
num = lambda v: round(float(v), 2) if v not in (None, "") else None

p = q("select * from profiles")[0]
pid = p["id"]

bills = [dict(id=f"b{r['id']}", name=r["name"], amount=num(r["amount"]), freq=r["frequency"].lower(),
              day=r["anchor_day"], fixed=bool(r["always_amount"]))
         for r in q("select * from bill_templates where profile_id=?", pid)]
income = [dict(id=f"i{r['id']}", name=r["name"], amount=num(r["expected_amount"]), freq=r["frequency"].lower(),
               day=r["anchor_day"], fixed=bool(r["always_amount"]), active=bool(r["active"]))
          for r in q("select * from income_sources where profile_id=?", pid)]
debts = []
for r in q("select * from debts where profile_id=?", pid):
    # first month the old app actually scheduled a payment
    first = q("select min(year_month) m from month_lines where kind='DebtPayment' and source_ref=? and cast(amount as real)>0",
              r["id"])[0]["m"]
    debts.append(dict(id=f"d{r['id']}", name=r["name"], balance=num(r["balance"]), apr=num(r["apr_percent"]) or 0,
                      months=r["repay_months"], start=r["start_month"], payStart=first,
                      payment=num(r["payment_amount"])))
savings = [dict(id=f"s{r['id']}", name=r["name"], balance=num(r["balance"]))
           for r in q("select * from savings_accounts where profile_id=?", pid)]

src_prefix = {"Bill": "bill:b", "Income": "income:i", "DebtPayment": "debt:d"}
kind_map = {"Bill": "bill", "Income": "income", "DebtPayment": "debt", "Other": "spend"}
receipts = {}
for r in q("select * from bill_receipts where profile_id=? order by receipt_date, id", pid):
    receipts.setdefault(r["line_id"], []).append(
        dict(id=f"r{r['id']}", desc=r["description"], amount=num(r["amount"]), date=r["receipt_date"]))

months = {}
for m in q("select year_month from months where profile_id=? order by year_month", pid):
    months[m["year_month"]] = dict(ym=m["year_month"], closed=m["year_month"] < CURRENT, lines=[], inbox=[])

for r in q("select * from month_lines where profile_id=? order by year_month, id", pid):
    ym = r["year_month"]
    months.setdefault(ym, dict(ym=ym, closed=ym < CURRENT, lines=[], inbox=[]))
    kind = kind_map[r["kind"]]
    src = None
    if r["source_ref"] is not None and r["kind"] in src_prefix:
        src = f"{src_prefix[r['kind']]}{r['source_ref']}"
    else:
        # variable spending lines the old app stored as Bill without a template
        kind = "spend" if kind == "bill" else kind
    amt = num(r["amount"])
    planned = num(r["recommended_amount"]) if r["recommended_amount"] not in (None, "") else amt
    items = receipts.get(r["id"], [])
    done = bool(r["paid"]) or bool(r["income_received"])
    if items:
        actual = None  # derived from items in the app
    elif done or ym < CURRENT:
        actual = amt
    else:
        actual = None
    months[ym]["lines"].append(dict(id=f"l{r['id']}", kind=kind, label=r["label"], src=src, planned=planned,
                                    actual=actual, done=done or ym < CURRENT, manual=bool(r["override_flag"]),
                                    items=items))

plan = dict(
    profile=dict(name=p["name"], currency=p["currency"], startMonth=p["start_month"],
                 openingBalance=num(p["opening_balance"]), bankBalance=num(p["bank_balance"])),
    bills=bills, income=income, debts=debts, savings=savings, rules=[],
    importedFrom="BudgetApp desktop (budget.db)",
)
json.dump(plan, open(f"{out}/plan.json", "w"), indent=1)
for ym, m in months.items():
    json.dump(m, open(f"{out}/m-{ym}.json", "w"), indent=1)

# sanity summary
tot = lambda ym, k, f: round(sum((sum(i["amount"] for i in l["items"]) if (f == "actual" and l["items"]) else (l[f] or 0))
                                 for l in months[ym]["lines"] if l["kind"] == k), 2)
print("months", len(months), "lines", sum(len(m["lines"]) for m in months.values()),
      "items", sum(len(l["items"]) for m in months.values() for l in m["lines"]))
for ym in ("2026-09", "2026-10", "2026-11", "2026-12"):
    print(ym, {k: (tot(ym, k, "planned"), tot(ym, k, "actual")) for k in ("income", "bill", "debt", "spend")})
print(json.dumps(debts))
