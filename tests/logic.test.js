// node tests/logic.test.js
const assert = require("assert");
const B = require("../src/logic.js");

assert.strictEqual(B.ymAdd("2026-11", 2), "2027-01");
assert.strictEqual(B.ymAdd("2027-01", -1), "2026-12");

// Debt payoff: $2,000 at 20% over 18 months
const card = { id: "d1", balance: 2000, apr: 20, months: 18, start: "2026-11", payStart: "2026-11" };
assert.strictEqual(B.debtPayment(card), 129.53);
const s = B.debtSchedule(card, "2029-01");
assert.strictEqual(Object.keys(s).pop(), "2028-04");

// Budget creator leaves paid lines and hand-set amounts alone
const plan = { income: [{ id: "i1", name: "Pay", amount: 2000, freq: "monthly", day: 25 }], bills: [{ id: "b1", name: "Rent", amount: 1000, freq: "monthly", day: 1 }], debts: [] };
let g = B.generate(plan, {}, "2026-11", 2);
assert.deepStrictEqual(Object.keys(g.docs), ["2026-11", "2026-12"]);
const months = g.docs;
months["2026-11"].lines.find(l => l.label === "Rent").done = true;
plan.bills[0].amount = 1100;
g = B.generate(plan, months, "2026-11", 2);
assert.strictEqual(g.changes[0].updates.length, 0);
assert.strictEqual(g.changes[1].updates[0].to, 1100);

// Bi-weekly counting
assert.strictEqual(B.occurrences({ freq: "biweekly", anchor: "2026-10-30" }, "2026-10"), 3);  // Oct 2, 16, 30
assert.strictEqual(B.occurrences({ freq: "biweekly", anchor: "2026-10-30" }, "2027-01"), 2); // Jan 8, 22

// TD EasyWeb CSV: date, description, withdrawal, deposit, balance
const tx = B.parseBank('11/02/2026,PHONE CO,45.00,,353.90\n11/03/2026,PAYROLL DEP,,2500.00,2853.90\n11/03/2026,"SQ *CORNER BAKERY, TOWN",8.25,,3135.45');
assert.deepStrictEqual(tx.map(t => [t.date, t.dir, t.amount]), [["2026-11-02", "out", 45], ["2026-11-03", "in", 2500], ["2026-11-03", "out", 8.25]]);
assert.strictEqual(B.cleanName(tx[2].desc), "Corner Bakery");
// Signed-amount CSV
assert.strictEqual(B.parseBank("Date,Description,Amount\n2026-11-04,Netflix,-16.99")[0].dir, "out");
console.log("all logic tests passed");
