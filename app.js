(() => {
"use strict";
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const D = DATA, M = D.months, U = D.ufs, NM = M.length;
const F = {}; D.fields.forEach((f, i) => F[f] = i);
const NF = D.fields.length;

/* ---------------- premissas do modelo (editáveis) ---------------- */
const SLA_META = .95;                                   // meta de entregas no prazo, medida POR REGIÃO
const CIRC = 1.3;                                       // linha reta -> distância rodoviária estimada
const FLOOR = { base: 1.0, kmDia: 450, hand: 1.0 };     // piso físico: transporte >= 1 d + km_rod/450 · postagem >= 1 d
// Custo de transporte por pedido = a + b · kg^wk · km_rod^dk  (MODELO, não dado). a = fixo por pedido (premissa);
// wk/dk = concavidade da tarifa em peso e distância (vêm de D.meta.custo); b é CALIBRADO para a margem nacional de referência
// (MARGEM_REF) sobre o frete cobrado. Margem por UF/corredor é consequência dessa forma, não medição.
const CM = (D.meta && D.meta.custo) || { wk: 0.4, dk: 0.5 };
const MARGEM_REF = (D.meta && D.meta.margemRef) || 0.22;
const COST = { a: 7.0, b: 0, wk: CM.wk, dk: CM.dk };
const CIRCK = () => Math.pow(CIRC, COST.dk);            // km_rod^dk = CIRC^dk · km_linha^dk
const MIN_N = 100;                                      // mínimo de observações para exibir uma taxa
const REG = {}; U.forEach(u => REG[u] = D.geo[u].regiao);
const REGIOES = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"];
const REG_SIG = { "Norte": "N", "Nordeste": "NE", "Centro-Oeste": "CO", "Sudeste": "SE", "Sul": "S" };
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MES_FULL = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const mlabel = i => { const [y, m] = M[i].split("-"); return MES[+m - 1] + "/" + y.slice(2); };
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------- formatação ---------------- */
const loc = "pt-BR";
const fN = v => Math.round(v).toLocaleString(loc);
const f1 = v => v.toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f2 = v => v.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fP = (v, d = 1) => isFinite(v) ? (v * 100).toLocaleString(loc, { minimumFractionDigits: d, maximumFractionDigits: d }) + "%" : "–";
const fR = v => v >= 1e6 ? "R$ " + f2(v / 1e6) + " mi" : v >= 1e3 ? "R$ " + f1(v / 1e3) + " mil" : "R$ " + f2(v);
const fRk = v => v >= 1e6 ? f1(v / 1e6) + " mi" : v >= 1e3 ? fN(v / 1e3) + " mil" : fN(v);
const fRs = v => "R$ " + f2(v);
const fK = v => v >= 1e3 ? f1(v / 1e3).replace(",0", "") + " mil" : fN(v);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* ---------------- estado ---------------- */
const S = { view: "geral", m0: 0, m1: NM - 1, region: "", uf: "", metric: "volume", tilt: !REDUCED, paused: false };

function scopeUfs(st = S) {
  if (st.uf) return [st.uf];
  if (st.region) return U.filter(u => REG[u] === st.region);
  return U.slice();
}
function regionUfs() { return S.region ? U.filter(u => REG[u] === S.region) : (S.uf ? U.filter(u => REG[u] === REG[S.uf]) : U.slice()); }
function scopeLabel() {
  const per = S.m0 === 0 && S.m1 === NM - 1 ? "jan/17 a ago/18" : S.m0 === S.m1 ? mlabel(S.m0) : mlabel(S.m0) + " a " + mlabel(S.m1);
  const loc_ = S.uf ? D.geo[S.uf].nome : S.region || "Brasil";
  return loc_ + " · " + per;
}

/* ---------------- agregações ---------------- */
const UI = {}; U.forEach((u, i) => UI[u] = i);
(function calibCost() {                                  // b tal que margem nacional (todo o período) = MARGEM_REF
  let fr = 0, del = 0, kw = 0;
  for (const mm of D.cube) for (const r of mm) { fr += r[F.freight]; del += r[F.delivered]; kw += r[F.sumKW]; }
  COST.b = Math.max(0, ((1 - MARGEM_REF) * fr - COST.a * del) / (CIRCK() * (kw || 1)));
})();
const costOf = (del, kw) => COST.a * del + COST.b * CIRCK() * kw;
function agg(m0 = S.m0, m1 = S.m1, ufs = scopeUfs()) {
  const a = new Float64Array(NF);
  for (let m = m0; m <= m1; m++) for (const u of ufs) { const r = D.cube[m][UI[u]]; for (let k = 0; k < NF; k++) a[k] += r[k]; }
  return kp(a);
}
function kpBase(a) {
  const g = k => a[F[k]];
  const del = g("delivered") || 1, orders = g("orders") || 1;
  const rev = g("gmv") + g("freight");
  const onN = g("nRev") - g("nLateRev") - g("nNdRev"), onS = g("sumRev") - g("lateRev") - g("ndRev");
  return {
    raw: a, orders: g("orders"), delivered: g("delivered"), lateN: g("late"), late: g("late") / del,
    days: g("sumDays") / del, est: g("sumEst") / del, slack: (g("sumEst") - g("sumDays")) / del,
    appr: g("sumAppr") / del, hand: g("sumHand") / del, trans: g("sumTrans") / del,
    gmv: g("gmv"), freight: g("freight"), rev, ticket: rev / orders, fshare: g("freight") / (rev || 1),
    nota: g("sumRev") / (g("nRev") || 1), rev1: g("rev1") / (g("nRev") || 1), rev5: g("rev5") / (g("nRev") || 1),
    notaLate: g("lateRev") / (g("nLateRev") || 1), notaOn: onS / (onN || 1),
    rev1Late: g("lateRev1") / (g("rev1") || 1),
    lateDays: g("sumLateDays") / (g("late") || 1), notDel: g("notDelivered") / orders,
    credit: g("credit") / orders, boleto: g("boleto") / orders, voucher: g("voucher") / orders, debit: g("debit") / orders,
    inst: g("sumInst") / (g("credit") || 1),
    km: g("sumKm") / del, kg: g("sumKg") / del, cost: costOf(g("delivered"), g("sumKW")),
  };
}
function kp(a) { const k = kpBase(a); k.margin = k.freight ? (k.freight - k.cost) / k.freight : NaN; k.costPer = k.cost / (k.delivered || 1); return k; }
function prevRange() {
  const len = S.m1 - S.m0 + 1;
  return S.m0 - len >= 0 ? [S.m0 - len, S.m0 - 1] : null;
}
// comparação: período anterior; sem ele, mesmos meses ano contra ano (jan–ago/18 vs jan–ago/17)
function cmpPair(ufs = scopeUfs()) {
  const pr = prevRange();
  if (pr) return { cur: null, prev: agg(pr[0], pr[1], ufs), lbl: "vs anterior" };
  if (S.m1 >= 12) { const c0 = Math.max(12, S.m0), c1 = S.m1; return { cur: agg(c0, c1, ufs), prev: agg(c0 - 12, c1 - 12, ufs), lbl: c0 === c1 ? `${MES[c0 - 12]}/18 vs /17` : `${MES[c0 - 12]}–${MES[c1 - 12]}/18 vs /17` }; }
  return { cur: null, prev: null, lbl: "" };
}
function aggUf(u, m0 = S.m0, m1 = S.m1) { return agg(m0, m1, [u]); }
function monthly(ufs = scopeUfs()) { const out = []; for (let m = S.m0; m <= S.m1; m++) out.push(agg(m, m, ufs)); return out; }

// corredores
const CORR = D.corr; // [m, s, c, orders, late, sumDays, sumEst, freight, sumRev, nRev, sumTrans, sumHand, sumKm, sumKW, sumKg]
function corridors(ufs = scopeUfs(), m0 = S.m0, m1 = S.m1) {
  const set = new Set(ufs.map(u => UI[u])), map = new Map();
  for (const r of CORR) {
    if (r[0] < m0 || r[0] > m1 || !set.has(r[2])) continue;
    const k = r[1] * 100 + r[2];
    let o = map.get(k); if (!o) { o = { s: r[1], c: r[2], o: 0, l: 0, d: 0, e: 0, f: 0, rs: 0, rn: 0, t: 0, h: 0, k: 0, w: 0, g: 0 }; map.set(k, o); }
    o.o += r[3]; o.l += r[4]; o.d += r[5]; o.e += r[6]; o.f += r[7]; o.rs += r[8]; o.rn += r[9]; o.t += r[10]; o.h += r[11]; o.k += r[12]; o.w += r[13]; o.g += r[14];
  }
  return [...map.values()].map(o => {
    const so = D.sellers[o.s], de = U[o.c];
    const kmLinha = o.k / o.o, dist = kmLinha * CIRC; // km rodoviário estimado = linha reta medida no dado x fator de circuidade
    const cost = costOf(1, o.w / o.o), frete = o.f / o.o, ci = wilson(o.l, o.o);
    return { ...o, so, de, key: so + "→" + de, late: o.l / o.o, days: o.d / o.o, est: o.e / o.o, frete, nota: o.rs / (o.rn || 1),
      trans: o.t / o.o, hand: o.h / o.o, kg: o.g / o.o, dist: so === "Outros" || !(kmLinha > 0) ? null : dist, distAny: dist, cost, margin: (frete - cost) / (frete || 1), ci, lowN: o.o < MIN_N };
  });
}
function wilson(k, n, z = 1.96) { // intervalo de Wilson 95% para uma proporção
  if (!(n > 0)) return [NaN, NaN];
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), w = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (c - w) / d), Math.min(1, (c + w) / d)];
}
function cats(ufs = scopeUfs()) {
  const set = new Set(ufs.map(u => UI[u])), arr = D.cats.map((n, i) => ({ n, i, o: 0, g: 0, l: 0, d: 0 }));
  for (const r of D.cat) { if (r[0] < S.m0 || r[0] > S.m1 || !set.has(r[1])) continue; const c = arr[r[2]]; c.o += r[3]; c.g += r[4]; c.l += r[5]; c.d += r[6]; }
  return arr;
}
// meses de evento (marcados em D.events) x meses "normais": base do atraso estrutural
const EVM = new Set(D.events.map(e => M.indexOf(e.m)).filter(i => i >= 0));
function monthsOf(mode) { const a = []; for (let m = 0; m < NM; m++) if (mode === "all" || (mode === "event") === EVM.has(m)) a.push(m); return a; }
function rangeOf(m0, m1) { const a = []; for (let m = m0; m <= m1; m++) a.push(m); return a; }
function diffDist(ufs = scopeUfs(), months = null) { // histograma de dias vs prometido; months = lista de índices (padrão: todos)
  const n = D.diffMax - D.diffMin + 1, h = new Array(n).fill(0);
  for (const m of months || monthsOf("all")) for (const u of ufs) { const r = D.diffHist[m][UI[u]]; for (let i = 0; i < n; i++) h[i] += r[i]; }
  return h;
}
// atraso estrutural (meses sem evento, série inteira) x excesso nos meses de evento dentro do recorte
function lateSplit(ufs = scopeUfs(), m0 = S.m0, m1 = S.m1) {
  let bl = 0, bd = 0, late = 0, del = 0, el = 0, ed = 0;
  for (const m of monthsOf("struct")) for (const u of ufs) { const r = D.cube[m][UI[u]]; bl += r[F.late]; bd += r[F.delivered]; }
  for (let m = m0; m <= m1; m++) for (const u of ufs) { const r = D.cube[m][UI[u]]; late += r[F.late]; del += r[F.delivered]; if (EVM.has(m)) { el += r[F.late]; ed += r[F.delivered]; } }
  const base = bd ? bl / bd : NaN, excess = Math.max(0, el - base * ed);
  return { base, late, del, evLate: el, evDel: ed, excess, struct: late - excess, structRate: del ? (late - excess) / del : NaN, evRate: ed ? el / ed : NaN, hasEv: ed > 0 };
}
const REVC = (() => { // curva nota × dias (suavizada nas pontas)
  const c = D.revCurve.map(([n, s]) => n ? s / n : null), n = D.revCurve.map(r => r[0]);
  const out = c.slice();
  for (let i = 0; i < out.length; i++) if (n[i] < 40) {
    let s = 0, k = 0; for (let j = Math.max(0, i - 4); j <= Math.min(out.length - 1, i + 4); j++) if (c[j] != null) { s += c[j] * n[j]; k += n[j]; }
    out[i] = k ? s / k : 4;
  }
  return out;
})();

/* ---------------- tooltip ---------------- */
const tip = $("#tip");
function showTip(html, x, y) {
  tip.innerHTML = html; tip.classList.add("on");
  const r = tip.getBoundingClientRect(); let tx = x + 16, ty = y + 14;
  if (tx + r.width > innerWidth - 8) tx = x - r.width - 16;
  if (ty + r.height > innerHeight - 8) ty = y - r.height - 14;
  tip.style.left = Math.max(8, tx) + "px"; tip.style.top = Math.max(8, ty) + "px";
}
function hideTip() { tip.classList.remove("on"); }
const tr = (k, v, sw) => `<div class="tr"><span>${sw ? `<i class="sw" style="background:${sw}"></i>` : ""}${k}</span><b>${v}</b></div>`;

/* ---------------- gráficos (SVG/HTML, sem dependências) ---------------- */
const TABLES = {};
function niceMax(v) { if (v <= 0) return 1; const st = v / 4, p = 10 ** Math.floor(Math.log10(st)); for (const m of [1, 2, 2.5, 5, 10]) if (m * p * 4 >= v) return m * p * 4; return 40 * p; }
function rTop(x, y, w, h, r) { r = Math.min(r, w / 2, h); if (h <= 0) return ""; return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; }

function barChart(el, o) {
  const w = el.clientWidth || 600, h = o.h || 200, ml = o.ml ?? 44, mr = 8, mt = o.mt ?? 10, mb = 24;
  const n = o.labels.length, iw = w - ml - mr, ih = h - mt - mb;
  const tot = i => o.stacked ? o.series.reduce((s, se) => s + se.values[i], 0) : Math.max(...o.series.map(se => se.values[i]));
  let max = o.max || niceMax(Math.max(...o.labels.map((_, i) => tot(i)), ...(o.line ? o.line.values : [0])));
  const band = iw / n, bw = Math.max(2, Math.min(o.bw || 38, band * (o.gapR ?? .64)));
  const y = v => mt + ih - v / max * ih;
  let s = `<svg height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(o.aria || "")}">`;
  for (let t = 0; t <= 4; t++) { const v = max * t / 4, yy = y(v); s += `<line class="grid-l" x1="${ml}" x2="${w - mr}" y1="${yy}" y2="${yy}"/><g class="ax"><text x="${ml - 8}" y="${yy + 4}" text-anchor="end">${(o.tick || fK)(v)}</text></g>`; }
  const every = Math.max(1, Math.ceil(n / (iw / (o.lblW || 52))));
  o.labels.forEach((l, i) => {
    const x = ml + band * i + (band - bw) / 2;
    if (o.hl && o.hl.has(i)) s += `<rect x="${ml + band * i}" y="${mt}" width="${band}" height="${ih}" fill="var(--accent-soft)" rx="4"/>`;
    let base = 0;
    o.series.forEach((se, si) => {
      const v = se.values[i]; if (!v) return;
      const y0 = y(base + v), y1 = y(o.stacked ? base : 0);
      const isTop = !o.stacked || si === o.series.length - 1 || o.series.slice(si + 1).every(z => !z.values[i]);
      const col = se.colorAt ? se.colorAt(i) : se.color;
      const gap = o.stacked && si > 0 ? 2 : 0;
      const hh = Math.max(0, y1 - y0 - gap);
      s += isTop ? `<path d="${rTop(x, y0, bw, hh, 4)}" fill="${col}"/>` : `<rect x="${x}" y="${y0}" width="${bw}" height="${hh}" fill="${col}"/>`;
      if (o.stacked) base += v;
    });
    if (i % every === 0) s += `<g class="ax"><text x="${ml + band * i + band / 2}" y="${h - 6}" text-anchor="middle">${esc(l)}</text></g>`;
  });
  if (o.line) {
    const pts = o.line.values.map((v, i) => `${ml + band * i + band / 2},${y(v)}`).join(" ");
    s += `<polyline points="${pts}" fill="none" stroke="${o.line.color}" stroke-width="2" stroke-linejoin="round"/>`;
  }
  if (o.labelsOn) o.labelsOn.forEach(i => { s += `<text x="${ml + band * i + band / 2}" y="${y(tot(i)) - 6}" text-anchor="middle" font-size="11" fill="var(--ink-2)" font-family="var(--mono)">${o.fmt(tot(i))}</text>`; });
  if (o.refLine != null) { const yy = y(o.refLine); s += `<line x1="${ml}" x2="${w - mr}" y1="${yy}" y2="${yy}" stroke="var(--ink-2)" stroke-width="1"/><text x="${w - mr}" y="${yy - 5}" text-anchor="end" font-size="11" fill="var(--ink-2)">${esc(o.refLabel || "")}</text>`; }
  s += `<rect class="hov" x="${ml}" y="0" width="${iw}" height="${h}" fill="transparent"/><rect class="hl-col" x="0" y="${mt}" width="${band}" height="${ih}" fill="var(--ink)" opacity="0" pointer-events="none" rx="4"/></svg>`;
  el.innerHTML = s;
  const svg = el.querySelector("svg"), hov = svg.querySelector(".hov"), col = svg.querySelector(".hl-col");
  const pick = e => { const r = svg.getBoundingClientRect(); return Math.min(n - 1, Math.max(0, Math.floor((e.clientX - r.left - ml) / band))); };
  hov.addEventListener("mousemove", e => {
    const i = pick(e); col.setAttribute("x", ml + band * i); col.setAttribute("opacity", .06);
    showTip(`<div class="tt">${esc(o.tipTitle ? o.tipTitle(i) : o.labels[i])}</div>` + (o.tip ? o.tip(i) : o.series.map(se => tr(se.name, o.fmt(se.values[i]), se.colorAt ? se.colorAt(i) : se.color)).join("")), e.clientX, e.clientY);
  });
  hov.addEventListener("mouseleave", () => { hideTip(); col.setAttribute("opacity", 0); });
  if (o.onClick) { hov.style.cursor = "pointer"; hov.addEventListener("click", e => o.onClick(pick(e))); }
  if (o.table) TABLES[el.id] = o.table;
}

function lineChart(el, o) {
  const w = el.clientWidth || 600, h = o.h || 230, ml = 46, mr = 54, mt = o.markers && o.markers.length ? 30 : 10, mb = 24;
  const n = o.labels.length, iw = w - ml - mr, ih = h - mt - mb;
  const max = niceMax(Math.max(...o.values) * 1.05);
  const x = i => ml + (n === 1 ? iw / 2 : i * iw / (n - 1)), y = v => mt + ih - v / max * ih;
  const col = o.color || "var(--s1)";
  let s = `<svg height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(o.aria || "")}"><defs><linearGradient id="lg-${el.id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".28"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>`;
  for (let t = 0; t <= 4; t++) { const v = max * t / 4, yy = y(v); s += `<line class="grid-l" x1="${ml}" x2="${w - mr}" y1="${yy}" y2="${yy}"/><g class="ax"><text x="${ml - 8}" y="${yy + 4}" text-anchor="end">${(o.tick || fK)(v)}</text></g>`; }
  (o.markers || []).forEach(mk => {
    const xx = x(mk.i);
    s += `<line x1="${xx}" x2="${xx}" y1="${mt - 12}" y2="${y(o.values[mk.i])}" stroke="${mk.color}" stroke-width="1" opacity=".55"/>`;
    s += `<g class="mk" data-i="${mk.i}" style="cursor:help"><circle cx="${xx}" cy="${mt - 16}" r="9" fill="var(--card)" stroke="${mk.color}" stroke-width="1.5"/><text x="${xx}" y="${mt - 12.5}" text-anchor="middle" font-size="10" font-weight="700" fill="${mk.color}">${mk.sym}</text></g>`;
  });
  const pts = o.values.map((v, i) => [x(i), y(v)]);
  if (n > 1) {
    s += `<path d="M${pts[0][0]},${y(0)} ${pts.map(p => "L" + p.join(",")).join(" ")} L${pts[n - 1][0]},${y(0)}Z" fill="url(#lg-${el.id})"/>`;
    s += `<path d="M${pts.map(p => p.join(",")).join(" L")}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  const every = Math.max(1, Math.ceil(n / (iw / 54)));
  o.labels.forEach((l, i) => { if ((i % every === 0 && (n - 1 - i >= every || i === n - 1)) || i === n - 1) s += `<g class="ax"><text x="${x(i)}" y="${h - 6}" text-anchor="middle">${esc(l)}</text></g>`; });
  // rótulo direto: máximo e último
  const imax = o.values.indexOf(Math.max(...o.values));
  [imax, n - 1].filter((v, i, a) => a.indexOf(v) === i).forEach(i => {
    // com marcador de evento no mesmo mês, a linha vertical do marcador passaria pelo número: o rótulo vai para a esquerda do ponto (a série sobe por ali, então o espaço está livre)
    const last = i === n - 1, left = !last && i > 0 && (o.markers || []).some(mk => mk.i === i), side = last || left;
    s += `<circle cx="${pts[i][0]}" cy="${pts[i][1]}" r="4" fill="${col}" stroke="var(--card)" stroke-width="2"/><text x="${pts[i][0] + (last ? 8 : left ? -8 : 0)}" y="${pts[i][1] - (left ? 5 : 9)}" text-anchor="${last ? "start" : left ? "end" : "middle"}" font-size="11.5" font-weight="600" fill="var(--ink)" stroke="var(--card)" stroke-width="3" paint-order="stroke" stroke-linejoin="round">${o.fmt(o.values[i])}</text>`;
  });
  s += `<line class="xh" x1="0" x2="0" y1="${mt}" y2="${mt + ih}" stroke="var(--ink-3)" stroke-width="1" opacity="0"/><circle class="xd" r="5" fill="${col}" stroke="var(--card)" stroke-width="2" opacity="0"/><rect class="hov" x="${ml}" y="${mt}" width="${iw}" height="${ih}" fill="transparent"/></svg>`;
  el.innerHTML = s;
  const svg = el.querySelector("svg"), xh = svg.querySelector(".xh"), xd = svg.querySelector(".xd");
  const near = e => { const r = svg.getBoundingClientRect(); return Math.round(Math.min(n - 1, Math.max(0, (e.clientX - r.left - ml) / (iw / Math.max(1, n - 1))))); };
  svg.querySelector(".hov").addEventListener("mousemove", e => {
    const i = near(e); xh.setAttribute("x1", pts[i][0]); xh.setAttribute("x2", pts[i][0]); xh.setAttribute("opacity", 1);
    xd.setAttribute("cx", pts[i][0]); xd.setAttribute("cy", pts[i][1]); xd.setAttribute("opacity", 1);
    showTip(`<div class="tt">${esc(o.labels[i])}</div>` + (o.tip ? o.tip(i) : tr(o.name, o.fmt(o.values[i]))), e.clientX, e.clientY);
  });
  svg.querySelector(".hov").addEventListener("mouseleave", () => { hideTip(); xh.setAttribute("opacity", 0); xd.setAttribute("opacity", 0); });
  svg.querySelectorAll(".mk").forEach(g => {
    const mk = o.markers.find(m => m.i === +g.dataset.i);
    g.addEventListener("mousemove", e => showTip(`<div class="tt">${esc(mk.label)}</div><div style="color:#a9b6b2;max-width:240px">${esc(mk.desc)}</div>`, e.clientX, e.clientY));
    g.addEventListener("mouseleave", hideTip);
  });
  if (o.table) TABLES[el.id] = o.table;
}

function hbars(el, rows, o = {}) {
  const max = o.max || Math.max(...rows.map(r => r.v)) || 1;
  el.innerHTML = `<div style="display:grid;grid-template-columns:${o.lw || "46px"} 1fr ${o.vw || "74px"};gap:7px 10px;align-items:center">` + rows.map(r =>
    `<div style="font-size:12.5px;color:var(--ink-2);font-weight:${r.hl ? 700 : 500};${r.hl ? "color:var(--ink)" : ""}" title="${esc(r.title || r.l)}">${esc(r.l)}</div>
     <div class="hb" data-k="${esc(r.k || r.l)}" style="height:18px;display:flex;align-items:center;cursor:${o.onClick ? "pointer" : "default"}"><div style="height:10px;width:${Math.max(.5, r.v / max * 100)}%;background:${r.c || o.color || "var(--s1)"};border-radius:0 4px 4px 0;opacity:${r.dim ? .35 : 1}"></div></div>
     <div class="num" style="font-size:12px;text-align:right;color:var(--ink)">${o.fmt ? o.fmt(r.v) : r.v}</div>`).join("") + `</div>`;
  el.querySelectorAll(".hb").forEach((b, i) => {
    if (o.tip) { b.addEventListener("mousemove", e => showTip(o.tip(rows[i]), e.clientX, e.clientY)); b.addEventListener("mouseleave", hideTip); }
    if (o.onClick) b.addEventListener("click", () => o.onClick(rows[i]));
  });
  if (o.table) TABLES[el.id] = o.table;
}

function tableHTML(t, sortable = true) {
  return `<table class="tbl"><thead><tr>${t.cols.map((c, i) => `<th data-i="${i}" ${t.sort === i ? `aria-sort="${t.dir < 0 ? "descending" : "ascending"}"` : ""}>${esc(c)}</th>`).join("")}</tr></thead><tbody>${t.rows.map(r => `<tr>${r.map((c, i) => `<td>${t.html && t.html[i] ? c : esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
function sortableTable(el, t) {
  const draw = () => {
    if (t.sort != null) { const i = t.sort, raw = t.raw || t.rows; const idx = raw.map((_, k) => k).sort((a, b) => { const A = raw[a][i], B = raw[b][i]; return (typeof A === "number" ? A - B : String(A).localeCompare(String(B))) * t.dir; }); t.rows = idx.map(k => t.disp[k]); t.raw = idx.map(k => raw[k]); t.disp = t.rows.slice(); }
    el.innerHTML = tableHTML(t);
    el.querySelectorAll("th").forEach(th => th.addEventListener("click", () => { const i = +th.dataset.i; t.dir = t.sort === i ? -t.dir : -1; t.sort = i; draw(); }));
  };
  t.disp = t.rows.slice(); draw();
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-table]"); if (!b) return;
  const id = b.dataset.table, el = document.getElementById(id), on = b.getAttribute("aria-pressed") === "true";
  b.setAttribute("aria-pressed", !on); b.textContent = on ? "Tabela" : "Gráfico";
  if (!on && TABLES[id]) el.innerHTML = `<div class="tbl-wrap">${tableHTML(TABLES[id])}</div>`; else renderView();
});

/* ---------------- KPIs ---------------- */
const ARW = { up: '<svg viewBox="0 0 12 12"><path d="M3 9l6-6M4 3h5v5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>', down: '<svg viewBox="0 0 12 12"><path d="M3 3l6 6M9 4v5H4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>' };
let CMPL = "vs anterior";
function delta(cur, prev, { pp = false, better = "up", fmt } = {}) {
  if (prev == null || !isFinite(prev) || !isFinite(cur)) return `<span class="delta flat">sem base de comparação</span>`;
  const d = pp ? (cur - prev) * 100 : (prev ? (cur / prev - 1) * 100 : 0);
  if (Math.abs(d) < .05) return `<span class="delta flat">estável vs anterior</span>`;
  if (better === "none") return `<span class="delta flat">${d > 0 ? ARW.up : ARW.down}${fmt ? fmt(cur - prev) : f1(Math.abs(d)) + "%"}</span><span>${CMPL}</span>`;
  const good = (d > 0) === (better === "up");
  const txt = fmt ? fmt(cur - prev) : (d > 0 ? "+" : "−") + f1(Math.abs(d)) + (pp ? " p.p." : "%");
  return `<span class="delta ${good ? "up" : "down"}" title="${good ? "favorável" : "desfavorável"}">${d > 0 ? ARW.up : ARW.down}${txt}</span><span>${CMPL}</span>`;
}
const STAR = c => `<svg viewBox="0 0 24 24" fill="${c}"><path d="M12 2.5l2.9 6.2 6.6.7-5 4.5 1.4 6.6L12 17.2 6.1 20.5l1.4-6.6-5-4.5 6.6-.7z"/></svg>`;
function kpiCard({ lbl, val, sub = "", d = "", meter = null }) {
  return `<div class="card kpi" data-kpi="${esc(lbl)}" tabindex="0" role="button" aria-label="Analisar ${esc(lbl)} na Mesa de análise"><span class="ask-ic" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2Z"/></svg></span><div class="lbl"><i></i>${lbl}</div><div class="val">${val}</div><div class="dl">${d}</div>${sub ? `<div class="dl">${sub}</div>` : ""}${meter ? `<div class="meter" title="Meta ${fP(meter.t, 0)}"><b style="width:${Math.min(100, meter.v * 100)}%;background:${meter.v >= meter.t ? "var(--good)" : "var(--warn)"}"></b><s style="left:${meter.t * 100}%"></s></div>` : ""}</div>`;
}

/* ---------------- views ---------------- */
const EVSYM = { pico: { sym: "▲", c: "var(--accent)", n: "Pico de demanda" }, clima: { sym: "≈", c: "var(--s1)", n: "Clima / feriado" }, greve: { sym: "!", c: "var(--crit)", n: "Greve / ruptura" } };

function renderGeral() {
  const a = agg(), cp = cmpPair(), p = cp.prev, c = cp.cur || a; CMPL = cp.lbl;
  $("#kpiGeral").innerHTML = [
    kpiCard({ lbl: "Pedidos", val: fN(a.orders), d: delta(c.orders, p && p.orders), sub: `<span>${fN(a.delivered)} entregues · ${fP(a.notDel)} não chegaram</span>` }),
    kpiCard({ lbl: "Receita de frete", val: fR(a.freight), d: delta(c.freight, p && p.freight), sub: `<span>GMV transportado ${fR(a.gmv)} · margem est. ${fP(a.margin, 0)}</span>` }),
    kpiCard({ lbl: "Prazo médio", val: `${f1(a.days)}<small>dias</small>`, d: delta(c.days, p && p.days, { better: "down", fmt: v => (v > 0 ? "+" : "−") + f1(Math.abs(v)) + " d" }), sub: `<span>prometido ${f1(a.est)} d · folga ${f1(a.slack)} d</span>` }),
    kpiCard({ lbl: "Entregas no prazo", val: fP(1 - a.late), d: delta(1 - c.late, p && 1 - p.late, { pp: true }), meter: { v: 1 - a.late, t: SLA_META }, sub: `<span>meta ${fP(SLA_META, 0)} por região · ${fN(a.lateN)} atrasos</span>` }),
    kpiCard({ lbl: "Nota do cliente", val: `${f2(a.nota)}<span class="stars">${STAR("var(--accent)")}</span>`, d: delta(c.nota, p && p.nota, { fmt: v => (v > 0 ? "+" : "−") + f2(Math.abs(v)) }), sub: `<span>${fP(a.rev1)} deram 1★ · ${fP(a.rev5)} deram 5★</span>` }),
  ].join("");

  const mm = monthly(), labels = mm.map((_, i) => mlabel(S.m0 + i));
  const evs = D.events.map(e => ({ ...e, i: M.indexOf(e.m) - S.m0 })).filter(e => e.i >= 0 && e.i < mm.length);
  $("#evLgd").innerHTML = Object.entries(EVSYM).map(([k, v]) => `<span><svg width="16" height="16"><circle cx="8" cy="8" r="7" fill="none" stroke="${v.c}" stroke-width="1.5"/><text x="8" y="11.5" font-size="9" text-anchor="middle" font-weight="700" fill="${v.c}">${v.sym}</text></svg>${v.n}</span>`).join("");
  $("#volSub").textContent = scopeLabel();
  lineChart($("#volChart"), {
    labels, values: mm.map(x => x.orders), fmt: fN, name: "Pedidos", color: "var(--s1)", h: 230,
    markers: evs.map(e => ({ i: e.i, sym: EVSYM[e.tipo].sym, color: EVSYM[e.tipo].c, label: e.label + " · " + mlabel(e.i + S.m0) + " (mês da compra)", desc: e.desc + ". Janela: " + e.janela + "." })),
    tip: i => tr("Pedidos", fN(mm[i].orders)) + tr("Receita de frete", fR(mm[i].freight)) + tr("GMV transportado", fR(mm[i].gmv)) + tr("Atraso", fP(mm[i].late)),
    table: { cols: ["Mês (da compra)", "Pedidos", "Receita de frete", "GMV", "Atraso", "Prazo médio"], rows: mm.map((x, i) => [labels[i], fN(x.orders), fR(x.freight), fR(x.gmv), fP(x.late), f1(x.days) + " d"]) },
  });
  const sp = lateSplit(scopeUfs(), S.m0, S.m1), base = sp.base;
  $("#lateSub").innerHTML = `% dos pedidos entregues depois do prazo prometido · mês = mês da compra` + (sp.hasEv && sp.late ? ` · <b>estrutural ${fP(base)}</b> + eventos <b>${fN(sp.excess)}</b> atrasos (${fP(sp.excess / sp.late, 0)} do recorte)` : ` · sem meses de evento no recorte: tudo é atraso estrutural (${fP(a.late)})`);
  barChart($("#lateChart"), {
    labels, h: 150, fmt: v => fP(v), tick: v => fP(v, 0), mt: 16,
    series: [{ name: "Atraso", values: mm.map(x => x.late), colorAt: i => EVM.has(S.m0 + i) ? "var(--crit)" : mm[i].late > base * 1.4 ? "color-mix(in srgb,var(--crit) 55%,var(--neutral))" : "var(--neutral)" }],
    refLine: base, refLabel: "base estrutural " + fP(base),
    hl: new Set(evs.map(e => e.i)),
    labelsOn: (() => { const v = mm.map(x => x.late); const top = v.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]).slice(0, 2).map(x => x[1]); return top; })(),
    tip: i => { const ex = EVM.has(S.m0 + i) ? Math.max(0, mm[i].lateN - base * mm[i].delivered) : 0; return tr("Atraso", fP(mm[i].late)) + tr("Pedidos atrasados", fN(mm[i].lateN)) + tr("Atraso médio quando atrasa", f1(mm[i].lateDays) + " d") + (EVM.has(S.m0 + i) ? tr("Excesso vs base", "+" + f1((mm[i].late - base) * 100) + " p.p. · ≈" + fN(ex) + " atrasos") : tr("Vs base estrutural", (mm[i].late >= base ? "+" : "−") + f1(Math.abs(mm[i].late - base) * 100) + " p.p.")); },
    onClick: i => { S.m0 = S.m1 = S.m0 + i; syncFilters(); },
  });
  renderInsights(); renderRisk(); renderRevCurve();
}

function renderRevCurve() {
  const B = [[-45, -20, "≤−20"], [-19, -15, "−19 a −15"], [-14, -10, "−14 a −10"], [-9, -5, "−9 a −5"], [-4, -1, "−4 a −1"], [0, 0, "no dia"], [1, 3, "+1 a +3"], [4, 7, "+4 a +7"], [8, 14, "+8 a +14"], [15, 30, "≥+15"]];
  const rows = B.map(([a, b, l]) => { let n = 0, s = 0; for (let d = a; d <= b; d++) { const r = D.revCurve[d - D.diffMin]; n += r[0]; s += r[1]; } return { l, n, v: s / (n || 1), late: a > 0 }; });
  barChart($("#revChart"), {
    labels: rows.map(r => r.l), h: 230, max: 5, lblW: 60, fmt: v => f2(v), tick: v => f1(v),
    series: [{ name: "Nota média", values: rows.map(r => r.v), colorAt: i => rows[i].late ? "var(--crit)" : "var(--s1)" }],
    labelsOn: [0, 5, rows.length - 1],
    tip: i => tr("Nota média", f2(rows[i].v) + " ★") + tr("Avaliações", fN(rows[i].n)) + `<div class="tr" style="color:#7f8f8b">${rows[i].late ? "dias de atraso" : "dias de folga"} vs prometido</div>`,
    table: { cols: ["Dias vs prometido", "Nota média", "Avaliações"], rows: rows.map(r => [r.l, f2(r.v), fN(r.n)]) },
  });
}

function renderRisk() {
  const cs = corridors().filter(c => c.o >= MIN_N).sort((a, b) => b.l - a.l);
  const a = agg(), totL = cs.reduce((s, c) => s + c.l, 0);
  const top = cs.slice(0, 5), share = top.reduce((s, c) => s + c.l, 0) / (totL || 1);
  $("#riskStats").innerHTML = `<div><div class="l">Atrasados</div><div class="v">${fN(a.lateN)}</div></div><div><div class="l">Top 5 rotas</div><div class="v">${fP(share, 0)}</div></div><div><div class="l">Atraso médio</div><div class="v">${f1(a.lateDays)} d</div></div>`;
  const mx = Math.max(...top.map(c => c.late), .01);
  $("#riskList").innerHTML = top.map(c => `<div class="risk-row" data-uf="${c.de}" style="cursor:pointer"><span class="route-tag">${c.so} <b>→</b> ${c.de}</span>
    <div><div style="font-size:13px;font-weight:600">${fN(c.l)} atrasos <span class="sub">de ${fN(c.o)} pedidos · ${f1(c.days)} d (prometido ${f1(c.est)} d)</span></div><div class="mbar"><b style="width:${c.late / mx * 100}%"></b></div></div>
    <span class="badge ${c.late > .12 ? "bad" : c.late > .07 ? "mid" : "good"}" title="IC 95%: ${fP(c.ci[0])} a ${fP(c.ci[1])}">${fP(c.late)}</span></div>`).join("") || `<div class="sub">Sem corredores com ${MIN_N}+ pedidos no recorte.</div>`;
  $$("#riskList .risk-row").forEach(r => r.addEventListener("click", () => { S.uf = r.dataset.uf; S.region = ""; syncFilters(); }));
}

/* ---------------- insights (motor de regras) ---------------- */
function buildInsights() {
  const a = agg(), out = [], ufs = scopeUfs();
  if (a.delivered < MIN_N) return out;
  out.push({ h: `Atraso derruba a nota de ${f2(a.notaOn)} para ${f2(a.notaLate)}`, p: `${fP(a.rev1Late, 0)} das avaliações 1★ vêm de pedidos atrasados, que são só ${fP(a.late)} das entregas.`, b: "−" + f2(a.notaOn - a.notaLate) + "★", cls: "bad", ask: "Como o atraso afeta a nota?", call: { tool: "nota_vs_atraso", args: {} } });
  if (ufs.length > 1) {
    const st = ufs.map(u => ({ u, ...aggUf(u) })).filter(x => x.delivered >= Math.max(MIN_N, a.delivered * .004));
    const worst = st.slice().sort((x, y) => y.late - x.late)[0];
    if (worst) out.push({ h: `${D.geo[worst.u].nome} lidera o atraso: ${fP(worst.late)}`, p: `${f1(worst.late / a.late)}× a média do recorte · prazo real ${f1(worst.days)} d para ${f1(worst.est)} d prometidos.`, b: "+" + f1((worst.late - a.late) * 100) + " p.p.", cls: "bad", ask: `Atraso em ${worst.u}`, call: { tool: "explicar", args: { metrics: ["atraso"], ufs: [worst.u] } } });
    const honest = st.filter(x => x.late < a.late).sort((x, y) => y.days - x.days)[0];
    if (honest && honest.days > a.days * 1.4) out.push({ h: `${honest.u} demora ${f1(honest.days)} d, mas cumpre a promessa`, p: `Atraso de só ${fP(honest.late)}: o prazo prometido (${f1(honest.est)} d) é realista. Prazo longo ≠ cliente frustrado.`, b: fP(honest.late), cls: "good", ask: `Prazo em ${honest.u}`, call: { tool: "consultar", args: { metrics: ["prazo", "atraso"], ufs: [honest.u] } } });
    const fr = st.slice().sort((x, y) => y.fshare - x.fshare)[0];
    if (fr) out.push({ h: `Frete pesa ${fP(fr.fshare, 0)} do pedido em ${fr.u}`, p: `Contra ${fP(a.fshare, 0)} no recorte. Ticket médio ${fRs(fr.ticket)}; frete médio ${fRs(fr.freight / fr.orders)}.`, b: "+" + f1((fr.fshare - a.fshare) * 100) + " p.p.", cls: "mid", ask: `Frete em ${fr.u}`, call: { tool: "consultar", args: { metrics: ["frete"], ufs: [fr.u] } } });
  }
  if (S.m1 > S.m0) {
    const mm = monthly(); const wi = mm.reduce((b, x, i) => x.late > mm[b].late ? i : b, 0);
    const ev = D.events.find(e => e.m === M[S.m0 + wi]);
    out.push({ h: `${mlabel(S.m0 + wi)} foi o pior mês: ${fP(mm[wi].late)} de atraso`, p: (ev ? ev.label + ". " + ev.desc + "." : "Pico fora dos eventos mapeados.") + ` ${fN(mm[wi].lateN)} pedidos atrasados.`, b: "+" + f1((mm[wi].late - a.late) * 100) + " p.p.", cls: "bad", ask: ev && ev.tipo === "greve" ? "Efeito da greve dos caminhoneiros" : `Atraso em ${MES_FULL[+M[S.m0 + wi].slice(5) - 1]} de ${M[S.m0 + wi].slice(0, 4)}`, call: ev ? { tool: "evento", args: { ev: ev.m } } : { tool: "explicar", args: { metrics: ["atraso"], m0: S.m0 + wi, m1: S.m0 + wi } } });
  }
  const hs = a.hand / a.days;
  out.push({ h: `Postagem consome ${fP(hs, 0)} do lead time`, p: `${f1(a.hand)} d do vendedor até a transportadora, antes de o caminhão sair. Aprovação: ${f1(a.appr)} d · transporte: ${f1(a.trans)} d.`, b: f1(a.hand) + " d", cls: "mid", ask: "Onde o tempo de entrega é gasto?", call: { tool: "etapas", args: {} } });
  const cs = corridors().filter(c => c.o >= MIN_N && c.so !== c.de).sort((x, y) => y.l - x.l);
  if (cs[0]) out.push({ h: `Rota ${cs[0].so}→${cs[0].de} concentra ${fN(cs[0].l)} atrasos`, p: `${fP(cs[0].late)} de atraso em ${fN(cs[0].o)} pedidos · ${f1(cs[0].days)} d em média.`, b: fP(cs[0].late), cls: "bad", ask: `Corredores para ${cs[0].de}`, call: { tool: "corredores", args: { ufs: [cs[0].de], by: "atrasos" } } });
  if (S.m0 <= 10 && S.m1 >= 10 && !S.uf) {
    const bf = agg(10, 10), out_ = agg(9, 9);
    out.push({ h: `Black Friday: +${fP(bf.orders / out_.orders - 1, 0)} pedidos e atraso de ${fP(bf.late)}`, p: `Outubro/17 tinha ${fP(out_.late)} de atraso. A malha não absorveu o pico de volume.`, b: "+" + f1((bf.late - out_.late) * 100) + " p.p.", cls: "bad", ask: "Black Friday", call: { tool: "evento", args: { ev: "2017-11" } } });
  }
  return out;
}
function renderInsights() {
  const ins = buildInsights();
  $("#insights").innerHTML = ins.slice(0, 6).map((x, i) => `<li data-ask="${esc(x.ask)}"><span class="n">${String(i + 1).padStart(2, "0")}</span><div><div class="h">${esc(x.h)}</div><div class="p">${esc(x.p)}</div></div><span class="badge ${x.cls}">${esc(x.b)}</span></li>`).join("");
  $$("#insights li").forEach((li, i) => { li.tabIndex = 0; li.setAttribute("role", "button"); const go = () => { const x = ins[i]; MZ.ui.open(); x.call ? MZ.ui.askCall(x.call, "✦ " + x.h) : MZ.ui.ask(x.ask); }; li.addEventListener("click", go); li.addEventListener("keydown", e => { if (e.key === "Enter") go(); }); });
}

function renderPrazo() {
  const a = agg(), cp = cmpPair(), p = cp.prev, c = cp.cur || a; CMPL = cp.lbl;
  const dd = v => (v > 0 ? "+" : "−") + f1(Math.abs(v)) + " d";
  $("#kpiPrazo").innerHTML = [
    kpiCard({ lbl: "Prazo prometido", val: `${f1(a.est)}<small>dias</small>`, d: delta(c.est, p && p.est, { better: "down", fmt: dd }), sub: "<span>média no checkout</span>" }),
    kpiCard({ lbl: "Entrega real", val: `${f1(a.days)}<small>dias</small>`, d: delta(c.days, p && p.days, { better: "down", fmt: dd }), sub: "<span>compra → porta do cliente</span>" }),
    kpiCard({ lbl: "Folga média", val: `${f1(a.slack)}<small>dias</small>`, d: delta(c.slack, p && p.slack, { better: "none", fmt: dd }), sub: "<span>folga alta = prazo conservador demais</span>" }),
    kpiCard({ lbl: "Atrasados", val: fP(a.late), d: delta(c.late, p && p.late, { pp: true, better: "down" }), sub: `<span>${fN(a.lateN)} pedidos</span>` }),
    kpiCard({ lbl: "Quando atrasa", val: `+${f1(a.lateDays)}<small>dias</small>`, d: delta(c.lateDays, p && p.lateDays, { better: "down", fmt: dd }), sub: `<span>nota cai para ${f2(a.notaLate)}★</span>` }),
  ].join("");
  // barra segmentada de etapas
  const parts = [["Aprovação do pagamento", a.appr, "var(--s1)"], ["Postagem (vendedor → transportadora)", a.hand, "var(--s3)"], ["Transporte até o cliente", a.trans, "var(--s2)"], ["Folga até o prometido", Math.max(0, a.est - a.appr - a.hand - a.trans), "var(--line-2)"]];
  const tot = parts.reduce((s, x) => s + x[1], 0);
  $("#stageBar").innerHTML = `<div class="segbar">${parts.map(([n, v, c], i) => `<div style="flex:${v / tot};background:${c};${i === 3 ? "color:var(--ink-2);background-image:repeating-linear-gradient(135deg,transparent 0 6px,rgba(255,255,255,.04) 6px 12px)" : ""}" data-t="${esc(n)}" data-v="${v}">${v / tot > .07 ? `<b>${f1(v)} d</b><span>${esc(n)}</span>` : ""}</div>`).join("")}</div>
    <div class="seg-lgd">${parts.map(([n, v, c]) => `<span><i style="background:${c}"></i>${esc(n)} · <b class="num">${f1(v)} d</b> (${fP(v / tot, 0)})</span>`).join("")}</div>`;
  $$("#stageBar .segbar > div").forEach(d => { d.addEventListener("mousemove", e => showTip(`<div class="tt">${esc(d.dataset.t)}</div>${tr("Média", f1(+d.dataset.v) + " dias")}${tr("Do prazo prometido", fP(+d.dataset.v / a.est))}`, e.clientX, e.clientY)); d.addEventListener("mouseleave", hideTip); });

  // dumbbell
  const st = regionUfs().map(u => ({ u, ...aggUf(u) })).filter(x => x.delivered > 0).sort((x, y) => x.slack - y.slack);
  const mx = niceMax(Math.max(...st.map(x => x.est), ...st.map(x => x.days)));
  const el = $("#dumbChart");
  el.innerHTML = `<div style="display:grid;grid-template-columns:34px 1fr 64px;gap:4px 10px;align-items:center">` + st.map(x => {
    const l = Math.min(x.days, x.est) / mx * 100, r = Math.max(x.days, x.est) / mx * 100;
    return `<div style="font-size:12px;font-weight:${x.u === S.uf ? 800 : 600};color:${x.u === S.uf ? "var(--accent)" : "var(--ink-2)"}">${x.u}</div>
    <div class="db" data-u="${x.u}" style="position:relative;height:20px;cursor:pointer"><div style="position:absolute;top:9px;left:0;right:0;height:1px;background:var(--line)"></div>
    <div style="position:absolute;top:8px;height:3px;left:${l}%;width:${r - l}%;background:color-mix(in srgb,var(--s1) 35%,transparent);border-radius:2px"></div>
    <div style="position:absolute;top:4px;left:calc(${x.est / mx * 100}% - 6px);width:12px;height:12px;border-radius:50%;background:var(--card);border:2px solid var(--ink-3)"></div>
    <div style="position:absolute;top:4px;left:calc(${x.days / mx * 100}% - 6px);width:12px;height:12px;border-radius:50%;background:var(--s1);box-shadow:0 0 0 2px var(--card)"></div></div>
    <div style="text-align:right">${x.delivered >= MIN_N ? `<span class="badge ${x.late > .12 ? "bad" : x.late > .07 ? "mid" : "good"}" title="IC 95%: ${fP(wilson(x.lateN, x.delivered)[0])} a ${fP(wilson(x.lateN, x.delivered)[1])}">${fP(x.late)}</span>` : `<span class="badge" style="opacity:.55" title="Amostra pequena (${fN(x.delivered)} entregas): taxa instável">${fP(x.late, 0)}*</span>`}</div>`;
  }).join("") + `</div><div style="display:grid;grid-template-columns:34px 1fr 64px;gap:10px"><span></span><div class="ax" style="display:flex;justify-content:space-between;font-family:var(--mono);font-size:11px;color:var(--ink-3);margin-top:6px"><span>0</span><span>${fN(mx / 2)} d</span><span>${fN(mx)} d</span></div></div>`;
  el.querySelectorAll(".db").forEach(d => {
    const x = st.find(z => z.u === d.dataset.u);
    d.addEventListener("mousemove", e => showTip(`<div class="tt">${D.geo[x.u].nome}</div>${tr("Prometido", f1(x.est) + " d", "var(--ink-3)")}${tr("Real", f1(x.days) + " d", "var(--s1)")}${tr("Folga", f1(x.slack) + " d")}${tr("Atraso", fP(x.late))}${tr("Pedidos", fN(x.orders))}`, e.clientX, e.clientY));
    d.addEventListener("mouseleave", hideTip);
    d.addEventListener("click", () => { S.uf = x.u; syncFilters(); });
  });
  TABLES.dumbChart = { cols: ["UF", "Prometido (d)", "Real (d)", "Folga (d)", "Atraso", "Pedidos"], rows: st.map(x => [x.u, f1(x.est), f1(x.days), f1(x.slack), fP(x.late), fN(x.orders)]) };

  // diff hist (segue o período e o escopo do painel)
  const h = diffDist(scopeUfs(), rangeOf(S.m0, S.m1)); const lo = -30, hi = 20; const lbl = [], val = [];
  for (let d = lo; d <= hi; d++) { let v = h[d - D.diffMin]; if (d === lo) for (let k = D.diffMin; k < lo; k++) v += h[k - D.diffMin]; if (d === hi) for (let k = hi + 1; k <= D.diffMax; k++) v += h[k - D.diffMin]; lbl.push(d === lo ? "≤" + lo : d === hi ? "≥+" + hi : (d > 0 ? "+" : "") + d); val.push(v); }
  const totH = val.reduce((s, v) => s + v, 0);
  barChart($("#diffChart"), {
    labels: lbl, h: 190, lblW: 40, gapR: .8, fmt: fN,
    series: [{ name: "Pedidos", values: val, colorAt: i => lo + i > 0 ? "var(--crit)" : "var(--s1)" }],
    tip: i => tr(lo + i > 0 ? "Atraso" : "Folga", lbl[i] + " d") + tr("Pedidos", fN(val[i])) + tr("Do total", fP(val[i] / totH)),
    table: { cols: ["Dias vs prometido", "Pedidos", "%"], rows: val.map((v, i) => [lbl[i], fN(v), fP(v / totH)]) },
  });
  // histograma tempo de entrega
  const ufs = scopeUfs(), nb = D.bins.length - 1, hb = new Array(nb).fill(0);
  for (let m = S.m0; m <= S.m1; m++) for (const u of ufs) D.hist[m][UI[u]].forEach((v, i) => hb[i] += v);
  const bl = D.bins.slice(0, -1).map((b, i) => i === nb - 1 ? b + "+" : b + "–" + (D.bins[i + 1] - 1));
  const hbT = hb.reduce((s, v) => s + v, 0);
  barChart($("#histChart"), {
    labels: bl, h: 170, lblW: 34, fmt: fN, series: [{ name: "Pedidos", values: hb, color: "var(--s1)" }],
    tip: i => tr("Dias", bl[i]) + tr("Pedidos", fN(hb[i])) + tr("Do total", fP(hb[i] / hbT)),
    table: { cols: ["Dias", "Pedidos", "%"], rows: hb.map((v, i) => [bl[i], fN(v), fP(v / hbT)]) },
  });
  const rg = REGIOES.map(r => ({ r, ...agg(S.m0, S.m1, U.filter(u => REG[u] === r)) })).sort((x, y) => y.late - x.late);
  hbars($("#regLate"), rg.map(x => ({ l: REG_SIG[x.r], title: x.r, v: x.late, c: x.late > a.late * 1.25 ? "var(--crit)" : "var(--neutral)", hl: S.region === x.r })), { fmt: v => fP(v), lw: "30px", vw: "60px",
    tip: r => { const x = rg.find(z => REG_SIG[z.r] === r.l); return `<div class="tt">${x.r}</div>${tr("Atraso", fP(x.late))}${tr("Prazo real", f1(x.days) + " d")}${tr("Prometido", f1(x.est) + " d")}${tr("Pedidos", fN(x.orders))}`; },
    onClick: r => { S.region = rg.find(z => REG_SIG[z.r] === r.l).r; S.uf = ""; syncFilters(); } });
  const mm = monthly();
  barChart($("#stackChart"), {
    labels: mm.map((_, i) => mlabel(S.m0 + i)), h: 220, stacked: true, fmt: fN,
    series: [{ name: "No prazo", values: mm.map(x => x.delivered - x.lateN), color: "var(--s1)" }, { name: "Atrasados", values: mm.map(x => x.lateN), color: "var(--crit)" }],
    tip: i => tr("No prazo", fN(mm[i].delivered - mm[i].lateN), "var(--s1)") + tr("Atrasados", fN(mm[i].lateN), "var(--crit)") + tr("Taxa de atraso", fP(mm[i].late)),
    table: { cols: ["Mês", "No prazo", "Atrasados", "Taxa"], rows: mm.map((x, i) => [mlabel(S.m0 + i), fN(x.delivered - x.lateN), fN(x.lateN), fP(x.late)]) },
  });
  renderCapac(); renderSellers();
}

/* ---------------- capacidade (volume × atraso por semana) e vendedores (postagem) ---------------- */
function weekPoints(ufs = scopeUfs()) {
  const set = new Set(ufs.map(u => UI[u])), acc = new Map();
  for (const r of D.wk || []) { if (!set.has(r[1])) continue; let o = acc.get(r[0]); if (!o) acc.set(r[0], o = { w: r[0], o: 0, d: 0, l: 0 }); o.o += r[2]; o.d += r[3]; o.l += r[4]; }
  const out = [];
  for (const o of acc.values()) {
    const st = new Date(D.weeks[o.w] + "T12:00:00"), mid = new Date(st.getTime() + 3 * 864e5), ym = mid.getFullYear() + "-" + String(mid.getMonth() + 1).padStart(2, "0"), mi = M.indexOf(ym);
    if (mi < S.m0 || mi > S.m1 || o.d < MIN_N) continue;
    out.push({ ...o, mi, ev: EVM.has(mi), rate: o.l / o.d, lbl: D.weeks[o.w] });
  }
  return out.sort((a, b) => a.w - b.w);
}
function olsFit(pts, fx, fy) {
  const n = pts.length; if (n < 4) return null;
  const mx = pts.reduce((s, p) => s + fx(p), 0) / n, my = pts.reduce((s, p) => s + fy(p), 0) / n;
  let sxy = 0, sxx = 0, syy = 0; pts.forEach(p => { const dx = fx(p) - mx, dy = fy(p) - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; });
  return { b: sxy / (sxx || 1), r: sxy / Math.sqrt((sxx * syy) || 1), n };
}
function renderCapac() {
  const el = $("#capChart"), pts = weekPoints();
  if (!D.wk || pts.length < 4) { el.innerHTML = `<p class="note">Poucas semanas com ${MIN_N}+ entregas neste recorte.</p>`; $("#capNote").textContent = ""; return; }
  const w = el.clientWidth || 520, h = 300, ml = 46, mr = 12, mt = 10, mb = 42, iw = w - ml - mr, ih = h - mt - mb;
  const xm = niceMax(Math.max(...pts.map(p => p.o))), ym = niceMax(Math.max(...pts.map(p => p.rate)) * 1.05), X = v => ml + v / xm * iw, Y = v => mt + ih - v / ym * ih;
  const nor = pts.filter(p => !p.ev), fit = olsFit(nor, p => p.o, p => p.rate);
  let sv = `<svg height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Pedidos por semana contra taxa de atraso">`;
  for (let t = 0; t <= 4; t++) { const yy = Y(ym * t / 4), xx = X(xm * t / 4); sv += `<line class="grid-l" x1="${ml}" x2="${w - mr}" y1="${yy}" y2="${yy}"/><g class="ax"><text x="${ml - 8}" y="${yy + 4}" text-anchor="end">${fP(ym * t / 4, 0)}</text><text x="${xx}" y="${h - 22}" text-anchor="middle">${fK(xm * t / 4)}</text></g>`; }
  if (fit) { const mx = nor.reduce((s, p) => s + p.o, 0) / nor.length, my = nor.reduce((s, p) => s + p.rate, 0) / nor.length, x0 = Math.min(...nor.map(p => p.o)), x1 = Math.max(...nor.map(p => p.o)); sv += `<line x1="${X(x0)}" x2="${X(x1)}" y1="${Y(my + fit.b * (x0 - mx))}" y2="${Y(my + fit.b * (x1 - mx))}" stroke="var(--ink-3)" stroke-width="1.5" stroke-dasharray="5 4"/>`; }
  pts.forEach(p => { sv += `<circle cx="${X(p.o)}" cy="${Y(p.rate)}" r="5" fill="${p.ev ? "var(--crit)" : "var(--s1)"}" fill-opacity=".6" stroke="var(--card)" stroke-width="2"/>`; });
  sv += `<circle class="sel" r="0" fill="none" stroke="var(--ink)" stroke-width="2"/><rect class="hov" x="${ml}" y="${mt}" width="${iw}" height="${ih}" fill="transparent"/><text x="${w - mr}" y="${h - 4}" text-anchor="end" font-size="10.5" fill="var(--ink-3)">pedidos por semana (compra)</text></svg>`;
  el.innerHTML = sv;
  const svg = el.querySelector("svg"), selc = svg.querySelector(".sel");
  svg.querySelector(".hov").addEventListener("mousemove", e => {
    const r = svg.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top; let best = null, bd = 1600;
    pts.forEach(p => { const d = (X(p.o) - mx) ** 2 + (Y(p.rate) - my) ** 2; if (d < bd) { bd = d; best = p; } });
    if (!best) { hideTip(); selc.setAttribute("r", 0); return; }
    selc.setAttribute("cx", X(best.o)); selc.setAttribute("cy", Y(best.rate)); selc.setAttribute("r", 8);
    showTip(`<div class="tt">Semana de ${best.lbl.split("-").reverse().join("/")}</div>${tr("Pedidos", fN(best.o))}${tr("Atraso", fP(best.rate))}${best.ev ? `<div class="tr" style="color:var(--crit)">mês de evento</div>` : ""}`, e.clientX, e.clientY);
  });
  svg.querySelector(".hov").addEventListener("mouseleave", () => { hideTip(); selc.setAttribute("r", 0); });
  const evN = pts.length - nor.length;
  $("#capNote").innerHTML = (fit ? `Fora dos meses de evento (${fit.n} semanas): cada <b>+1.000 pedidos/semana</b> ↔ <b>${fit.b >= 0 ? "+" : "−"}${f1(Math.abs(fit.b) * 1000 * 100)} p.p.</b> de atraso (r = ${f2(fit.r)}). ` : "") +
    (evN ? `Em vermelho, ${evN} semanas de meses com evento mapeado. ` : "") + `Correlação entre volume e atraso, não prova de gargalo de capacidade: precisa de dado de ocupação do CD/frota para isso. ${D.meta.real ? "" : "Na simulação o volume só se liga ao atraso através dos eventos."}`;
}
function sellerRows() {
  const acc = new Map();
  for (const r of D.selr || []) { if (r[0] < S.m0 || r[0] > S.m1) continue; let o = acc.get(r[1]); if (!o) acc.set(r[1], o = { k: r[1], o: 0, d: 0, l: 0, h: 0, t: 0, dy: 0 }); o.o += r[2]; o.d += r[3]; o.l += r[4]; o.h += r[5]; o.t += r[6]; o.dy += r[7]; }
  return [...acc.values()].filter(o => o.d >= MIN_N).map(o => ({ ...o, id: D.sel[o.k][0], uf: D.sel[o.k][1], hand: o.h / o.d, trans: o.t / o.d, late: o.l / o.d, ci: wilson(o.l, o.d) }));
}
function renderSellers() {
  const rows = sellerRows(), el = $("#sellerTable");
  if (rows.length < 5) { el.innerHTML = `<p class="note">Poucos vendedores com ${MIN_N}+ entregas neste período.</p>`; $("#sellerNote").textContent = ""; return; }
  const hs = rows.map(r => r.hand).sort((a, b) => a - b), med = hs[Math.floor(hs.length / 2)], tot = rows.reduce((s, r) => s + r.d, 0);
  const gain = rows.reduce((s, r) => s + Math.max(0, r.hand - med) * r.d, 0) / tot, worst = rows.filter(r => r.hand > med * 1.5);
  const corr = olsFit(rows, r => r.hand, r => r.late);
  $("#sellerNote").innerHTML = `<b>${rows.length}</b> vendedores com ${MIN_N}+ entregas (${fP(tot / (agg(S.m0, S.m1, U).delivered || 1), 0)} das entregas do período). Postagem mediana <b>${f1(med)} d</b>; <b>${worst.length}</b> vendedores levam mais de 1,5× a mediana. Se todos os acima da mediana chegassem nela, a postagem média cairia <b>${f1(gain)} d</b>${corr ? ` · entre vendedores, +1 d de postagem ↔ ${corr.b >= 0 ? "+" : "−"}${f1(Math.abs(corr.b) * 100)} p.p. de atraso (r = ${f2(corr.r)})` : ""}. Não filtra por UF de destino.${D.meta.real ? "" : " Na simulação, a ligação entre postagem e atraso é construída no gerador."}`;
  const list = rows.slice().sort((a, b) => b.hand * Math.sqrt(b.d) - a.hand * Math.sqrt(a.d)).slice(0, 14);
  const raw = list.map(r => [r.id, r.d, r.hand, r.hand - med, r.late]);
  sortableTable(el, {
    cols: ["Vendedor", "Entregas", "Postagem", "vs mediana", "Atraso"], html: [true, false, false, false, true], sort: 2, dir: -1, raw,
    rows: list.map(r => [`<span class="route-tag">${r.id} <b>·</b> ${r.uf}</span>`, fN(r.d), f1(r.hand) + " d", (r.hand - med >= 0 ? "+" : "−") + f1(Math.abs(r.hand - med)) + " d", `<span class="badge ${r.late > .12 ? "bad" : r.late > .07 ? "mid" : "good"}" title="IC 95%: ${fP(r.ci[0])} a ${fP(r.ci[1])}">${fP(r.late)}</span>`]),
  });
}

function renderReceita() {
  const a = agg(), cp = cmpPair(), p = cp.prev, c = cp.cur || a; CMPL = cp.lbl;
  $("#kpiReceita").innerHTML = [
    kpiCard({ lbl: "Receita de frete", val: fR(a.freight), d: delta(c.freight, p && p.freight), sub: `<span>${fRs(a.freight / a.orders)} por pedido · o que o cliente paga pelo transporte</span>` }),
    kpiCard({ lbl: "Custo de transporte (modelo)", val: fR(a.cost), d: delta(c.cost, p && p.cost, { better: "down" }), sub: `<span>${fRs(a.costPer)} por entrega · R$ ${f2(COST.a)} fixo + variável por kg e km (calibrado p/ margem nacional de ${fP(MARGEM_REF, 0)})</span>` }),
    kpiCard({ lbl: "Margem de frete (modelo)", val: fP(a.margin, 0), d: delta(c.margin, p && p.margin, { pp: true }), sub: `<span>${fR(a.freight - a.cost)} · ${S.uf || S.region ? "depende só da premissa de custo: compare, não leia como valor" : "referência assumida (22%), não medida"}</span>` }),
    kpiCard({ lbl: "GMV transportado", val: fR(a.gmv), d: delta(c.gmv, p && p.gmv), sub: `<span>valor das mercadorias, não é receita da transportadora</span>` }),
    kpiCard({ lbl: "Ticket médio", val: fRs(a.ticket), d: delta(c.ticket, p && p.ticket), sub: `<span>produtos + frete por pedido; frete = ${fP(a.fshare)}</span>` }),
  ].join("");
  const mm = monthly();
  barChart($("#revMonth"), {
    labels: mm.map((_, i) => mlabel(S.m0 + i)), h: 318, stacked: true, fmt: fR, tick: v => fRk(v),
    series: [{ name: "Produtos", values: mm.map(x => x.gmv), color: "var(--s1)" }, { name: "Frete", values: mm.map(x => x.freight), color: "var(--s2)" }],
    tip: i => tr("Produtos", fR(mm[i].gmv), "var(--s1)") + tr("Frete", fR(mm[i].freight), "var(--s2)") + tr("Total", fR(mm[i].rev)) + tr("Pedidos", fN(mm[i].orders)),
    labelsOn: (() => { const v = mm.map(x => x.rev); return [v.indexOf(Math.max(...v))]; })(),
    table: { cols: ["Mês", "Produtos", "Frete", "Total", "Pedidos", "Ticket"], rows: mm.map((x, i) => [mlabel(S.m0 + i), fR(x.gmv), fR(x.freight), fR(x.rev), fN(x.orders), fRs(x.ticket)]) },
  });
  const pays = [["Cartão de crédito", a.credit, "var(--s1)"], ["Boleto", a.boleto, "var(--s2)"], ["Voucher", a.voucher, "var(--s3)"], ["Débito", a.debit, "#c98500"]];
  $("#payBar").innerHTML = `<div class="segbar">${pays.map(([n, v, c]) => `<div style="flex:${v};background:${c}" title="${n}: ${fP(v)}">${v > .12 ? `<b>${fP(v, 0)}</b><span>${n}</span>` : ""}</div>`).join("")}</div><div class="seg-lgd">${pays.map(([n, v, c]) => `<span><i style="background:${c}"></i>${n} <b class="num">${fP(v)}</b></span>`).join("")}</div>`;
  $("#payStats").innerHTML = `<div><div class="l">Parcelas</div><div class="v">${f1(a.inst)}x</div></div><div><div class="l">Boleto</div><div class="v">${fP(a.boleto, 0)}</div></div><div><div class="l">Não entregues</div><div class="v">${fP(a.notDel)}</div></div>`;
  const rg = REGIOES.map(r => ({ r, ...agg(S.m0, S.m1, U.filter(u => REG[u] === r)) }));
  hbars($("#regTicket"), rg.map(x => ({ l: REG_SIG[x.r], title: x.r, v: x.ticket, hl: S.region === x.r, dim: S.region && S.region !== x.r })), { fmt: fRs, lw: "30px", vw: "84px",
    tip: r => { const x = rg.find(z => REG_SIG[z.r] === r.l); return `<div class="tt">${x.r}</div>${tr("Ticket", fRs(x.ticket))}${tr("Frete médio", fRs(x.freight / x.orders))}${tr("Pedidos", fN(x.orders))}`; } });
  const st = regionUfs().map(u => ({ u, ...aggUf(u) })).filter(x => x.orders > 0).sort((x, y) => y.fshare - x.fshare);
  hbars($("#freightUf"), st.map(x => ({ l: x.u, v: x.fshare, hl: x.u === S.uf, title: D.geo[x.u].nome })), {
    fmt: v => fP(v), color: "var(--s2)", lw: "30px", vw: "60px",
    tip: r => { const x = st.find(z => z.u === r.l); return `<div class="tt">${D.geo[x.u].nome}</div>${tr("Frete / pedido", fP(x.fshare))}${tr("Frete médio", fRs(x.freight / x.orders))}${tr("Ticket", fRs(x.ticket))}${tr("Prazo médio", f1(x.days) + " d")}`; },
    onClick: r => { S.uf = r.l; syncFilters(); },
    table: { cols: ["UF", "Frete/pedido", "Frete médio", "Ticket", "Pedidos"], rows: st.map(x => [x.u, fP(x.fshare), fRs(x.freight / x.orders), fRs(x.ticket), fN(x.orders)]) },
  });
  const cs = cats().filter(c => c.o > 0), totG = cs.reduce((s, c) => s + c.g, 0), mg = Math.max(...cs.map(c => c.g));
  const raw = cs.map(c => [c.n, c.o, c.g, c.g / c.o, c.l / (c.d || 1)]);
  sortableTable($("#catTable"), {
    cols: ["Categoria", "Pedidos", "Receita", "Ticket", "Atraso"], html: [false, false, true, false, true], sort: 2, dir: -1, raw,
    rows: cs.map(c => [c.n, fN(c.o), `${fR(c.g)}<span class="bar-in" style="width:${c.g / mg * 60}px"></span>`, fRs(c.g / c.o), `<span class="badge ${c.l / c.d > .1 ? "bad" : c.l / c.d > .07 ? "mid" : "good"}">${fP(c.l / (c.d || 1))}</span>`]),
  });
}

function renderRotas() {
  const cs = corridors(), totO = cs.reduce((s, c) => s + c.o, 0);
  const local = cs.filter(c => c.so === c.de).reduce((s, c) => s + c.o, 0);
  const fromSP = cs.filter(c => c.so === "SP").reduce((s, c) => s + c.o, 0);
  const wd = cs.filter(c => c.distAny > 0); const avgDist = wd.reduce((s, c) => s + c.distAny * c.o, 0) / (wd.reduce((s, c) => s + c.o, 0) || 1);
  const slow = cs.filter(c => c.o >= MIN_N).sort((x, y) => y.days - x.days)[0];
  $("#kpiRotas").innerHTML = [
    kpiCard({ lbl: "Corredores ativos", val: fN(cs.length), sub: `<span>${fN(cs.filter(c => c.o >= MIN_N).length)} com ${MIN_N}+ pedidos</span>` }),
    kpiCard({ lbl: "Saem de SP", val: fP(fromSP / totO, 0), sub: "<span>dependência do hub paulista</span>" }),
    kpiCard({ lbl: "Entrega local", val: fP(local / totO, 0), sub: "<span>vendedor e cliente na mesma UF</span>" }),
    kpiCard({ lbl: "Distância média", val: `${fN(avgDist)}<small>km</small>`, sub: `<span>rodoviária estimada (${D.meta.real ? "CEP" : "simulada"} × ${f1(CIRC)}), ponderada</span>` }),
    kpiCard({ lbl: "Corredor mais lento", val: slow ? `${slow.so}→${slow.de}` : "–", sub: slow ? `<span>${f1(slow.days)} d · ${fP(slow.late)} de atraso</span>` : "" }),
  ].join("");
  // heatmap origem x região destino
  const rows = D.sellers.filter(s => cs.some(c => c.so === s)), cols = REGIOES;
  const cell = {}; cs.forEach(c => { const k = c.so + "|" + REG[c.de]; const o = cell[k] || (cell[k] = { o: 0, l: 0, d: 0, e: 0 }); o.o += c.o; o.l += c.l; o.d += c.days * c.o; o.e += c.est * c.o; });
  const lateMax = Math.max(.15, ...Object.values(cell).filter(x => x.o >= MIN_N).map(x => x.l / x.o));
  const heatCol = v => `color-mix(in srgb, var(--crit) ${Math.round(4 + 86 * Math.pow(Math.min(1, v / lateMax), 1.4))}%, var(--card-2))`;
  const el = $("#heatChart");
  el.innerHTML = `<div style="display:grid;grid-template-columns:62px repeat(${cols.length},1fr) 70px;gap:3px;font-size:12px">
    <div></div>${cols.map(c => `<div style="text-align:center;color:var(--ink-3);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;padding-bottom:4px" title="${c}">${REG_SIG[c]}</div>`).join("")}<div style="text-align:right;color:var(--ink-3);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase">pedidos</div>
    ${rows.map(r => `<div style="display:flex;align-items:center;font-weight:600;color:var(--ink-2)">${r}</div>${cols.map(c => { const x = cell[r + "|" + c]; if (!x) return `<div style="height:38px;border-radius:6px;background:var(--card-2);display:grid;place-items:center;color:var(--ink-3)">–</div>`; if (x.o < MIN_N) return `<div class="hc" data-k="${r}|${c}" style="height:38px;border-radius:6px;background:var(--card-2);display:grid;place-items:center;color:var(--ink-3);cursor:default" title="Amostra pequena">–</div>`; const v = x.l / x.o; return `<div class="hc" data-k="${r}|${c}" style="height:38px;border-radius:6px;background:${heatCol(v)};display:grid;place-items:center;font-family:var(--mono);font-weight:500;color:${v / lateMax > .6 ? "#fff" : "var(--ink)"};cursor:default">${fP(v, 0)}</div>`; }).join("")}<div class="num" style="display:flex;align-items:center;justify-content:flex-end;color:var(--ink-2)">${fK(cs.filter(c => c.so === r).reduce((s, c) => s + c.o, 0))}</div>`).join("")}
  </div><div style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:11px;color:var(--ink-3)">Atraso <span style="flex:0 0 140px;height:8px;border-radius:4px;background:linear-gradient(90deg,${heatCol(0)},${heatCol(lateMax)})"></span><span class="num">0% → ${fP(lateMax, 0)}+</span><span style="margin-left:8px">– = menos de ${MIN_N} pedidos (taxa instável)</span></div>`;
  el.querySelectorAll(".hc[data-k]").forEach(d => { const x = cell[d.dataset.k], [r, c] = d.dataset.k.split("|"); d.addEventListener("mousemove", e => { const ci = wilson(x.l, x.o); showTip(`<div class="tt">${r} → ${c}</div>${tr("Pedidos", fN(x.o))}${x.o < MIN_N ? `<div class="tr" style="color:#7f8f8b">amostra pequena: taxa não confiável</div>` : ""}${tr("Atraso", fP(x.l / x.o))}${tr("IC 95%", fP(ci[0]) + " a " + fP(ci[1]))}${tr("Prazo real", f1(x.d / x.o) + " d")}${tr("Prometido", f1(x.e / x.o) + " d")}`, e.clientX, e.clientY); }); d.addEventListener("mouseleave", hideTip); });
  TABLES.heatChart = { cols: ["Origem", ...cols.map(c => c + " (atraso)")], rows: rows.map(r => [r, ...cols.map(c => { const x = cell[r + "|" + c]; return x && x.o >= MIN_N ? fP(x.l / x.o) + " · " + fN(x.o) : "–"; })]) };

  // scatter
  const pts = cs.filter(c => c.o >= 30 && c.dist != null);  // regressão sobre TRANSPORTE (sem aprovação nem postagem)
  const sx = $("#scatChart"), w = sx.clientWidth || 600, h = 470, ml = 46, mr = 12, mt = 10, mb = 30, iw = w - ml - mr, ih = h - mt - mb;
  const xm = niceMax(Math.max(...pts.map(p => p.dist), 100)), ym = niceMax(Math.max(...pts.map(p => p.trans), 5) * 1.05);
  const X = v => ml + v / xm * iw, Y = v => mt + ih - v / ym * ih, om = Math.max(...pts.map(p => p.o), 1);
  let sw = 0, sxx = 0, sy = 0, sxy = 0, sx2 = 0; pts.forEach(p => { const wt = Math.sqrt(p.o); sw += wt; sxx += wt * p.dist; sy += wt * p.trans; sxy += wt * p.dist * p.trans; sx2 += wt * p.dist * p.dist; });
  const b1 = (sw * sxy - sxx * sy) / (sw * sx2 - sxx * sxx || 1), b0 = (sy - b1 * sxx) / (sw || 1);
  let s = `<svg height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Distância por tempo de transporte dos corredores">`;
  for (let t = 0; t <= 4; t++) { const yy = Y(ym * t / 4), xx = X(xm * t / 4); s += `<line class="grid-l" x1="${ml}" x2="${w - mr}" y1="${yy}" y2="${yy}"/><g class="ax"><text x="${ml - 8}" y="${yy + 4}" text-anchor="end">${fN(ym * t / 4)} d</text><text x="${xx}" y="${h - 10}" text-anchor="middle">${fK(xm * t / 4)} km</text></g>`; }
  s += `<line x1="${X(0)}" y1="${Y(b0)}" x2="${X(xm)}" y2="${Y(b0 + b1 * xm)}" stroke="var(--ink-3)" stroke-width="1.5"/><text x="${X(xm) - 4}" y="${Y(b0 + b1 * xm) - 6}" text-anchor="end" font-size="11" fill="var(--ink-3)">tendência · ${f1(b1 * 1000)} d a cada 1.000 km (intercepto ${f1(b0)} d)</text><line x1="${X(0)}" y1="${Y(FLOOR.base)}" x2="${X(xm)}" y2="${Y(FLOOR.base + xm / FLOOR.kmDia)}" stroke="var(--s1)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${X(xm) - 4}" y="${Y(FLOOR.base + xm / FLOOR.kmDia) + 14}" text-anchor="end" font-size="11" fill="var(--s1)">piso físico · 1 d + km ÷ ${FLOOR.kmDia}</text>`;
  const PP = pts.map(p => { const exp = b0 + b1 * p.dist, slowR = p.trans > exp * 1.18; return { p, x: X(p.dist), y: Y(p.trans), r: 3 + 13 * Math.sqrt(p.o / om), slowR }; }).sort((a, b) => b.r - a.r);
  PP.forEach(q => { s += `<circle cx="${q.x}" cy="${q.y}" r="${q.r}" fill="${q.slowR ? "var(--crit)" : "var(--s1)"}" fill-opacity=".55" stroke="var(--card)" stroke-width="2"/>`; });
  const placed = []; PP.filter(q => q.slowR).sort((a, b) => b.p.o - a.p.o).forEach(q => { if (placed.length >= 5) return; const lx = q.x + q.r + 4, ly = q.y + 4; if (placed.some(([x, y]) => Math.abs(x - lx) < 70 && Math.abs(y - ly) < 14)) return; placed.push([lx, ly]); s += `<text x="${lx}" y="${ly}" font-size="11" fill="var(--ink-2)" font-family="var(--mono)">${q.p.key}</text>`; });
  s += `<circle class="sel" r="0" fill="none" stroke="var(--ink)" stroke-width="2"/><rect class="hov" x="${ml}" y="${mt}" width="${iw}" height="${ih}" fill="transparent"/></svg>`;
  sx.innerHTML = s;
  const svg = sx.querySelector("svg"), selc = svg.querySelector(".sel");
  svg.querySelector(".hov").addEventListener("mousemove", e => {
    const r = svg.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = null, bd = 900; PP.forEach(q => { const d = (q.x - mx) ** 2 + (q.y - my) ** 2 - q.r * q.r; if (d < bd) { bd = d; best = q; } });
    if (!best) { hideTip(); selc.setAttribute("r", 0); return; }
    selc.setAttribute("cx", best.x); selc.setAttribute("cy", best.y); selc.setAttribute("r", best.r + 3);
    const c = best.p; showTip(`<div class="tt">${c.so} → ${c.de}</div>${tr("Distância", fN(c.dist) + " km")}${tr("Prazo real", f1(c.days) + " d")}${tr("Esperado pela distância", f1(b0 + b1 * c.dist) + " d")}${tr("Atraso", fP(c.late))}${tr("Pedidos", fN(c.o))}`, e.clientX, e.clientY);
  });
  svg.querySelector(".hov").addEventListener("mouseleave", () => { hideTip(); selc.setAttribute("r", 0); });

  // tabela de corredores
  const q = ($("#corrSearch").value || "").toUpperCase().replace(/\s|-|>/g, "").replace("→", "");
  const list = cs.filter(c => c.o >= 10 && (!q || (c.so + c.de).includes(q) || c.so === q || c.de === q)).sort((a, b) => b.o - a.o);
  $("#corrSub").textContent = `${fN(list.length)} corredores com 10+ pedidos · ${scopeLabel()} · * = menos de ${MIN_N} pedidos (taxa instável) · custo e margem são modelo`;
  const lateCell = c => c.lowN ? `<span class="badge" style="opacity:.55" title="Amostra pequena: IC 95% ${fP(c.ci[0])} a ${fP(c.ci[1])}">${fP(c.late, 0)}*</span>` : `<span class="badge ${c.late > .12 ? "bad" : c.late > .07 ? "mid" : "good"}">${fP(c.late)}</span> <small class="ci">±${f1((c.ci[1] - c.ci[0]) / 2 * 100)}</small>`;
  const raw = list.map(c => [c.key, c.o, c.dist ?? -1, c.kg, c.days, c.trans, c.est - c.days, c.late, c.frete, c.cost, c.margin, c.nota]);
  sortableTable($("#corrTable"), {
    cols: ["Corredor", "Pedidos", "Dist. rod. (est.)", "Peso méd.", "Prazo real", "Transporte", "Folga", "Atraso", "Frete", "Custo (modelo)", "Margem (modelo)", "Nota"],
    html: [true, false, false, false, false, false, false, true, false, false, true, false], sort: 1, dir: -1, raw,
    rows: list.map(c => [`<span class="route-tag">${c.so} <b>→</b> ${c.de}</span>`, fN(c.o), c.dist == null ? "–" : fN(c.dist) + " km", f1(c.kg) + " kg", f1(c.days) + " d", f1(c.trans) + " d", f1(c.est - c.days) + " d", lateCell(c), fRs(c.frete), fRs(c.cost), `<span class="ci" title="Margem do modelo de custo: depende da premissa (peso e km). Compare corredores entre si; não é valor contábil.">≈ ${fN(Math.round(c.margin * 20) * 5)}%</span>`, f2(c.nota)]),
  });
}

/* ---------------- simulador: ganho por corredor com piso físico, custo e meta por região ---------------- */
// premissas de custo da melhoria (ajustáveis na tela)
const SIMP = { prem: 6, late: 20, sel: 20, acc: 70, conv: 1.5, contrib: 18 };  // prêmio de expresso (%/dia) · custo de um atraso (R$) · % de pedidos acelerados · acerto da triagem (%) · queda de conversão por dia de promessa (%) · contribuição de um pedido perdido (R$)
const HAND_COST = 1.5;                          // R$/pedido por dia ganho na postagem (coletas extras)
const MODE_LBL = { struct: "operação normal (sem meses de evento)", all: "período completo (com eventos)", event: "só meses de evento" };
function simCorr(ufs, months) {
  const set = new Set(ufs.map(u => UI[u])), ms = new Set(months), map = new Map();
  for (const r of CORR) {
    if (!ms.has(r[0]) || !set.has(r[2])) continue;
    const k = r[1] * 100 + r[2]; let o = map.get(k); if (!o) { o = { s: r[1], c: r[2], o: 0, t: 0, h: 0, k: 0, d: 0, e: 0, l: 0, w: 0 }; map.set(k, o); }
    o.o += r[3]; o.l += r[4]; o.d += r[5]; o.e += r[6]; o.t += r[10]; o.h += r[11]; o.k += r[12]; o.w += r[13];
  }
  return [...map.values()].map(o => { const km = o.k / o.o * CIRC; return { ...o, trans: o.t / o.o, hand: o.h / o.o, km, floorT: FLOOR.base + km / FLOOR.kmDia, cost: costOf(1, o.w / o.o) }; });
}
function shiftHist(h, g) { // desloca a distribuição g dias (fracionário) para mais cedo
  const out = new Array(h.length).fill(0), gi = Math.floor(g), f = g - gi;
  h.forEach((c, i) => { if (c) { out[Math.max(0, i - gi)] += c * (1 - f); if (f) out[Math.max(0, i - gi - 1)] += c * f; } });
  return out;
}
// tv: dias a ganhar no transporte · hv: na postagem · ev: dias de folga na promessa (não é ganho físico)
const CRIT_LATE = 2 * (1 - SLA_META);           // corredor crítico: atraso acima do dobro do tolerado pela meta
// separa os k pedidos de maior valor (mais atrasados) de um histograma ordenado por dias vs prometido
function takeTop(h, k) {
  const top = new Array(h.length).fill(0); let left = k;
  for (let i = h.length - 1; i >= 0 && left > 1e-9; i--) { const t = Math.min(h[i], left); top[i] = t; left -= t; }
  return top;
}
// sel = % dos pedidos do escopo que recebem a aceleração (100 = corredor inteiro) · acc = % desses que a triagem acertou (os mais atrasados);
// o resto é sorteado ao acaso. Triagem perfeita (acc 100) é um teto otimista: na prática o risco só é conhecido em trânsito.
function simRun(ufs, { tv = 0, hv = 0, ev = 0, mode = "struct", where = "all", prem = SIMP.prem, lateCost = SIMP.late, sel = 100, acc = 100, conv = SIMP.conv, contrib = SIMP.contrib } = {}) {
  const months = monthsOf(mode), nb = D.diffMax - D.diffMin + 1, before = new Array(nb).fill(0), after = new Array(nb).fill(0);
  let n = 0, late0 = 0, late1 = 0, r0 = 0, r1 = 0, gT = 0, gH = 0, atFloor = 0, onCnt = 0, costT = 0, costH = 0, d0 = 0, e0 = 0, orders = 0, accN = 0;
  const f = Math.min(1, sel / 100), q = Math.min(1, acc / 100);
  for (const u of ufs) {
    const hu = diffDist([u], months), Nu = hu.reduce((a, b) => a + b, 0); if (!Nu) continue;
    const cs = simCorr([u], months), O = cs.reduce((a, c) => a + c.o, 0) || 1;
    for (const c of cs) {
      const w = c.o / O, on = where === "all" || (c.o >= MIN_N && c.l / c.o > CRIT_LATE);   // alvo: todos os corredores ou só os críticos
      const gt = on ? Math.min(tv, Math.max(0, c.trans - c.floorT)) : 0, gh = on ? Math.min(hv, Math.max(0, c.hand - FLOOR.hand)) : 0;
      const part = hu.map(x => x * w), cnt = Nu * w, gain = gt + gh;
      let selH = part, rest = null;
      if (gain > 0 && f < 1) {                                   // aceleração seletiva: top (acerto) + sorteio entre o restante
        const K = f * cnt, top = takeTop(part, K * q), rem = part.map((x, i) => x - top[i]), remN = rem.reduce((a, b) => a + b, 0) || 1, rk = Math.min(remN, K * (1 - q));
        selH = top.map((x, i) => x + rem[i] * rk / remN); rest = part.map((x, i) => x - selH[i]);
      }
      const sh = shiftHist(selH, gain + ev); sh.forEach((x, i) => after[i] += x);
      if (rest) shiftHist(rest, ev).forEach((x, i) => after[i] += x);
      part.forEach((x, i) => before[i] += x);
      const nSel = gain > 0 ? (rest ? f * cnt : cnt) : 0;
      if (on) onCnt += cnt; gT += gt * nSel; gH += gh * nSel; accN += nSel; orders += cnt; d0 += c.d / c.o * cnt; e0 += c.e / c.o * cnt;
      if (on && tv > 0 && gt < tv - 1e-9) atFloor += cnt;
      costT += nSel * c.cost * (prem / 100 * gt + 0.25 * prem / 100 * gt * gt);   // prêmio cresce 25% ao dia (convexo), só sobre os pedidos acelerados
      costH += nSel * HAND_COST * gh;
    }
  }
  before.forEach((c, i) => { n += c; if (i + D.diffMin > 0) late0 += c; r0 += c * REVC[i]; });
  after.forEach((c, i) => { if (i + D.diffMin > 0) late1 += c; r1 += c * REVC[i]; });
  const fixed = late0 - late1, costOp = costT + costH;
  // custo da promessa mais longa: queda de conversão por dia de folga (limitada a 40%) x contribuição do pedido perdido
  const lost = n * Math.min(0.4, conv / 100 * ev), costProm = lost * contrib, cost = costOp + costProm;
  return { n, L0: late0 / (n || 1), L1: late1 / (n || 1), fixed, N0: r0 / (n || 1), N1: r1 / (n || 1), before, after, orders,
    gT: gT / (accN || 1), gH: gH / (accN || 1), accN, accShare: accN / (orders || 1), ev, tv, hv, onShare: onCnt / (orders || 1), atFloor: atFloor / (onCnt || 1), days0: d0 / (orders || 1), est0: e0 / (orders || 1),
    cost, costOp, costProm, lost, costT, costH, costPer: costOp / (orders || 1), costPerAvoided: fixed > 0 ? cost / fixed : NaN, benefit: fixed * lateCost, net: fixed * lateCost - cost, lateCost, mode };
}
function bestMsg(f) {
  const money2 = x => (x < 0 ? "−" : "+") + fR(Math.abs(x)), par = x => `−${x.tv} d transp.${x.hv ? " + 1 d post." : ""}, ${x.sel}% dos pedidos`;
  if (!f.best) return "Nenhuma combinação evita atrasos neste escopo.";
  const b = f.best, e = f.bestEff;
  return f.pays ? ` Melhor cenário: <b>${par(b)}</b> → resultado <b>${money2(b.r.net)}</b> (${fN(b.r.fixed)} atrasos evitados a ${fRs(b.r.costPerAvoided)} cada; custo de um atraso = ${fRs(SIMP.late)}). Ganho pequeno: o equilíbrio está perto.`
    : ` Nenhuma combinação se paga com atraso = ${fRs(SIMP.late)}. O mais barato é <b>${par(e)}</b> a <b>${fRs(e.r.costPerAvoided)}</b> por atraso evitado: só compensa se um atraso custar mais que isso.`;
}
// melhor combinação (maior resultado líquido) nas premissas atuais: procura em grade; devolve também o custo de atraso de equilíbrio
function simBest(ufs, mode = "struct", where = "all", acc = SIMP.acc) {
  let best = null, bestEff = null;
  for (const tv of [1, 2, 3, 4, 6]) for (const hv of [0, 1]) for (const sel of [5, 10, 15, 20, 30, 40, 60, 100]) {
    const r = simRun(ufs, { tv, hv, mode, where, sel, acc }); if (!r.fixed) continue;
    if (!best || r.net > best.r.net) best = { tv, hv, sel, acc, r };
    if (!bestEff || r.costPerAvoided < bestEff.r.costPerAvoided) bestEff = { tv, hv, sel, acc, r };
  }
  return { best, bestEff, pays: !!best && best.r.net > 0 };
}
// menor ganho que atinge a meta usando só alavancas físicas (transporte primeiro, depois postagem), respeitando o piso
function simNeed(ufs, mode = "struct", meta = SLA_META, where = "all") {
  const ok = L => 1 - L >= meta, b = simRun(ufs, { mode });
  if (ok(b.L0)) return { tv: 0, hv: 0, reachable: true, already: true, L1: b.L0 };
  for (let tv = 1; tv <= 30; tv++) { const r = simRun(ufs, { tv, mode, where }); if (ok(r.L1)) return { tv, hv: 0, reachable: true, L1: r.L1, run: r }; }
  for (let hv = 1; hv <= 4; hv++) { const r = simRun(ufs, { tv: 30, hv, mode, where }); if (ok(r.L1)) return { tv: 30, hv, reachable: true, L1: r.L1, run: r }; }
  const best = simRun(ufs, { tv: 30, hv: 4, mode, where });
  return { tv: 30, hv: 4, reachable: false, L1: best.L1, run: best };
}
// conformidade com a meta por região (destino): estrutural, com eventos e viabilidade pelo piso
function slaByRegion(mode = "struct", sc = {}) {
  return REGIOES.map(r => {
    const ufs = U.filter(u => REG[u] === r), s = simRun(ufs, { mode: "struct" }), a = simRun(ufs, { mode: "all" }), need = simNeed(ufs, mode, SLA_META, sc.where), cen = simRun(ufs, { ...sc, mode });
    return { r, ufs, n: s.n, ok: 1 - s.L0, okAll: 1 - a.L0, gap: 1 - s.L0 - SLA_META, need, cen: 1 - cen.L1 };
  });
}
const needTxt = nd => nd.already ? "já cumpre" : nd.reachable ? `−${nd.tv >= 30 ? "máx." : nd.tv + " d"} transp.${nd.hv ? " + " + nd.hv + " d postagem" : ""}` : `não só com operação (piso: ${fP(1 - nd.L1)})`;

function renderSim() {
  const tv = +$("#sTrans").value, ev = +$("#sEst").value, hv = +$("#sHand").value, mode = ($("input[name=simBase]:checked") || {}).value || "struct", where = ($("input[name=simWhere]:checked") || {}).value || "all";
  SIMP.prem = +$("#cPrem").value; SIMP.late = +$("#cLate").value; SIMP.sel = +$("#sSel").value; SIMP.acc = +$("#sAcc").value; SIMP.conv = +$("#cConv").value; SIMP.contrib = +$("#cContrib").value;
  $("#vTrans").textContent = tv + (tv === 1 ? " dia" : " dias"); $("#vEst").textContent = ev + (ev === 1 ? " dia" : " dias"); $("#vHand").textContent = hv + (hv === 1 ? " dia" : " dias");
  $("#vPrem").textContent = SIMP.prem + "%"; $("#vLate").textContent = fRs(SIMP.late); $("#vSel").textContent = SIMP.sel + "%"; $("#vAcc").textContent = SIMP.acc + "%"; $("#vConv").textContent = f1(SIMP.conv) + "% por dia"; $("#vContrib").textContent = fRs(SIMP.contrib);
  const ufs = scopeUfs(), nm = S.uf ? D.geo[S.uf].nome : S.region || "Brasil", r = simRun(ufs, { tv, hv, ev, mode, where, sel: SIMP.sel, acc: SIMP.acc }), split = lateSplit(ufs, 0, NM - 1);
  $("#simScope").textContent = `${nm} · base: ${MODE_LBL[mode]} · ${where === "crit" ? `só corredores com atraso > ${fP(CRIT_LATE, 0)} (${fP(r.onShare, 0)} dos pedidos)` : "todos os corredores"} · ${fN(r.n)} entregas`;
  const lim = tv > 0 && r.atFloor > .005 ? `O piso físico limitou o transporte: pedido −${tv} d, realizado −${f1(r.gT)} d nos pedidos acelerados (${fP(r.atFloor, 0)} do escopo já está no piso do corredor).` : "";
  const money = x => (x < 0 ? "−" : "") + fR(Math.abs(x));
  const worth = r.cost <= 0 ? null : isFinite(r.costPerAvoided) ? r.costPerAvoided <= SIMP.late : false;
  $("#simOut").innerHTML = [
    ["Taxa de atraso", fP(r.L1), `hoje ${fP(r.L0)} · ${r.L1 < r.L0 ? "−" : "+"}${f1(Math.abs(r.L1 - r.L0) * 100)} p.p.`],
    ["Deixam de atrasar", fN(r.fixed), `${fP(r.fixed / (r.n * r.L0 || 1), 0)} dos atrasos da base`],
    ["Nota projetada", f2(r.N1) + " ★", `hoje ${f2(r.N0)} · +${f2(Math.max(0, r.N1 - r.N0))}`],
    ["Prazo real / prometido", `${f1(Math.max(1, r.days0 - (r.gT + r.gH) * r.accShare))} / ${f1(r.est0 + ev)} d`, `hoje ${f1(r.days0)} / ${f1(r.est0)} d`],
    ["Pedidos acelerados", r.accN ? fP(r.accShare, 0) : "–", r.accN ? `${fN(r.accN)} pedidos · triagem acerta ${SIMP.acc}% dos mais atrasados` : "sem alavanca física acionada"],
    ["Custo operacional", r.costOp ? money(r.costOp) : "R$ 0", r.costOp ? `${fRs(r.costOp / (r.accN || 1))} por pedido acelerado · expresso + postagem` : "–"],
    ["Custo da promessa longa", ev ? money(r.costProm) : "R$ 0", ev ? `${fN(r.lost)} pedidos perdidos (${f1(SIMP.conv)}%/dia × ${ev} d × ${fRs(SIMP.contrib)})` : "sem folga extra"],
    ["Custo por atraso evitado", isFinite(r.costPerAvoided) ? fRs(r.costPerAvoided) : "–", worth == null ? "mova um slider" : `custo total (operação + promessa) ÷ evitados: ${worth ? "abaixo" : "acima"} de ${fRs(SIMP.late)}`],
    ["Benefício estimado", r.cost || r.fixed ? money(r.benefit) : "–", `${fN(r.fixed)} atrasos evitados × ${fRs(SIMP.late)}`],
    ["Resultado líquido", r.cost ? money(r.net) : "–", r.cost ? `${r.net >= 0 ? "vale a pena" : "não se paga"} com atraso = ${fRs(SIMP.late)}` : ""],
  ].map(([l, v, f], i) => `<div class="sim-k${i > 4 ? " eco" : ""}"><div class="l">${l}</div><div class="v">${v}</div><div class="f">${f}</div></div>`).join("") + (lim ? `<div class="sim-note">${lim}</div>` : "") +
    (ev ? `<div class="sim-note">Folga na promessa não acelera nada: só empurra a data prometida. Custa conversão (premissa: ${f1(SIMP.conv)}% de pedidos a menos por dia prometido a mais, até 40%) e esse custo entra no resultado.</div>` : "");
  // meta por região + estrutural x evento
  const reg = slaByRegion(mode, { tv, hv, ev, where, sel: SIMP.sel, acc: SIMP.acc }), nd = simNeed(ufs, mode, SLA_META, where);
  const sp = split.hasEv ? `Atraso estrutural <b>${fP(split.base)}</b> (meses sem evento). Nos meses de evento a taxa vai a <b>${fP(split.evRate)}</b>; os eventos respondem por <b>${fN(split.excess)}</b> atrasos (${fP(split.excess / (split.late || 1), 0)} do total) e <b>não se resolvem com mais velocidade</b>: pedem plano de contingência.` : "";
  $("#simMeta").innerHTML = `<div class="sim-h">Meta de SLA: <b>${fP(SLA_META, 0)}</b> no prazo, por região de destino</div><table class="sim-tbl"><thead><tr><th>Região</th><th class="r">Estrutural</th><th class="r">Com eventos</th><th class="r">Gap</th><th class="r">No cenário</th><th>Para bater a meta</th></tr></thead><tbody>${reg.map(x => `<tr class="${S.region === x.r || (S.uf && REG[S.uf] === x.r) ? "sel" : ""}"><td>${x.r}</td><td class="r">${fP(x.ok)}</td><td class="r">${fP(x.okAll)}</td><td class="r ${x.gap >= 0 ? "ok" : "no"}">${x.gap >= 0 ? "+" : "−"}${f1(Math.abs(x.gap) * 100)} p.p.</td><td class="r ${x.cen >= SLA_META ? "ok" : "no"}">${fP(x.cen)}</td><td>${needTxt(x.need)}</td></tr>`).join("")}</tbody></table>` +
    `<p class="note" style="margin-top:8px">${sp}</p>` +
    `<div class="sim-h" style="margin-top:10px">${esc(nm)}: ${nd.already ? "já cumpre a meta." : nd.reachable ? `bate a meta (no agregado) com <b class="hl-a">−${nd.tv >= 30 ? "o máximo físico" : nd.tv + " d"} de transporte</b>${nd.hv ? ` e −${nd.hv} d de postagem` : ""}.${reg.filter(x => !x.need.reachable && !x.need.already).length ? ` <b>${reg.filter(x => !x.need.reachable && !x.need.already).map(x => x.r).join(", ")}</b> seguem abaixo mesmo no piso físico.` : ""} <button class="mini-btn" id="simApply">Aplicar</button>` : `<b class="hl-a">não bate a meta só com operação</b>: no piso físico do corredor fica em ${fP(1 - nd.L1)}. O resto exige rever a promessa ou a malha.`}</div>`;
  $("#simBest").innerHTML = `<button class="mini-btn" id="simFind">Achar o melhor cenário nas premissas atuais</button><span id="simFindOut"></span>`;
  $("#simFind").onclick = () => {
    const f = simBest(ufs, mode, where), msg = bestMsg(f);
    $("#simFindOut").innerHTML = msg + (f.best ? ` <button class="mini-btn" id="simFindApply">Aplicar</button>` : "");
    const fa = $("#simFindApply"); if (fa) fa.onclick = () => { const x = f.pays ? f.best : f.bestEff; $("#sTrans").value = x.tv; $("#sHand").value = x.hv; $("#sSel").value = x.sel; $("#sEst").value = 0; renderSim(); };
  };
  const ap = $("#simApply"); if (ap) ap.onclick = () => { $("#sTrans").value = Math.min(10, nd.tv); $("#sHand").value = nd.hv; $("#sSel").value = 100; $("#sEst").value = 0; renderSim(); };
  const lo = -35, hi = 20, lbl = [], b = [], s2 = [];
  for (let d = lo; d <= hi; d++) { lbl.push((d > 0 ? "+" : "") + d); b.push(r.before[d - D.diffMin]); s2.push(r.after[d - D.diffMin]); }
  barChart($("#simChart"), {
    labels: lbl, h: 230, lblW: 34, gapR: .78, fmt: fN,
    series: [{ name: "Hoje", values: b, colorAt: i => lo + i > 0 ? "color-mix(in srgb,var(--crit) 55%,var(--neutral))" : "var(--neutral)" }],
    line: { values: s2, color: "var(--accent)" },
    tip: i => tr("Dias vs prometido", lbl[i]) + tr("Hoje", fN(b[i]), "var(--neutral)") + tr("Simulado", fN(s2[i]), "var(--accent)"),
  });
}
["sTrans", "sEst", "sHand", "cPrem", "cLate", "sSel", "sAcc", "cConv", "cContrib"].forEach(id => $("#" + id).addEventListener("input", renderSim));
$$("input[name=simBase], input[name=simWhere]").forEach(x => x.addEventListener("change", renderSim));

/* ---------------- filtros e navegação ---------------- */
const m0s = $("#m0"), m1s = $("#m1"), ufs_ = $("#ufSel");
m0s.innerHTML = M.map((m, i) => `<option value="${i}">de ${mlabel(i)}</option>`).join("");
m1s.innerHTML = M.map((m, i) => `<option value="${i}">até ${mlabel(i)}</option>`).join("");
ufs_.innerHTML = `<option value="">Todas as UFs</option>` + REGIOES.map(r => `<optgroup label="${r}">${U.filter(u => REG[u] === r).sort().map(u => `<option value="${u}">${u} · ${D.geo[u].nome}</option>`).join("")}</optgroup>`).join("");
const PRESETS = { all: [0, NM - 1], "2017": [0, 11], "2018": [12, NM - 1], "6m": [NM - 6, NM - 1], bf: [10, 10] };
$$("#perSeg button").forEach(b => b.addEventListener("click", () => { [S.m0, S.m1] = PRESETS[b.dataset.p]; syncFilters(); }));
$$("#regSeg button").forEach(b => b.addEventListener("click", () => { S.region = b.dataset.r; S.uf = ""; syncFilters(); }));
m0s.addEventListener("change", () => { S.m0 = +m0s.value; if (S.m1 < S.m0) S.m1 = S.m0; syncFilters(); });
m1s.addEventListener("change", () => { S.m1 = +m1s.value; if (S.m0 > S.m1) S.m0 = S.m1; syncFilters(); });
ufs_.addEventListener("change", () => { S.uf = ufs_.value; if (S.uf) S.region = ""; syncFilters(); });
$("#corrSearch").addEventListener("input", () => renderRotas());

function syncFilters(render = true) {
  m0s.value = S.m0; m1s.value = S.m1; ufs_.value = S.uf;
  $$("#perSeg button").forEach(b => b.setAttribute("aria-pressed", PRESETS[b.dataset.p][0] === S.m0 && PRESETS[b.dataset.p][1] === S.m1));
  $$("#regSeg button").forEach(b => b.setAttribute("aria-pressed", !S.uf && b.dataset.r === S.region));
  $("#ufPill").innerHTML = S.uf ? `<span class="fpill">${D.geo[S.uf].nome}<button class="ask" data-uask="1" aria-label="Analisar ${D.geo[S.uf].nome} na Mesa de análise" title="Analisar na Mesa">✦</button><button aria-label="Remover filtro de UF" id="ufX">✕</button></span>` : "";
  if (S.uf) $("#ufX").onclick = () => { S.uf = ""; syncFilters(); };
  const pr = prevRange();
  $("#scopeNote").textContent = pr ? `Comparando com ${mlabel(pr[0])}${pr[0] !== pr[1] ? "–" + mlabel(pr[1]) : ""}` : S.m1 >= 12 ? "Δ: mesmos meses, 2018 × 2017" : "Sem base de comparação";
  writeURL();
  if (render) { renderView(); MAP.refresh(); }
  if (typeof MZ !== "undefined" && MZ.ui) MZ.ui.ctxRefresh();
}
function setView(v, push = true) {
  if (!document.getElementById("v-" + v)) v = "geral";
  S.view = v;
  $$(".tab").forEach(t => t.setAttribute("aria-selected", t.dataset.view === v));
  $$(".view").forEach(s => s.classList.toggle("on", s.id === "v-" + v));
  $$("[data-table]").forEach(b => { b.setAttribute("aria-pressed", "false"); b.textContent = "Tabela"; });
  if (push) writeURL();
  renderView(); MAP.setActive(v === "geral");
}
function renderView() {
  hideTip();
  ({ geral: renderGeral, prazo: renderPrazo, receita: renderReceita, rotas: renderRotas, simulador: renderSim })[S.view]();
  if (typeof MZ !== "undefined" && MZ.ui) MZ.ui.decorate();
}
function writeURL() {
  const p = new URLSearchParams(); if (S.m0 !== 0) p.set("de", M[S.m0]); if (S.m1 !== NM - 1) p.set("ate", M[S.m1]); if (S.region) p.set("regiao", S.region); if (S.uf) p.set("uf", S.uf);
  const qs = p.toString(); try { history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + "#" + S.view); } catch (e) { }
}
function readURL() {
  try {
    const p = new URLSearchParams(location.search);
    if (p.get("de") && M.includes(p.get("de"))) S.m0 = M.indexOf(p.get("de"));
    if (p.get("ate") && M.includes(p.get("ate"))) S.m1 = M.indexOf(p.get("ate"));
    if (REGIOES.includes(p.get("regiao"))) S.region = p.get("regiao");
    if (U.includes(p.get("uf"))) S.uf = p.get("uf");
    S.view = (location.hash || "#geral").slice(1);
  } catch (e) { }
}
$$(".tab").forEach(t => t.addEventListener("click", () => setView(t.dataset.view)));
$$("[data-goto]").forEach(b => b.addEventListener("click", () => setView(b.dataset.goto)));
addEventListener("hashchange", () => setView((location.hash || "#geral").slice(1), false));
let rT; addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => renderView(), 160); });

// tema
const themeBtn = $("#themeBtn");
try { const t = localStorage.getItem("trecho-theme"); if (t) document.documentElement.dataset.theme = t; } catch (e) { }
themeBtn.addEventListener("click", () => {
  const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = t; try { localStorage.setItem("trecho-theme", t); } catch (e) { }
  renderView();
});

/* ======================================================================
   MAPA — Brasil pontilhado, rotas, caminhões e pilares 3D (canvas)
   ====================================================================== */
const MAP = (() => {
  const wrap = $("#mapWrap"), cv = $("#mapCanvas"), ctx = cv.getContext("2d");
  const COS = Math.cos(15 * Math.PI / 180), OUT = GEO.outline;
  let W = 0, H = 0, DPR = 1, active = true, visible = true;
  let tilt = S.tilt ? 0.78 : 0, tiltT = tilt; const FOC = 70;
  const fu = (lon) => lon * COS, fv = lat => -lat;
  let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9;
  OUT.forEach(([lo, la]) => { bx0 = Math.min(bx0, fu(lo)); bx1 = Math.max(bx1, fu(lo)); by0 = Math.min(by0, fv(la)); by1 = Math.max(by1, fv(la)); });
  const cu = (bx0 + bx1) / 2, cvv = (by0 + by1) / 2;
  let K = 1, TX = 0, TY = 0;
  const raw = (u, v) => { const s = FOC / (FOC - v * Math.sin(tilt)); return [u * s, v * Math.cos(tilt) * s, s]; };
  const P = (lon, lat) => { const r = raw(fu(lon) - cu, fv(lat) - cvv); return [r[0] * K + TX, r[1] * K + TY, r[2]]; };
  function fit() {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    OUT.forEach(([lo, la]) => { const r = raw(fu(lo) - cu, fv(la) - cvv); x0 = Math.min(x0, r[0]); x1 = Math.max(x1, r[0]); y0 = Math.min(y0, r[1]); y1 = Math.max(y1, r[1]); });
    const small = W < 760, pt = small ? 120 : 96, pb = small ? 96 : 34, pl = small ? 16 : (W > 1100 ? 120 : 40), pr = small ? 16 : (W > 1100 ? 330 : 40);
    const sh = (H - pt - pb) / (y1 - y0) * (tilt > .3 ? 1.12 : 1), sw = (W - pl - pr) / (x1 - x0);
    K = Math.min(sh, sw);
    TX = pl + (W - pl - pr) / 2 - (x0 + x1) / 2 * K;
    TY = pt + (H - pt - pb) / 2 - (y0 + y1) / 2 * K + (tilt > .3 ? 10 : 0);
  }
  // pontos da malha (Voronoi ponderado por centróide)
  function inPoly(x, y) { let c = false; for (let i = 0, j = OUT.length - 1; i < OUT.length; j = i++) { const [xi, yi] = OUT[i], [xj, yj] = OUT[j]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; } return c; }
  const STEP = 0.42, DOTS = [];
  for (let la = 5.3; la > -34; la -= STEP) for (let lo = -74.2; lo < -34.6; lo += STEP / COS) {
    if (!inPoly(lo, la)) continue;
    let best = null, bd = 1e9; for (const u of U) { const c = D.geo[u].c, d = ((lo - c[0]) * COS) ** 2 + (la - c[1]) ** 2 - (GEO.w[u] || 0) * 6; if (d < bd) { bd = d; best = u; } }
    DOTS.push({ lo, la, u: best, j: Math.random() });
  }
  // escalas de cor do mapa (sempre escuro)
  const RAMPS = { volume: ["#16242b", "#3d3a22", "#a8701a", "#f5a524", "#ffe1a1"], late: ["#16242b", "#4a2629", "#a33a36", "#e5534b", "#ffb3ad"], days: ["#16242b", "#1a3550", "#24609f", "#3987e5", "#b7d3f6"], freight: ["#16242b", "#163d34", "#13775a", "#199e70", "#a5ecd0"] };
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const lerpC = (st, t) => { t = Math.max(0, Math.min(1, t)); const n = st.length - 1, i = Math.min(n - 1, Math.floor(t * n)), f = t * n - i; const a = hex(st[i]), b = hex(st[i + 1]); return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(",")})`; };
  let VAL = {}, COL = {}, NORM = {}, PH = {}, inScope = new Set(), hoverU = null, stats = {};
  let ROUTES = [], LOCAL = [];
  function computeMetric() {
    stats = {}; U.forEach(u => stats[u] = aggUf(u));
    const m = S.metric, vals = U.map(u => { const a = stats[u]; return m === "volume" ? a.orders : m === "late" ? a.late : m === "days" ? a.days : a.freight / (a.orders || 1); });
    const tf = m === "volume" ? v => Math.log10(1 + v) : v => v;
    const scU = scopeUfs(), useSc = scU.length >= 3 && scU.length < U.length;
    const tv = vals.map(tf), ref = useSc ? tv.filter((_, i) => scU.includes(U[i])) : tv, lo = Math.min(...ref), hi = Math.max(...ref);
    const vmax = Math.max(...(useSc ? vals.filter((_, i) => scU.includes(U[i])) : vals));
    U.forEach((u, i) => { VAL[u] = vals[i]; NORM[u] = Math.max(0, Math.min(1, (tv[i] - lo) / ((hi - lo) || 1))); COL[u] = lerpC(RAMPS[m], .1 + .9 * Math.pow(NORM[u], 1.5)); PH[u] = m === "volume" ? Math.sqrt(vals[i] / vmax) : Math.pow(NORM[u], 1.3); });
    const sc = scopeUfs(); inScope = new Set(sc);
    // legenda
    const fmt = m === "volume" ? fN : m === "late" ? v => fP(v, 0) : m === "days" ? v => f1(v) + " d" : v => fRs(v);
    const nm = { volume: "Pedidos por UF de destino", late: "Taxa de atraso", days: "Prazo médio de entrega", freight: "Frete médio por pedido" }[m];
    $("#mapLegend").innerHTML = `<div style="color:#dfe6e3;font-weight:600">${nm}</div><div class="ramp" style="background:linear-gradient(90deg,${[0, .25, .5, .75, 1].map(t => lerpC(RAMPS[m], .1 + .9 * Math.pow(t, 1.5))).join(",")})"></div><div class="rl"><span>${fmt(Math.min(...(useSc ? vals.filter((_, i) => scU.includes(U[i])) : vals)))}</span><span>${m === "volume" ? "escala log" : ""}</span><span>${fmt(Math.max(...(useSc ? vals.filter((_, i) => scU.includes(U[i])) : vals)))}</span></div>
      <div class="keys"><span><i style="background:#f5a524"></i>caminhão no prazo</span><span><i style="background:#e5534b"></i>atrasado</span></div>`;
    $("#mapTitle").innerHTML = S.uf ? `Tudo o que chega em <em>${D.geo[S.uf].nome}</em>` : S.region ? `A malha do <em>${S.region}</em>` : `Cada caminhão é um pedido <em>a caminho</em>`;
    // rotas
    const cs = corridors(sc).filter(c => c.so !== "Outros");
    const inter = cs.filter(c => c.so !== c.de).sort((a, b) => b.o - a.o).slice(0, S.uf ? 14 : 44);
    const omax = Math.max(...inter.map(c => c.o), 1);
    ROUTES = inter.map(c => {
      const A = D.geo[c.so].cc, B = D.geo[c.de].cc;
      const du = (B[0] - A[0]) * COS, dv = B[1] - A[1], len = Math.hypot(du, dv);
      const bend = .16 * (A[0] < B[0] ? 1 : -1);
      const ctl = [(A[0] + B[0]) / 2 - dv * bend / COS, (A[1] + B[1]) / 2 + du * bend];
      const pts = []; for (let i = 0; i <= 48; i++) { const t = i / 48, q = 1 - t; pts.push([q * q * A[0] + 2 * q * t * ctl[0] + t * t * B[0], q * q * A[1] + 2 * q * t * ctl[1] + t * t * B[1]]); }
      return { c, pts, w: c.o / omax, len, dur: 1.2 + Math.min(4.5, c.days * .2) * (.6 + len / 45) };
    });
    const lmax = Math.max(...cs.filter(c => c.so === c.de).map(c => c.o), 1);
    LOCAL = cs.filter(c => c.so === c.de).map(c => ({ u: c.de, w: c.o / lmax, late: c.late }));
    static_dirty = true;
  }
  // ---- camada estática ----
  const SL = document.createElement("canvas"), sctx = SL.getContext("2d"), DL = document.createElement("canvas");
  let static_dirty = true, PROJ = [];
  function drawStatic() {
    SL.width = W * DPR; SL.height = H * DPR; sctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const g = sctx;
    const bg = g.createRadialGradient(W * .55, H * .45, 10, W * .55, H * .5, Math.max(W, H) * .75);
    bg.addColorStop(0, "#0d1a1f"); bg.addColorStop(1, "#05090b"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // graticule (chão)
    g.lineWidth = 1; g.strokeStyle = "rgba(120,170,180,.07)";
    for (let lo = -80; lo <= -28; lo += 4) { g.beginPath(); for (let la = 9; la >= -38; la -= 1) { const p = P(lo, la); la === 9 ? g.moveTo(p[0], p[1]) : g.lineTo(p[0], p[1]); } g.stroke(); }
    for (let la = 8; la >= -36; la -= 4) { g.beginPath(); for (let lo = -80; lo <= -28; lo += 1) { const p = P(lo, la); lo === -80 ? g.moveTo(p[0], p[1]) : g.lineTo(p[0], p[1]); } g.stroke(); }
    // silhueta + brilho de costa
    g.save(); g.beginPath(); OUT.forEach(([lo, la], i) => { const p = P(lo, la); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }); g.closePath();
    g.fillStyle = "rgba(20,40,46,.35)"; g.fill();
    g.shadowColor = "rgba(245,165,36,.45)"; g.shadowBlur = 18; g.strokeStyle = "rgba(245,165,36,.35)"; g.lineWidth = 1.2; g.stroke(); g.restore();
    // pontos
    PROJ = [];
    const baseR = Math.max(1, STEP * K * .27);
    DL.width = W * DPR; DL.height = H * DPR; const dg = DL.getContext("2d"); dg.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (const d of DOTS) {
      const p = P(d.lo, d.la); const r = baseR * p[2];
      const on = inScope.has(d.u), hv = d.u === hoverU, sel = d.u === S.uf;
      dg.fillStyle = on ? COL[d.u] : "#15232a";
      dg.globalAlpha = on ? (hoverU && !hv && !sel ? .6 : 1) : 1;
      const rr = (hv || sel ? 1.25 : 1) * r * (.85 + .3 * d.j * (on ? NORM[d.u] : 0));
      dg.beginPath(); dg.arc(p[0], p[1], rr, 0, 6.283); dg.fill();
      if (hv || sel) { dg.fillStyle = "rgba(255,255,255,.38)"; dg.fill(); }
      PROJ.push([p[0], p[1], d.u]);
    }
    dg.globalAlpha = 1;
    g.save(); g.filter = "blur(7px)"; g.globalAlpha = .55; g.globalCompositeOperation = "lighter"; g.drawImage(DL, 0, 0, W, H); g.restore();
    g.drawImage(DL, 0, 0, W, H);
    // pilares 3D
    if (tilt > .25) {
      const k = Math.min(1, (tilt - .25) / .6), list = U.filter(u => inScope.has(u)).map(u => ({ u, p: P(...D.geo[u].cc), n: PH[u] })).sort((a, b) => a.p[1] - b.p[1]);
      const hmax = H * .2;
      for (const it of list) {
        const [x, y, s] = it.p, hh = (4 + hmax * it.n) * k * s, wd = 3.4 * s;
        const gr = g.createLinearGradient(x, y - hh, x, y);
        gr.addColorStop(0, COL[it.u]); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr; g.globalAlpha = it.u === hoverU || it.u === S.uf ? 1 : .8;
        g.fillRect(x - wd / 2, y - hh, wd, hh);
        g.beginPath(); g.ellipse(x, y - hh, wd * 1.2, wd * .5, 0, 0, 6.283); g.fillStyle = COL[it.u]; g.globalAlpha = 1; g.fill(); g.beginPath(); g.ellipse(x, y - hh, wd * .5, wd * .22, 0, 0, 6.283); g.fillStyle = "#fff"; g.fill();
        g.globalAlpha = 1;
        if (it.n > .3 || it.u === hoverU || it.u === S.uf || inScope.size < 10) { g.font = `600 ${Math.round(10 + 2 * s)}px Archivo, system-ui`; g.fillStyle = "#e9efec"; g.textAlign = "center"; g.fillText(it.u, x, y - hh - 8); }
      }
    } else {
      g.font = "600 10px Archivo, system-ui"; g.textAlign = "center"; g.fillStyle = "rgba(233,239,236,.7)";
      U.filter(u => inScope.has(u) && (NORM[u] > .6 || u === hoverU || u === S.uf)).forEach(u => { const p = P(...D.geo[u].c); g.fillText(u, p[0], p[1] + 3); });
    }
    static_dirty = false;
  }
  // ---- caminhões ----
  let trucks = [], pulses = [], last = performance.now(), T = 0, done = 0, lateC = 0, feedQ = null, feedT = 0, featured = null;
  const pickRoute = () => { const tot = ROUTES.reduce((s, r) => s + Math.sqrt(r.c.o), 0); let x = Math.random() * tot; for (const r of ROUTES) { x -= Math.sqrt(r.c.o); if (x <= 0) return r; } return ROUTES[0]; };
  function spawn() {
    const r = pickRoute(); if (!r) return;
    const late = Math.random() < r.c.late;
    trucks.push({ r, t: 0, late, stop: late ? .45 + Math.random() * .3 : 2, stopT: 0, trail: [] });
  }
  function routePt(r, t) {
    const n = r.pts.length - 1, f = Math.min(n - 1e-6, t * n), i = Math.floor(f), k = f - i;
    const a = r.pts[i], b = r.pts[i + 1]; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  }
  function drawTruck(g, x, y, ang, s, late) {
    g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s);
    const cone = g.createLinearGradient(8, 0, 34, 0); cone.addColorStop(0, late ? "rgba(255,120,110,.3)" : "rgba(255,214,140,.28)"); cone.addColorStop(1, "rgba(255,214,140,0)");
    g.fillStyle = cone; g.beginPath(); g.moveTo(8, -2); g.lineTo(28, -7); g.lineTo(28, 7); g.lineTo(8, 2); g.fill();
    g.fillStyle = "#c9d5d1"; g.beginPath(); g.roundRect ? g.roundRect(-10, -3.4, 13, 6.8, 1.3) : g.rect(-10, -3.4, 13, 6.8); g.fill();
    g.fillStyle = late ? "#e5534b" : "#f5a524"; g.beginPath(); g.roundRect ? g.roundRect(4, -3.1, 5.6, 6.2, 1.6) : g.rect(4, -3.1, 5.6, 6.2); g.fill();
    g.fillStyle = "#0b1316"; g.fillRect(7.6, -2.3, 1.2, 4.6);
    g.restore();
  }
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!active || !visible || W < 10 || H < 10) { requestAnimationFrame(frame); return; }
    if (Math.abs(tilt - tiltT) > .002) { tilt += (tiltT - tilt) * Math.min(1, dt * 5); fit(); static_dirty = true; } else if (tilt !== tiltT) { tilt = tiltT; fit(); static_dirty = true; }
    if (static_dirty) drawStatic();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H); ctx.drawImage(SL, 0, 0, W, H);
    if (!S.paused) T += dt;
    // rotas
    ctx.lineCap = "round";
    for (const r of ROUTES) {
      const pts = r.pts.map(p => P(p[0], p[1]));
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
      const hot = r.c.late > .12;
      ctx.strokeStyle = hot ? `rgba(229,83,75,${.12 + .35 * r.w})` : `rgba(140,190,200,${.08 + .3 * r.w})`;
      ctx.lineWidth = .6 + 2.2 * r.w; ctx.setLineDash([]); ctx.stroke();
      if (!REDUCED) { ctx.setLineDash([1.5, 9]); ctx.lineDashOffset = -T * 22; ctx.strokeStyle = hot ? "rgba(255,150,140,.55)" : "rgba(255,215,150,.45)"; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]); }
    }
    // entregas locais (anéis pulsantes)
    for (const l of LOCAL) {
      const p = P(...D.geo[l.u].cc), ph = ((T * (0.35 + l.w * .5)) + l.w * 3) % 1;
      ctx.beginPath(); ctx.ellipse(p[0], p[1], (4 + 26 * l.w * ph) * p[2], (4 + 26 * l.w * ph) * p[2] * (1 - Math.sin(tilt) * .55), 0, 0, 6.283);
      ctx.strokeStyle = `rgba(245,165,36,${(1 - ph) * .5 * (.3 + l.w)})`; ctx.lineWidth = 1.2; ctx.stroke();
    }
    // caminhões
    if (!REDUCED && !S.paused) {
      const target = Math.min(64, 10 + ROUTES.length * 1.15);
      if (trucks.length < target && Math.random() < dt * 9) spawn();
    }
    const nt = [];
    for (const k of trucks) {
      if (!S.paused) {
        if (k.t >= k.stop && k.stopT < 1.1) k.stopT += dt; else k.t += dt / k.r.dur;
      }
      if (k.t >= 1) {
        const end = P(...k.r.pts[k.r.pts.length - 1]); pulses.push({ x: end[0], y: end[1], t: 0, late: k.late });
        done++; if (k.late) lateC++; feedQ = k; if (featured === k) featured = null; continue;
      }
      const g0 = routePt(k.r, k.t), g1 = routePt(k.r, Math.min(1, k.t + .01));
      const p0 = P(g0[0], g0[1]), p1 = P(g1[0], g1[1]);
      k.trail.push([p0[0], p0[1]]); if (k.trail.length > 16) k.trail.shift();
      if (k.trail.length > 2) { ctx.beginPath(); k.trail.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.strokeStyle = k.late ? "rgba(229,83,75,.45)" : "rgba(245,165,36,.4)"; ctx.lineWidth = 1.6 * p0[2]; ctx.stroke(); }
      const sc = Math.max(.55, Math.min(1.05, K / 26)) * p0[2];
      drawTruck(ctx, p0[0], p0[1], Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), sc, k.late);
      if (k.late && k.t >= k.stop && k.stopT < 1.1) { ctx.fillStyle = `rgba(229,83,75,${.5 + .5 * Math.sin(T * 14)})`; ctx.font = "700 12px Archivo"; ctx.textAlign = "center"; ctx.fillText("!", p0[0], p0[1] - 10 * sc); }
      k.p = p0; nt.push(k);
    }
    trucks = nt;
    // caminhão em destaque com etiqueta
    if (!featured || !trucks.includes(featured)) featured = trucks.filter(k => k.t < .35 && k.r.len > 12).sort((a, b) => b.r.c.o - a.r.c.o)[0] || null;
    if (featured && featured.p && !S.paused) {
      const [x, y] = featured.p, c = featured.r.c, txt = `${c.so} → ${c.de}  ·  ${f1(c.days)} d  ·  ${fP(c.late, 0)} atraso`;
      ctx.font = "600 11.5px JetBrains Mono, monospace"; const tw = ctx.measureText(txt).width + 18;
      const bx = Math.min(W - tw - 8, Math.max(8, x - tw / 2)), by = y - 40;
      ctx.fillStyle = "rgba(9,15,18,.88)"; ctx.strokeStyle = featured.late ? "#e5534b" : "#f5a524"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, tw, 24, 7) : ctx.rect(bx, by, tw, 24); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y - 16); ctx.lineTo(x, y - 8); ctx.stroke();
      ctx.fillStyle = "#eef2f0"; ctx.textAlign = "left"; ctx.fillText(txt, bx + 9, by + 16);
    }
    // pulsos de chegada
    pulses = pulses.filter(p => (p.t += dt) < 1.2);
    for (const p of pulses) { ctx.beginPath(); ctx.arc(p.x, p.y, 3 + p.t * 18, 0, 6.283); ctx.strokeStyle = p.late ? `rgba(229,83,75,${1 - p.t / 1.2})` : `rgba(43,178,76,${1 - p.t / 1.2})`; ctx.lineWidth = 1.5; ctx.stroke(); }
    // contadores e feed
    $("#msRoad").textContent = fN(trucks.length); $("#msDone").textContent = fN(done); $("#msLate").textContent = fN(lateC);
    feedT += dt; if (feedQ && feedT > 1.5) { pushFeed(feedQ); feedQ = null; feedT = 0; }
    requestAnimationFrame(frame);
  }
  const SAMPLES = D.samples; let lastId = null;
  function pushFeed(k) {
    const c = k.r.c, cand = SAMPLES.filter(s => s[1] === c.so && s[2] === c.de && !!s[5] === k.late);
    const pool = cand.filter(x => x[0] !== lastId), s = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null; if (s) lastId = s[0];
    const days = s ? s[3] : Math.round(c.days), est = s ? s[4] : Math.round(c.est);
    const li = document.createElement("li");
    li.innerHTML = `<span class="ic"><svg width="14" height="10" viewBox="0 0 44 16"><rect x="0" y="3" width="28" height="10" rx="1.5" fill="#dfe7e4"/><path d="M29 6h7l5 4v3H29z" fill="${k.late ? "#e5534b" : "#f5a524"}"/></svg></span>
      <div><div class="rt">${c.so} → ${c.de}</div><div style="font-size:11px;color:#7f8f8b">#${s ? s[0] : Math.random().toString(16).slice(2, 8)} · ${s ? esc(D.cats[s[7]]) : "pedido"}${s ? " · " + fRs(s[6]) : ""}</div></div>
      <span class="tg ${k.late ? "late" : "ok"}">${k.late ? `+${Math.max(1, days - est)} d atraso` : `${days} d · no prazo`}</span>`;
    const ul = $("#feed"); ul.prepend(li); while (ul.children.length > 6) ul.lastChild.remove();
  }
  function seedFeed() { const ul = $("#feed"); ul.innerHTML = ""; for (let i = 0; i < 5 && ROUTES.length; i++) { const r = pickRoute(); pushFeed({ r, late: Math.random() < r.c.late }); } }
  // ---- interação ----
  function nearest(mx, my) { let best = null, bd = 160; for (const p of PROJ) { const d = (p[0] - mx) ** 2 + (p[1] - my) ** 2; if (d < bd) { bd = d; best = p[2]; } } return best; }
  cv.addEventListener("mousemove", e => {
    const r = cv.getBoundingClientRect(), u = nearest(e.clientX - r.left, e.clientY - r.top);
    if (u !== hoverU) { hoverU = u; static_dirty = true; }
    if (u) { const a = stats[u], g = D.geo[u]; cv.style.cursor = "pointer"; showTip(`<div class="tt"><span class="sw" style="background:${COL[u]};margin:0"></span>${g.nome} <span style="color:#7f8f8b;font-weight:500">· ${g.regiao}</span></div>${tr("Pedidos", fN(a.orders))}${tr("Faturamento", fR(a.rev))}${tr("Prazo médio", f1(a.days) + " d (prom. " + f1(a.est) + ")")}${tr("Atraso", fP(a.late))}${tr("Frete médio", fRs(a.freight / (a.orders || 1)))}${tr("Nota", f2(a.nota) + " ★")}<div style="margin-top:6px;color:#f5a524;font-size:11px">clique para filtrar</div>`, e.clientX, e.clientY); }
    else { cv.style.cursor = "crosshair"; hideTip(); }
  });
  cv.addEventListener("mouseleave", () => { hoverU = null; static_dirty = true; hideTip(); });
  cv.addEventListener("click", e => { const r = cv.getBoundingClientRect(), u = nearest(e.clientX - r.left, e.clientY - r.top); S.uf = u && u !== S.uf ? u : ""; if (S.uf) S.region = ""; syncFilters(); });
  $$("#metricSeg button").forEach(b => b.addEventListener("click", () => { S.metric = b.dataset.m; $$("#metricSeg button").forEach(x => x.setAttribute("aria-pressed", x === b)); computeMetric(); }));
  $("#tiltBtn").addEventListener("click", e => { S.tilt = !S.tilt; e.currentTarget.setAttribute("aria-pressed", S.tilt); e.currentTarget.textContent = S.tilt ? "3D" : "2D"; tiltT = S.tilt ? .78 : 0; if (REDUCED) { tilt = tiltT; fit(); static_dirty = true; } });
  $("#pauseBtn").addEventListener("click", e => { S.paused = !S.paused; e.currentTarget.setAttribute("aria-pressed", S.paused); e.currentTarget.textContent = S.paused ? "Retomar" : "Pausar"; });
  function resize() {
    const r = wrap.getBoundingClientRect(); if (r.width < 10 || r.height < 10) return; W = r.width; H = r.height; DPR = Math.min(2, devicePixelRatio || 1);
    cv.width = W * DPR; cv.height = H * DPR; fit(); static_dirty = true;
  }
  new ResizeObserver(resize).observe(wrap);
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(wrap);
  document.addEventListener("visibilitychange", () => { if (document.hidden) visible = false; else visible = true; last = performance.now(); });
  $$("#metricSeg button").forEach(x => x.setAttribute("aria-pressed", x.dataset.m === S.metric));
  $("#tiltBtn").textContent = S.tilt ? "3D" : "2D"; $("#tiltBtn").setAttribute("aria-pressed", S.tilt);
  return {
    init() { resize(); computeMetric(); seedFeed(); requestAnimationFrame(frame); },
    refresh() { computeMetric(); trucks = trucks.filter(k => ROUTES.includes(k.r)); },
    setActive(v) { active = v; if (v) { last = performance.now(); setTimeout(resize, 0); } },
  };
})();

/*__MESA__*/

/* ---------------- init ---------------- */
if (!D.meta.real) $("#simBadge").hidden = false;
$("#edicao").textContent = "Ref. " + D.meta.ref + " · " + fK(agg(0, NM - 1, U).orders) + " pedidos";
$("#srcNote").textContent = "Dados: " + D.meta.fonte;
readURL();
syncFilters(false);
MAP.init();
setView(S.view, false);
})();
