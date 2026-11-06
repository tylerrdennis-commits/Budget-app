// Pure budget logic — no DOM. Shared by the page and the test script.
const BL = (() => {
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const pad = n => String(n).padStart(2, "0");

  function ymAdd(ym, n) {
    let [y, m] = ym.split("-").map(Number);
    m += n;
    y += Math.floor((m - 1) / 12);
    m = (((m - 1) % 12) + 12) % 12 + 1;
    return `${y}-${pad(m)}`;
  }
  function ymRange(from, to) {
    const out = [];
    for (let ym = from; ym <= to; ym = ymAdd(ym, 1)) out.push(ym);
    return out;
  }
  function ymLabel(ym, short) {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-CA", { month: short ? "short" : "long", year: "numeric" });
  }
  function todayYm(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }

  const lineActual = l => (l.items && l.items.length ? r2(l.items.reduce((s, i) => s + (Number(i.amount) || 0), 0)) : l.actual);
  const isOut = l => l.kind !== "income";

  // How many times a recurring item lands in a month.
  function occurrences(t, ym) {
    const f = t.freq || "monthly";
    const [y, m] = ym.split("-").map(Number);
    if (f === "monthly") return 1;
    if (f === "yearly") return Number(t.month || 1) === m ? 1 : 0;
    if (f === "weekly" || f === "biweekly") {
      const step = f === "weekly" ? 7 : 14;
      if (!t.anchor) return f === "weekly" ? 4 : 2;
      const a = new Date(t.anchor + "T12:00:00");
      const first = new Date(y, m - 1, 1, 12), last = new Date(y, m, 0, 12);
      const day = 864e5;
      let k = Math.ceil((first - a) / (step * day));
      let d = new Date(a.getTime() + k * step * day), n = 0;
      while (d <= last) { if (d >= first) n++; d = new Date(d.getTime() + step * day); }
      return n;
    }
    return 1;
  }

  function amortize(P, apr, n) {
    if (!(n > 0)) return P;
    const r = (apr || 0) / 1200;
    return r ? (P * r) / (1 - Math.pow(1 + r, -n)) : P / n;
  }
  const debtPayment = d => r2(d.payment > 0 ? d.payment : amortize(d.balance, d.apr, d.months || 12));

  // Month-by-month plan for one debt: {ym: {pay, bal}}
  function debtSchedule(d, toYm) {
    const out = {};
    if (!d.start) return out;
    let bal = Number(d.balance) || 0;
    const pay = debtPayment(d);
    for (let ym = d.start; ym <= toYm; ym = ymAdd(ym, 1)) {
      bal += (bal * (d.apr || 0)) / 1200;
      let p = 0;
      if (d.payStart && ym >= d.payStart && bal > 0.005) { p = Math.min(pay, bal); bal -= p; }
      out[ym] = { pay: r2(p), bal: r2(Math.max(bal, 0)) };
      if (bal <= 0.005 && d.payStart && ym >= d.payStart) break;
    }
    return out;
  }

  function desiredLines(plan, ym, schedules) {
    const want = [];
    for (const t of plan.income || []) {
      if (t.active === false) continue;
      const n = occurrences(t, ym);
      if (n) want.push({ src: "income:" + t.id, kind: "income", label: t.name, planned: r2(t.amount * n), day: t.day || null });
    }
    for (const t of plan.bills || []) {
      if (t.active === false) continue;
      const n = occurrences(t, ym);
      if (n) want.push({ src: "bill:" + t.id, kind: "bill", label: t.name, planned: r2(t.amount * n), day: t.day || null });
    }
    for (const d of plan.debts || []) {
      const s = schedules[d.id] && schedules[d.id][ym];
      if (s && s.pay > 0) want.push({ src: "debt:" + d.id, kind: "debt", label: d.name, planned: s.pay, day: d.day || null });
    }
    return want;
  }

  let seq = 0;
  const newId = p => p + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);
  const clone = o => JSON.parse(JSON.stringify(o));

  // Budget creator: build or refresh months from the plan. Never touches closed
  // months, lines already paid, or amounts the user edited by hand.
  function generate(plan, months, from, count) {
    const to = ymAdd(from, count - 1);
    const schedules = {};
    for (const d of plan.debts || []) schedules[d.id] = debtSchedule(d, to);
    const changes = [], docs = {};
    for (const ym of ymRange(from, to)) {
      const cur = months[ym];
      const ch = { ym, created: !cur, adds: [], updates: [], removes: [], kept: 0, closed: !!(cur && cur.closed) };
      if (ch.closed) { changes.push(ch); continue; }
      const doc = cur ? clone(cur) : { ym, closed: false, lines: [] };
      const want = desiredLines(plan, ym, schedules);
      const wantSrc = new Set(want.map(w => w.src));
      for (const w of want) {
        const l = doc.lines.find(x => x.src === w.src);
        if (!l) {
          doc.lines.push({ id: newId("l"), kind: w.kind, label: w.label, src: w.src, planned: w.planned, actual: null, done: false, manual: false, items: [], day: w.day });
          ch.adds.push({ label: w.label, amount: w.planned });
        } else if (l.done || l.manual) {
          ch.kept++;
        } else if (r2(l.planned) !== w.planned || l.label !== w.label || (l.day || null) !== w.day) {
          if (r2(l.planned) !== w.planned) ch.updates.push({ label: w.label, from: r2(l.planned), to: w.planned });
          l.planned = w.planned; l.label = w.label; l.day = w.day;
        }
      }
      doc.lines = doc.lines.filter(l => {
        if (!l.src || wantSrc.has(l.src)) return true;
        const used = l.done || (l.items && l.items.length) || l.actual != null;
        if (used) return true;
        ch.removes.push({ label: l.label, amount: r2(l.planned) });
        return false;
      });
      if (ch.created || ch.adds.length || ch.updates.length || ch.removes.length) docs[ym] = doc;
      changes.push(ch);
    }
    return { changes, docs };
  }

  function totals(m) {
    const t = { inPlan: 0, inAct: 0, outPlan: 0, outAct: 0, due: 0, dueN: 0, unplanned: 0, waiting: 0 };
    for (const l of (m && m.lines) || []) {
      const a = lineActual(l);
      if (isOut(l)) {
        t.outPlan += Number(l.planned) || 0;
        if (a != null) t.outAct += a;
        if (!l.done && (Number(l.planned) || 0) > 0) { t.due += Number(l.planned) || 0; t.dueN++; }
        if (!(Number(l.planned) > 0) && a) t.unplanned += a;
      } else {
        t.inPlan += Number(l.planned) || 0;
        if (a != null && l.done) t.inAct += a;
        if (!l.done) t.waiting += Number(l.planned) || 0;
      }
    }
    for (const k in t) t[k] = r2(t[k]);
    return t;
  }

  // ---------- bank CSV ----------
  function parseCSV(text) {
    const rows = []; let row = [], f = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(f); f = ""; if (row.some(x => x.trim() !== "")) rows.push(row); row = [];
      } else f += c;
    }
    row.push(f); if (row.some(x => x.trim() !== "")) rows.push(row);
    return rows;
  }
  function parseDate(s) {
    s = (s || "").trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // TD EasyWeb: MM/DD/YYYY
    if (m) return `${m[3]}-${pad(m[1])}-${pad(m[2])}`;
    const d = new Date(s);
    if (s && !isNaN(d) && /[a-z]/i.test(s) && /\d{4}/.test(s)) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return null;
  }
  const parseNum = s => {
    const t = String(s || "").replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
    return t === "" || isNaN(Number(t)) ? null : Number(t);
  };

  function parseBank(text) {
    const rows = parseCSV(text);
    const out = [], seen = {};
    let hdr = null;
    for (const r of rows) {
      const di = r.findIndex(x => parseDate(x));
      if (di < 0) { hdr = r.map(x => x.trim().toLowerCase()); continue; }
      const date = parseDate(r[di]);
      let desc = "", descI = -1;
      for (let i = 0; i < r.length; i++) {
        if (i === di) continue;
        if (r[i].trim() && parseNum(r[i]) === null && !parseDate(r[i])) { desc = r[i].trim(); descI = i; break; }
      }
      if (descI < 0) continue;
      let amount = null, dir = "out";
      const col = name => hdr ? hdr.findIndex(h => h.includes(name)) : -1;
      const debitI = col("debit") >= 0 ? col("debit") : col("withdraw");
      const creditI = col("credit") >= 0 ? col("credit") : col("deposit");
      const amtI = col("amount");
      if (debitI >= 0 || creditI >= 0) {
        const d = parseNum(r[debitI]), c = parseNum(r[creditI]);
        if (d) { amount = Math.abs(d); dir = "out"; } else if (c) { amount = Math.abs(c); dir = "in"; }
      } else if (amtI >= 0) {
        const a = parseNum(r[amtI]);
        if (a) { amount = Math.abs(a); dir = a < 0 ? "out" : "in"; }
      } else {
        // TD layout: date, description, withdrawal, deposit, balance
        const a = parseNum(r[descI + 1]), b = parseNum(r[descI + 2]);
        const width = r.length - descI - 1;
        if (width >= 2) {
          if (a) { amount = Math.abs(a); dir = "out"; } else if (b) { amount = Math.abs(b); dir = "in"; }
        } else if (a) { amount = Math.abs(a); dir = a < 0 ? "out" : "in"; }
      }
      if (!amount) continue;
      const base = `${date}|${desc.toUpperCase()}|${amount.toFixed(2)}|${dir}`;
      seen[base] = (seen[base] || 0) + 1;
      out.push({ date, desc, amount: r2(amount), dir, key: `${base}|${seen[base]}` });
    }
    return out;
  }

  // Payee words without card-processor prefixes, store numbers or web addresses.
  function payeeWords(desc) {
    return desc.toUpperCase()
      .replace(/^(SQ|TST|SP|PP|PAYPAL|POS|IDP|VISA DEBIT|INTERAC)\s*\*?\s*/, "")
      .replace(/\S+\.(COM|CA|NET|ORG)\S*/g, " ")
      .replace(/[^A-Z0-9 &']/g, " ").replace(/\b\d+\b/g, " ")
      .split(/\s+/).filter(Boolean);
  }
  function cleanName(desc) {
    const w = payeeWords(desc).slice(0, 2);
    if (!w.length) return desc;
    return w.map(x => x.length <= 3 && w.length > 1 && /^[A-Z]+$/.test(x) && x !== w[0] ? x.toLowerCase() : x[0] + x.slice(1).toLowerCase()).join(" ");
  }
  function keyword(desc) {
    const w = payeeWords(desc);
    if (!w.length) return desc.toUpperCase().trim();
    return w[0].length >= 4 || w.length === 1 ? w[0] : w.slice(0, 2).join(" ");
  }

  // Suggest where a transaction goes: an existing line in the month, or a new one.
  function suggest(t, rules, lines) {
    const D = " " + t.desc.toUpperCase() + " ";
    const pool = lines.filter(l => (t.dir === "in") === (l.kind === "income"));
    for (const r of rules || []) {
      if (r.dir && r.dir !== t.dir) continue;
      if (D.includes(r.match.toUpperCase())) {
        if (r.label === "__skip") return { target: "skip", why: "rule" };
        const l = pool.find(x => x.label.toLowerCase() === r.label.toLowerCase());
        return l ? { target: "line:" + l.id, why: "rule" } : { target: "new", name: r.label, why: "rule" };
      }
    }
    for (const l of pool) {
      const tok = l.label.toUpperCase().split(/\s+/).find(x => x.replace(/[^A-Z]/g, "").length >= 3);
      if (tok && D.includes(tok.replace(/[^A-Z0-9 ]/g, ""))) return { target: "line:" + l.id, why: "name" };
    }
    return { target: "new", name: cleanName(t.desc), why: "" };
  }

  return { r2, ymAdd, ymRange, ymLabel, todayYm, lineActual, isOut, occurrences, amortize, debtPayment, debtSchedule,
    desiredLines, generate, totals, parseCSV, parseDate, parseBank, cleanName, keyword, suggest, newId, clone };
})();
if (typeof module !== "undefined") module.exports = BL;
