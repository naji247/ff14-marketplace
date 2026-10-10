/* Shared helpers for the Famfrit market pages: Universalis API access, formatting,
   the market-board item index, pricing rules and the item search box. */
const API = "https://universalis.app/api/v2";
const WORLD = "Famfrit";
const WORLD_ID = 35;
// Retainer city IDs used by Universalis listings, mapped to the keys of /tax-rates.
const CITY = { 1: "Limsa Lominsa", 2: "Gridania", 3: "Ul'dah", 4: "Ishgard", 7: "Kugane", 10: "Crystarium", 12: "Old Sharlayan", 14: "Tuliyollal" };

const $ = s => document.querySelector(s);
const fmt = n => n == null || Number.isNaN(n) ? "–" : Math.round(n).toLocaleString("en-US");
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
function median(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function pct(a, p) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; }
function ageText(ms) { if (!ms) return "never"; const m = (Date.now() - ms) / 60000; if (m < 60) return Math.max(1, Math.round(m)) + "m"; const h = m / 60; if (h < 48) return Math.round(h) + "h"; return Math.round(h / 24) + "d"; }
function ageClass(ms) { if (!ms) return "old"; const h = (Date.now() - ms) / 3.6e6; return h > 48 ? "old" : h > 12 ? "stale" : ""; }
function iconUrl(icon) { const f = String(Math.floor(icon / 1000) * 1000).padStart(6, "0"); const n = String(icon).padStart(6, "0"); return `https://v2.xivapi.com/api/asset?path=ui/icon/${f}/${n}.tex&format=png`; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    let res;
    try { res = await fetch(url); } catch (e) { if (i === tries - 1) throw new Error("network"); await sleep(800 * (i + 1)); continue; }
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) { await sleep(1200 * (i + 1)); continue; }
    throw new Error("HTTP " + res.status);
  }
  throw new Error("Universalis kept refusing requests");
}
function chunks(a, n) { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; }
// Runs async tasks with a concurrency limit and a short pause between requests, to stay polite to Universalis.
async function pool(tasks, limit, onDone, shouldStop) {
  let i = 0;
  const run = async () => { while (i < tasks.length) { if (shouldStop && shouldStop()) return; const t = tasks[i++]; await t(); onDone(); await sleep(120); } };
  await Promise.all(Array.from({ length: limit }, run));
}
// Universalis returns a bare object for one item and {items: {...}} for several; normalise to {id: data}.
function multi(json) { return json && json.items ? json.items : json && (json.itemID || json.itemId) ? { [json.itemID ?? json.itemId]: json } : {}; }

let TAX = null;
async function getTax() {
  if (TAX) return TAX;
  try { TAX = await getJSON(`${API}/tax-rates?world=${WORLD}`); } catch { TAX = null; }
  return TAX;
}
// Seller-side tax for a retainer city, in percent. Falls back to the 5% maximum when unknown.
function cityTax(tax, cityId) { const v = tax && tax[CITY[cityId]]; return typeof v === "number" ? v : 5; }

function suggestPrice(listings, sales, span) {
  const lows = listings.map(l => l.pricePerUnit); const low = lows.length ? Math.min(...lows) : null;
  const prices = sales.map(s => s.pricePerUnit); const med = median(prices); const p25 = pct(prices, 0.25);
  const enough = prices.length >= 5;
  if (low == null && med == null) return { price: null, why: "No listings and no recorded sales on Famfrit in 30 days. Check the board in game before listing." };
  if (low == null) return { price: Math.round(med), why: `Nobody is selling this right now, so list at the ${span} median sale price.` };
  if (med == null) return { price: Math.max(1, low - 1), why: "No sales recorded in 30 days. This undercuts the lowest listing by 1 gil, but expect it to sit." };
  if (enough && low < 0.7 * med) return { price: Math.round(med), why: `The lowest listing (${fmt(low)} g) is far below the ${span} median (${fmt(med)} g). It looks like a dump; listing at the median avoids racing it down.`, warn: true };
  const under = Math.max(1, low - 1);
  if (enough && under < p25) return { price: Math.round(p25), why: `Undercutting would drop below the bottom quarter of recent sales, so this holds at ${fmt(p25)} g.` };
  return { price: under, why: `Undercuts the lowest listing (${fmt(low)} g) by 1 gil. The ${span} median sale was ${fmt(med)} g.` };
}

/* ---------- market-board item index (items.json) ---------- */
const anyById = new Map(); let ALL = null, ALLP = null;
function loadIndex() {
  if (!ALLP) ALLP = fetch("items.json").then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(d => {
    ALL = d.items.map(r => ({ id: r[0], name: r[1], icon: r[2], cat: d.cats[r[3]] || "", vendor: r[4], ilvl: r[5], lc: r[1].toLowerCase() }));
    for (const x of ALL) anyById.set(x.id, x);
    return ALL;
  }).catch(() => { ALLP = null; return null; });
  return ALLP;
}
function searchAll(q) {
  q = q.trim().toLowerCase(); if (q.length < 2 || !ALL) return [];
  const words = q.split(/\s+/); const hits = [];
  for (const x of ALL) {
    if (!words.every(w => x.lc.includes(w))) continue;
    const i = x.lc.indexOf(q);
    const score = i === 0 ? 0 : i > 0 && /[\s'-]/.test(x.lc[i - 1]) ? 1 : i > 0 ? 2 : 3;
    hits.push([score, x.name.length, x]);
  }
  hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return hits.slice(0, 12).map(h => h[2]);
}

/* ---------- item search box (combobox) ---------- */
function attachLookup(input, list, onPick, { clearOnPick = false } = {}) {
  let hits = [], active = -1;
  const optId = i => list.id + "-opt" + i;
  const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); active = -1; };
  const note = text => { const li = document.createElement("li"); li.className = "none"; li.textContent = text; list.append(li); };
  const draw = () => {
    list.replaceChildren();
    if (input.value.trim().length < 2) { close(); return; }
    if (!ALL) note(ALLP ? "Loading item list…" : "Couldn't load the item list. Reload the page to try again.");
    else if (!hits.length) note("No sellable item matches that name.");
    hits.forEach((x, i) => {
      const li = document.createElement("li"); li.id = optId(i); li.setAttribute("role", "option"); li.setAttribute("aria-selected", i === active);
      li.innerHTML = `<img loading="lazy" alt="" src="${iconUrl(x.icon)}" onerror="this.remove()"><span class="n"></span><span class="c"></span>`;
      li.querySelector(".n").textContent = x.name; li.querySelector(".c").textContent = x.cat;
      li.addEventListener("mousedown", e => { e.preventDefault(); pick(i); });
      list.append(li);
    });
    list.hidden = false; input.setAttribute("aria-expanded", "true");
    if (active >= 0) input.setAttribute("aria-activedescendant", optId(active)); else input.removeAttribute("aria-activedescendant");
  };
  const pick = i => { const x = hits[i]; if (!x) return; input.value = clearOnPick ? "" : x.name; close(); onPick(x); };
  input.addEventListener("focus", () => { loadIndex(); });
  input.addEventListener("input", async () => {
    const q = input.value; active = -1;
    if (!ALL) { draw(); await loadIndex(); if (input.value !== q) return; }
    hits = searchAll(q); draw();
  });
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" && hits.length) { e.preventDefault(); active = (active + 1) % hits.length; draw(); }
    else if (e.key === "ArrowUp" && hits.length) { e.preventDefault(); active = (active - 1 + hits.length) % hits.length; draw(); }
    else if (e.key === "Enter" && hits.length) { e.preventDefault(); pick(active < 0 ? 0 : active); }
    else if (e.key === "Escape") { e.stopPropagation(); close(); }
  });
  input.addEventListener("blur", () => setTimeout(close, 100));
}
