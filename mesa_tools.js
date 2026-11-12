/* ======================================================================
   MESA · TOOLS — ferramentas tipadas (funções com argumentos nomeados; não é o protocolo MCP)
   Cada ferramenta recebe argumentos estruturados e devolve {h, csv, next, acts}.
   ====================================================================== */
MZ.tools = (() => {
"use strict";
const { MET, mv, raw, val, mseries, dlt, zprop, perLabel, withState, resolve, baselineFor, evOf } = MZ.core;

/* ---------------- utilitários ---------------- */
const CALL = (tool, args) => ({ tool, args });
const at = c => ` data-call="${esc(JSON.stringify(c))}"`;
const sg = x => x > 0 ? "+" : x < 0 ? "−" : "";
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const median = a => { const s = a.filter(isFinite).sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const sfmt = (m, x) => m.kind === "pct" ? sg(x) + f1(Math.abs(x) * 100) + " p.p." : m.kind === "days" ? sg(x) + f1(Math.abs(x)) + " d" : m.kind === "stars" ? sg(x) + f2(Math.abs(x)) + "★" : m.kind === "rs" ? sg(x) + fRs(Math.abs(x)) : m.kind === "x" ? sg(x) + f1(Math.abs(x)) + "x" : m.kind === "money" ? sg(x) + fR(Math.abs(x)) : sg(x) + fN(Math.abs(x));
const minN = (m0, m1, m) => m && (m.kind === "count" || m.kind === "money") ? 0 : MIN_N; // taxas e médias exigem MIN_N observações
const metsOf = (a, def) => (a.metrics && a.metrics.length ? a.metrics : def || ["atraso"]).filter(id => MET[id]).map(id => MET[id]);
const regU = r => U.filter(u => REG[u] === r);
const ordinal = n => n + "º";
const chip = (d, extra = "") => `<span class="mzc ${d.tone}">${esc(d.txt)}${extra ? " " + extra : ""}</span>`;
const ins = list => `<ul class="mz-ins">${list.filter(Boolean).map(x => `<li>${x}</li>`).join("")}</ul>`;
const note = s => `<div class="mz-note">${s}</div>`;
const nav = fn => { fn(); if (MZ.ui && MZ.ui.navigated) MZ.ui.navigated(); };
const goView = (v) => nav(() => setView(v));
const setFilters = (o) => nav(() => { Object.assign(S, o); syncFilters(); });
const toneVar = t => t === "good" ? "var(--mz-good)" : t === "bad" ? "var(--mz-bad)" : "var(--mz-blue)";

function bars(rows, o = {}) {
  const mx = o.max || Math.max(...rows.map(r => Math.abs(r.v)), 1e-9);
  return `<div class="mz-bars" style="--lw:${o.lw || "46px"}">` + rows.map(r => `<div class="mrow${r.call ? " clk" : ""}${r.hl ? " hl" : ""}"${r.call ? at(r.call) : ""}><span class="ml">${esc(r.l)}${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</span><span class="mb"><i style="width:${Math.max(1.5, Math.abs(r.v) / mx * 100)}%;background:${r.c || o.c || "var(--mz-blue)"}"></i>${o.ref != null && isFinite(o.ref) ? `<s style="left:${Math.min(100, o.ref / mx * 100)}%"></s>` : ""}</span><span class="mv">${r.t ?? o.fmt(r.v)}</span>${r.sub2 ? `<span class="s2">${esc(r.sub2)}</span>` : ""}</div>`).join("") + `</div>` + (o.ref != null && isFinite(o.ref) && o.refL ? note(`┆ ${esc(o.refL)}`) : "");
}
function dbars(rows, o = {}) { // barras divergentes a partir do centro
  const mx = Math.max(...rows.map(r => Math.abs(r.v)), 1e-9);
  return `<div class="mz-bars dv" style="--lw:${o.lw || "46px"}">` + rows.map(r => { const w = Math.abs(r.v) / mx * 50; return `<div class="mrow${r.call ? " clk" : ""}"${r.call ? at(r.call) : ""}><span class="ml">${esc(r.l)}${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</span><span class="mb"><u></u><i style="left:${r.v >= 0 ? 50 : 50 - w}%;width:${Math.max(1, w)}%;background:${r.c}"></i></span><span class="mv">${r.t}</span></div>`; }).join("") + `</div>`;
}
function spark(vals, o = {}) {
  const W = 360, H = o.h || 88, pl = 2, pb = 14, n = vals.length, bw = (W - pl * 2) / n, fin = vals.filter(isFinite), mx = Math.max(...fin, 1e-9);
  const y = v => H - pb - v / mx * (H - pb - 10);
  let s = `<svg class="mz-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || "série mensal")}">`;
  if (o.ref != null && isFinite(o.ref)) { const yy = y(o.ref); s += `<line x1="0" x2="${W}" y1="${yy}" y2="${yy}" stroke="var(--mz-mute)" stroke-dasharray="3 3"/>`; }
  vals.forEach((v, i) => {
    if (!isFinite(v)) return;
    const inw = !o.sel || (i >= o.sel[0] && i <= o.sel[1]), col = o.peak === i ? "var(--mz-acc)" : o.cols ? o.cols(i) : "var(--mz-blue)", h = Math.max(1.5, H - pb - y(v));
    s += `<rect x="${pl + i * bw + 1}" y="${H - pb - h}" width="${Math.max(1, bw - 2)}" height="${h}" rx="2" fill="${col}" opacity="${inw ? 1 : .3}"><title>${esc(o.lab ? o.lab(i) : i)}: ${esc(o.fmt ? o.fmt(v) : v)}</title></rect>`;
    if (o.ev && o.ev.has(i)) s += `<circle cx="${pl + i * bw + bw / 2}" cy="${H - pb - h - 6}" r="2.6" fill="var(--mz-acc)"/>`;
  });
  s += `<text x="${pl}" y="${H - 2}" class="mz-ax">${esc(o.lab ? o.lab(0) : "")}</text><text x="${W - pl}" y="${H - 2}" text-anchor="end" class="mz-ax">${esc(o.lab ? o.lab(n - 1) : "")}</text></svg>`;
  return s;
}
function table(cols, rows, o = {}) {
  return `<table class="mz-tbl"><thead><tr>${cols.map((c, i) => `<th${i ? ' class="r"' : ""}>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr${r.call ? at(r.call) + ' class="clk"' : ""}>${r.cells.map((c, i) => `<td${i ? ' class="r' + (r.best && r.best.has(i) ? " best" : "") + '"' : ""}>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
function toText(h) {
  return h.replace(/<\/(div|p|li|tr|h\d)>/g, "\n").replace(/<br\s*\/?>/g, "\n").replace(/<\/(td|th)>/g, " | ").replace(/<li>/g, "- ").replace(/<small>/g, " (").replace(/<\/small>/g, ")").replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
const nxt = (t, call) => ({ t, call });
function rankUf(m, m0, m1, ufs = U) {
  const rows = ufs.map(u => ({ u, r: raw(m0, m1, [u]) })).filter(x => m.n(x.r) >= minN(m0, m1, m)).map(x => ({ u: x.u, v: mv(m, x.r), n: m.n(x.r) })).filter(x => isFinite(x.v));
  return rows.sort((a, b) => b.v - a.v);
}
function posText(m, pos, total) {
  if (m.better === "none") return `${ordinal(pos)} maior de ${total} UFs`;
  const worst = m.better === "down" ? pos : total - pos + 1; // 1 = pior
  return worst <= total / 2 ? `${ordinal(worst)} pior de ${total} UFs` : `${ordinal(total - worst + 1)} melhor de ${total} UFs`;
}
function R_(tool, a, R, h, o = {}) { return { tool, args: a, scope: R ? R.name : "", per: R ? R.per : "", h, csv: o.csv, next: o.next || [], acts: o.acts || [], extra: o.extra || {} }; }
const filterAct = (R, label) => R.single || R.region ? { label: label || `Filtrar ${R.single || R.region} no painel`, fn: () => setFilters({ uf: R.single || "", region: R.single ? "" : R.region, m0: R.m0, m1: R.m1 }) } : { label: "Aplicar período no painel", fn: () => setFilters({ m0: R.m0, m1: R.m1 }) };
const evLine = (i0, i1) => D.events.filter(e => { const k = M.indexOf(e.m); return k >= i0 && k <= i1; });

/* ---------------- consultar ---------------- */
function consultar(a) {
  const R = resolve(a), mets = metsOf(a), cur = raw(R.m0, R.m1, R.ufs), bl = baselineFor(R.m0, R.m1, a.base);
  const curC = bl && bl.kind === "yoy" ? raw(bl.cur[0], bl.cur[1], R.ufs) : cur, base = bl ? raw(bl.m0, bl.m1, R.ufs) : null;
  const bench = R.all ? null : raw(R.m0, R.m1, U);
  if (mets.length > 1) {
    const rows = mets.map(m => { const v = mv(m, cur), d = base ? dlt(m, mv(m, curC), mv(m, base)) : null, b = bench ? mv(m, bench) : null; return { cells: [`<b>${esc(m.L)}</b>`, m.fmt(v), b != null ? m.fmt(b) : "–", d ? chip(d) : "–"], call: CALL("consultar", { ...a, metrics: [m.id] }) }; });
    const h = `<div class="mz-title">${esc(R.name)} · ${R.per}</div>` + table(["Métrica", "Valor", "Brasil", bl ? bl.label : "Δ"], rows) + note("Clique numa linha para detalhar a métrica.");
    return R_("consultar", a, R, h, { csv: [["Métrica", "Valor", "Brasil"], ...mets.map(m => [m.L, mv(m, cur), bench ? mv(m, bench) : mv(m, cur)])], next: [nxt(`Por que ${mets[0].l} está assim?`, CALL("explicar", { ...a, metrics: [mets[0].id] })), nxt("Comparar com o Brasil", CALL("comparar", { ...a, metrics: a.metrics }))] });
  }
  const m = mets[0], v = mv(m, cur), vb = bench ? mv(m, bench) : null;
  const d = base ? dlt(m, mv(m, curC), mv(m, base)) : null;
  const all = mseries(m, R.ufs), evs = new Set(D.events.map(e => M.indexOf(e.m)));
  const list = []; const bullets = [];
  let rk = null;
  if (R.single && m.den) { const rr = rankUf(m, R.m0, R.m1); const i = rr.findIndex(x => x.u === R.single); if (i >= 0) rk = { pos: i + 1, total: rr.length }; }
  if (bench && m.den) {
    const rel = vb ? v / vb : NaN, dd = dlt(m, v, vb), nn = m.n(cur);
    bullets.push(`Brasil no mesmo período: <b>${m.fmt(vb)}</b> — ${esc(R.name)} está ${isFinite(rel) && m.kind !== "stars" ? `<b>${f1(rel)}×</b> a média (${dd.txt})` : `<b>${dd.txt}</b>`}.` + (rk ? ` Posição: <b>${posText(m, rk.pos, rk.total)}</b>.` : ""));
    if (m.kind === "pct" && nn) { const z = zprop(v, nn, vb); if (Math.abs(z) < 2) bullets.push(`Diferença <b>dentro do ruído estatístico</b> (z=${f1(z)}, n=${fN(nn)}): não dá para afirmar que difere da média.`); }
  } else if (bench) {
    const tot = mv(m, bench); bullets.push(`Representa <b>${fP(v / tot, 1)}</b> do total nacional (${m.fmt(tot)}).`);
  }
  if (d && d.tone !== "flat") bullets.push(`${esc(bl.label)}: ${m.fmt(mv(m, base))} → <b>${m.fmt(mv(m, curC))}</b> (${d.txt}) — ${d.tone === "good" ? "favorável" : "desfavorável"}.`);
  else if (d) bullets.push(`Estável: ${esc(bl.label)}.`);
  // extras por métrica
  const k = kp(cur);
  if (m.id === "atraso") { const ok = 1 - k.late; bullets.push(`No prazo: <b>${fP(ok)}</b> — ${ok >= SLA_META ? "cumpre" : "<b>não cumpre</b>"} a meta de SLA de ${fP(SLA_META, 0)}. Quando atrasa, atrasa <b>${f1(k.lateDays)} d</b> e a nota cai para ${f2(k.notaLate)}★ (no prazo: ${f2(k.notaOn)}★).`); }
  if (m.id === "prazo" || m.id === "prometido" || m.id === "folga") bullets.push(`Real <b>${f1(k.days)} d</b> · prometido <b>${f1(k.est)} d</b> · folga <b>${f1(k.slack)} d</b>. Etapas: aprovação ${f1(k.appr)} d, postagem ${f1(k.hand)} d, transporte ${f1(k.trans)} d.`);
  if (m.id === "frete" || m.id === "frete_medio") bullets.push(`Frete médio <b>${fRs(k.freight / k.orders)}</b> por pedido em um ticket de ${fRs(k.ticket)} (<b>${fP(k.fshare)}</b> do valor pago).`);
  if (m.id === "nota") bullets.push(`${fP(k.rev5)} deram 5★ e ${fP(k.rev1)} deram 1★; destes, ${fP(k.rev1Late, 0)} vieram de pedidos atrasados.`);
  if (m.id === "pedidos" || m.id === "faturamento") bullets.push(`Ticket médio <b>${fRs(k.ticket)}</b> · ${fN(k.delivered)} entregues · ${fP(k.notDel)} não chegaram.`);
  const peak = all.indexOf(Math.max(...all.filter(isFinite))), e = evOf(peak);
  const h = `<div class="mz-title">${esc(R.name)} · ${R.per}</div><div class="mz-big">${m.fmt(v)}<span>${esc(m.l)}</span></div>` +
    `<div class="mz-chips">${d ? chip(d, esc(bl.label)) : ""}${rk ? `<span class="mzc flat">${posText(m, rk.pos, rk.total)}</span>` : ""}${bench && vb != null && m.den ? `<span class="mzc flat">Brasil ${m.fmt(vb)}</span>` : ""}</div>` +
    spark(all, { sel: [R.m0, R.m1], peak, ev: evs, lab: i => mlabel(i), fmt: m.fmt, ref: R.single || !R.all ? NaN : NaN, aria: m.L + " por mês" }) +
    note(`Barras: ${esc(m.L.toLowerCase())} por mês em ${esc(R.name)} · destaque = período consultado · ● evento mapeado · maior valor em ${mlabel(peak)}${e ? " (" + esc(e.label) + ")" : ""}`) + ins(bullets);
  return R_("consultar", a, R, h, {
    csv: [["Mês", m.L], ...all.map((x, i) => [M[i], x])],
    next: [nxt(`Por que ${m.l} está assim?`, CALL("explicar", { ...a, metrics: [m.id] })), nxt("Mês a mês", CALL("serie", { ...a, metrics: [m.id] })), ...(R.all ? [nxt(`Ranking por UF`, CALL("ranking", { metrics: [m.id], dim: "uf", dir: m.better === "up" ? "asc" : "desc", m0: R.m0, m1: R.m1 }))] : [nxt("Comparar com o Brasil", CALL("comparar", { ...a, metrics: undefined })), nxt(`Corredores para ${R.single || R.name}`, CALL("corredores", { ...a, by: "atrasos" }))])],
    acts: [filterAct(R)],
  });
}

/* ---------------- série ---------------- */
function serie(a) {
  const R = resolve(a), m = metsOf(a)[0], all = mseries(m, R.ufs);
  const len = R.m1 - R.m0 + 1, win = len >= 3 ? [R.m0, R.m1] : [0, NM - 1], vals = all.slice(win[0], win[1] + 1).filter(isFinite);
  const avg = mean(vals), mx = Math.max(...vals), mn = Math.min(...vals), iMax = all.indexOf(mx, win[0]), iMin = all.indexOf(mn, win[0]);
  // tendência linear
  const n = vals.length, xs = vals.map((_, i) => i), mx_ = mean(xs), slope = n > 2 ? xs.reduce((s, x, i) => s + (x - mx_) * (vals[i] - avg), 0) / xs.reduce((s, x) => s + (x - mx_) ** 2, 0) : 0;
  const trend = Math.abs(slope * n) < Math.abs(avg) * .05 ? "estável" : slope > 0 ? "subindo" : "caindo";
  const tdir = trend === "estável" || m.better === "none" ? "flat" : (slope > 0) === (m.better === "up") ? "good" : "bad";
  const evs = new Set(D.events.map(e => M.indexOf(e.m))), inWin = evLine(win[0], win[1]);
  const bl = baselineFor(R.m0, R.m1, a.base), bullets = [];
  bullets.push(`Pico em <b>${mlabel(iMax)}</b>: ${m.fmt(mx)} (${isFinite(avg) && avg ? f1(mx / avg) + "× a média de " + m.fmt(avg) : ""})${evOf(iMax) ? ` — coincide com <b>${esc(evOf(iMax).label)}</b>` : ""}. Menor valor: ${mlabel(iMin)} (${m.fmt(mn)}).`);
  bullets.push(`Tendência linear: <b>${trend}</b>${trend !== "estável" ? ` (${sfmt(m, slope)} por mês)` : ""}.`);
  if (bl && len < 12) { const c = mv(m, raw(bl.cur[0], bl.cur[1], R.ufs)), b = mv(m, raw(bl.m0, bl.m1, R.ufs)), d = dlt(m, c, b); bullets.push(`${esc(bl.label)}: ${m.fmt(b)} → <b>${m.fmt(c)}</b> (${d.txt}).`); }
  if (inWin.length) bullets.push(`Eventos na janela: ${inWin.map(e => `<b>${esc(e.label)}</b> (${mlabel(M.indexOf(e.m))})`).join(", ")}.`);
  const h = `<div class="mz-title">${esc(m.L)} · ${esc(R.name)} · ${perLabel(win[0], win[1])}</div>` +
    spark(all, { sel: win, peak: iMax, ev: evs, lab: i => mlabel(i), fmt: m.fmt, ref: avg, aria: m.L + " por mês", cols: i => m.better === "down" && all[i] > avg * 1.4 ? "var(--mz-bad)" : "var(--mz-blue)" }) +
    note(`Linha tracejada = média da janela (${m.fmt(avg)}) · ● evento · vermelho = mais de 40% acima da média`) + ins(bullets);
  return R_("serie", a, R, h, { csv: [["Mês", m.L], ...all.map((x, i) => [M[i], x])], next: [nxt(`Por que o pico de ${mlabel(iMax)}?`, CALL("explicar", { ...a, metrics: [m.id], m0: iMax, m1: iMax })), nxt("Ranking por UF", CALL("ranking", { metrics: [m.id], dim: "uf", dir: m.better === "up" ? "asc" : "desc", m0: R.m0, m1: R.m1 })), nxt("Detectar anomalias", CALL("anomalias", a))], acts: [{ label: `Ver ${mlabel(iMax)} no painel`, fn: () => setFilters({ m0: iMax, m1: iMax }) }] });
}

/* ---------------- ranking ---------------- */
function ranking(a) {
  const m = metsOf(a, ["pedidos"])[0], dim = a.dim || "uf", dir = a.dir || "desc", nTop = Math.min(27, a.n || 8);
  const R = resolve({ ...a, ufs: dim === "uf" ? a.ufs : undefined });
  let rows = [], universe = "UFs", excl = 0;
  const m0 = R.m0, m1 = R.m1;
  if (dim === "mes") {
    const lo = m1 - m0 >= 2 ? m0 : 0, hi = m1 - m0 >= 2 ? m1 : NM - 1; universe = "meses";
    rows = []; for (let i = lo; i <= hi; i++) { const r = raw(i, i, R.ufs); rows.push({ k: i, l: mlabel(i), v: mv(m, r), n: m.n(r), call: CALL("explicar", { ...a, ufs: a.ufs, metrics: [m.id], m0: i, m1: i, dim: undefined }) }); }
    rows = rows.filter(x => isFinite(x.v));
  } else if (dim === "regiao") {
    universe = "regiões"; rows = REGIOES.map(rg => { const r = raw(m0, m1, regU(rg)); return { k: rg, l: REG_SIG[rg], sub: "", v: mv(m, r), n: m.n(r), call: CALL("consultar", { metrics: [m.id], region: rg, m0, m1 }) }; }).filter(x => isFinite(x.v));
  } else {
    const pool = a.ufs && a.ufs.length > 1 ? a.ufs : a.region ? regU(a.region) : S.region && !a.ufs ? regU(S.region) : U;
    const all = pool.map(u => ({ k: u, l: u, r: raw(m0, m1, [u]) }));
    const ok = all.filter(x => m.n(x.r) >= minN(m0, m1, m)); excl = all.length - ok.length;
    rows = ok.map(x => ({ k: x.k, l: x.l, sub: D.geo[x.k].nome, v: mv(m, x.r), n: m.n(x.r), call: CALL("consultar", { metrics: [m.id], ufs: [x.k], m0, m1 }) })).filter(x => isFinite(x.v));
  }
  rows.sort((x, y) => dir === "asc" ? x.v - y.v : y.v - x.v);
  const bench = mv(m, raw(m0, m1, dim === "uf" && (a.region || (S.region && !a.ufs)) ? regU(a.region || S.region) : U)), top = rows.slice(0, nTop);
  const sla = m.id === "atraso";
  top.forEach(r => { r.c = sla ? (r.v > 1 - SLA_META ? "var(--mz-bad)" : "var(--mz-good)") : m.better === "none" ? "var(--mz-blue)" : (dir === "desc") === (m.better === "down") ? "var(--mz-bad)" : "var(--mz-good)"; if (m.better === "none") r.c = "var(--mz-blue)"; });
  const best = rows[0], last = rows[rows.length - 1], bullets = [];
  const ev = dim === "mes" ? evOf(best.k) : null;
  const rel = bench ? best.v / bench : NaN;
  bullets.push(`<b>${esc(dim === "uf" ? D.geo[best.k].nome : dim === "mes" ? best.l : best.k)}</b> ${dir === "desc" ? "lidera" : "tem o menor valor"} com <b>${m.fmt(best.v)}</b>${isFinite(rel) && m.kind !== "stars" && m.kind !== "days" ? ` (${f1(rel)}× a referência de ${m.fmt(bench)})` : ` (referência ${m.fmt(bench)})`}${ev ? ` — mês do evento <b>${esc(ev.label)}</b>` : ""}.`);
  if (rows.length > 2) bullets.push(`Amplitude: de <b>${m.fmt(Math.min(...rows.map(r => r.v)))}</b> a <b>${m.fmt(Math.max(...rows.map(r => r.v)))}</b>${m.kind === "pct" || m.kind === "days" ? ` (${f1(Math.max(...rows.map(r => r.v)) / Math.max(1e-9, Math.min(...rows.map(r => r.v))))}× entre extremos)` : ""} em ${rows.length} ${universe}.`);
  if (sla && rows.length > 2) { const okN = rows.filter(r => r.v <= 1 - SLA_META).length; bullets.push(`<b>${okN} de ${rows.length}</b> ${universe} cumprem a meta de SLA (atraso ≤ ${fP(1 - SLA_META, 0)}).`); }
  if (m.kind === "count" || m.kind === "money") { const tot = rows.reduce((s, r) => s + r.v, 0), t3 = rows.slice(0, 3).reduce((s, r) => s + r.v, 0); bullets.push(`As 3 primeiras concentram <b>${fP(t3 / tot, 0)}</b> do total.`); }
  if (m.kind === "pct" && best.n && dim === "uf") { const z = zprop(best.v, best.n, bench); if (Math.abs(z) < 2) bullets.push(`Atenção: o topo tem só ${fN(best.n)} observações e fica <b>dentro do ruído</b> (z=${f1(z)}) — não trate como diferença real.`); }
  if (excl) bullets.push(`${excl} UF(s) com menos de ${minN(m0, m1, m)} observações ficaram de fora (taxa instável com amostra pequena).`);
  const dirTxt = dir === "desc" ? "maiores" : "menores";
  const h = `<div class="mz-title">${esc(m.L)} · ${dim === "mes" ? "por mês" : dim === "regiao" ? "por região" : "por UF"} · ${R.per}</div>` +
    bars(top.map(r => ({ l: r.l, sub: top.length <= 10 && dim === "uf" ? r.sub : "", v: r.v, t: m.fmt(r.v), c: r.c, call: r.call })), { lw: dim === "uf" ? (top.length <= 10 ? "112px" : "40px") : "54px", ref: sla || m.kind === "pct" ? bench : NaN, refL: `referência ${m.fmt(bench)}${sla ? ` · meta de SLA = atraso ≤ ${fP(1 - SLA_META, 0)}` : ""}`, fmt: m.fmt }) + ins(bullets);
  return R_("ranking", a, R, h, {
    csv: [["Item", m.L, "Observações"], ...rows.map(r => [r.l, r.v, r.n])],
    next: [nxt(`Por que ${esc(best.l)}?`, CALL("explicar", { metrics: [m.id], ...(dim === "uf" ? { ufs: [best.k] } : dim === "mes" ? { m0: best.k, m1: best.k } : { region: best.k }), m0: dim === "mes" ? best.k : m0, m1: dim === "mes" ? best.k : m1 })), ...(dim === "uf" ? [nxt(`Corredores para ${best.k}`, CALL("corredores", { ufs: [best.k], m0, m1, by: "atrasos" })), rows[1] ? nxt(`${best.k} vs ${rows[1].k}`, CALL("comparar", { ufs: [best.k, rows[1].k], m0, m1 })) : null] : [nxt("Mês a mês", CALL("serie", { metrics: [m.id], m0, m1 }))]), nxt(dir === "desc" ? "Ver os menores" : "Ver os maiores", CALL("ranking", { ...a, dir: dir === "desc" ? "asc" : "desc" }))].filter(Boolean),
    acts: dim === "uf" ? [{ label: `Filtrar ${best.k} no painel`, fn: () => setFilters({ uf: best.k, region: "", m0, m1 }) }] : [],
  });
}

/* ---------------- comparar ---------------- */
const CMP_DEF = ["pedidos", "faturamento", "ticket", "prazo", "prometido", "atraso", "frete", "nota"];
function comparar(a) {
  const R = resolve(a); let groups = [];
  if (a.periods && a.periods.length >= 2) groups = a.periods.slice(0, 4).map(p => ({ name: perLabel(p[0], p[1]), ufs: R.ufs, m0: p[0], m1: p[1] }));
  else if (a.regions && a.regions.length >= 2) groups = a.regions.slice(0, 4).map(rg => ({ name: rg, ufs: regU(rg), m0: R.m0, m1: R.m1 }));
  else if (a.ufs && a.ufs.length >= 2) groups = a.ufs.slice(0, 4).map(u => ({ name: u, ufs: [u], m0: R.m0, m1: R.m1 }));
  else groups = [{ name: R.single || R.region || R.name, ufs: R.ufs, m0: R.m0, m1: R.m1 }, { name: "Brasil", ufs: U, m0: R.m0, m1: R.m1 }];
  if (groups.length === 2 && groups[0].name === groups[1].name) groups[1].name = "Brasil";
  const mets = (a.metrics && a.metrics.length ? a.metrics : CMP_DEF).filter(id => MET[id]).map(id => MET[id]).slice(0, 10);
  const raws = groups.map(g => raw(g.m0, g.m1, g.ufs)), wins = new Array(groups.length).fill(0);
  const body = mets.map(m => {
    const vs = raws.map(r => mv(m, r)), fin = vs.filter(isFinite);
    const vol = m.kind === "count" || m.kind === "money", bi = m.better === "none" || vol || fin.length < 2 ? -1 : vs.indexOf(m.better === "up" ? Math.max(...fin) : Math.min(...fin));
    if (bi >= 0 && fin.length >= 2 && Math.max(...fin) !== Math.min(...fin)) wins[bi]++;
    const d = groups.length === 2 ? dlt(m, vs[0], vs[1]) : null;
    return { m, vs, bi, d, cells: [`<b>${esc(m.L)}</b>`, ...vs.map(v => m.fmt(v)), ...(d ? [chip(d)] : [])], best: bi >= 0 ? new Set([bi + 1]) : null };
  });
  const bullets = [];
  if (groups.length >= 2) {
    const tot = wins.reduce((s, x) => s + x, 0), wi = wins.indexOf(Math.max(...wins));
    if (tot) bullets.push(`<b>${esc(groups[wi].name)}</b> leva vantagem em <b>${wins[wi]} de ${tot}</b> métricas comparáveis (volume e receita não entram: dependem do tamanho). Destaque em âmbar = melhor valor.`);
  }
  if (groups.length === 2) {
    const gaps = body.filter(b => b.d && isFinite(b.d.rel) && b.m.better !== "none" && b.m.kind !== "count" && b.m.kind !== "money").map(b => ({ b, g: Math.abs(b.m.kind === "pct" || b.m.kind === "stars" || b.m.kind === "days" ? (b.vs[0] - b.vs[1]) / Math.max(1e-9, Math.abs(b.vs[1])) : b.d.rel) })).sort((x, y) => y.g - x.g).slice(0, 2);
    gaps.forEach(({ b }) => bullets.push(`Maior diferença em <b>${esc(b.m.l)}</b>: ${esc(groups[0].name)} ${b.m.fmt(b.vs[0])} vs ${esc(groups[1].name)} ${b.m.fmt(b.vs[1])} (${b.d.txt}).`));
    const k0 = kp(raws[0]), k1 = kp(raws[1]);
    const st = [["aprovação", k0.appr - k1.appr], ["postagem", k0.hand - k1.hand], ["transporte", k0.trans - k1.trans]].sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))[0];
    if (Math.abs(k0.days - k1.days) > .5) bullets.push(`Diferença de prazo real (${sg(k0.days - k1.days)}${f1(Math.abs(k0.days - k1.days))} d) vem sobretudo da etapa de <b>${st[0]}</b> (${sg(st[1])}${f1(Math.abs(st[1]))} d).`);
  }
  const lens = [...new Set(groups.map(g => g.m1 - g.m0 + 1))];
  if (a.periods && lens.length > 1) bullets.push(`Janelas de tamanhos diferentes (${groups.map(g => g.m1 - g.m0 + 1).join(" × ")} meses): compare <b>taxas e médias</b>, não totais.`);
  const h = `<div class="mz-title">${groups.map(g => esc(g.name)).join(" × ")}${a.periods ? "" : " · " + R.per}</div>` + table(["Métrica", ...groups.map(g => g.name), ...(groups.length === 2 ? ["Δ"] : [])], body.map(b => ({ cells: b.cells, best: b.best }))) + ins(bullets);
  const g0 = groups[0];
  return R_("comparar", a, R, h, {
    csv: [["Métrica", ...groups.map(g => g.name)], ...body.map(b => [b.m.L, ...b.vs])],
    next: [nxt(`Por que ${esc(g0.name)} difere?`, CALL("explicar", { metrics: ["atraso"], ...(a.ufs && a.ufs.length ? { ufs: [a.ufs[0]] } : {}), m0: g0.m0, m1: g0.m1 })), nxt("Ver corredores", CALL("corredores", { ...(a.ufs && a.ufs.length ? { ufs: [a.ufs[0]] } : {}), m0: R.m0, m1: R.m1, by: "atrasos" })), nxt("Mês a mês", CALL("serie", { metrics: ["atraso"], ...(a.ufs && a.ufs.length ? { ufs: [a.ufs[0]] } : {}) }))],
    acts: a.ufs && a.ufs.length >= 1 ? [{ label: `Filtrar ${a.ufs[0]} no painel`, fn: () => setFilters({ uf: a.ufs[0], region: "", m0: R.m0, m1: R.m1 }) }] : [],
  });
}

/* ---------------- explicar (decomposição exata) ---------------- */
function contribByUf(m, ufs, c0, c1, b0, b1) {
  // ratio: contrib_u = (n1 − R0·d1)/D1 − (n0 − R0·d0)/D0  (soma exatamente R1 − R0) · aditiva: n1 − n0
  const cur = raw(c0, c1, ufs), base = raw(b0, b1, ufs);
  const rows = ufs.map(u => ({ u, r1: raw(c0, c1, [u]), r0: raw(b0, b1, [u]) }));
  if (!m.den) return rows.map(x => ({ u: x.u, c: m.num(x.r1) - m.num(x.r0), v1: m.num(x.r1), v0: m.num(x.r0) }));
  const D1 = m.den(cur), D0 = m.den(base), R0 = m.num(base) / D0;
  return rows.map(x => ({ u: x.u, c: (m.num(x.r1) - R0 * m.den(x.r1)) / D1 - (m.num(x.r0) - R0 * m.den(x.r0)) / D0, v1: mv(m, x.r1), v0: mv(m, x.r0), n: m.n(x.r1) }));
}
function contribByCorr(m, ufs, c0, c1, b0, b1) {
  if (!m.cn) return null;
  const k = c => c.key, A = corridors(ufs, c0, c1), B = corridors(ufs, b0, b1), mapA = new Map(A.map(c => [k(c), c])), mapB = new Map(B.map(c => [k(c), c]));
  const D1 = A.reduce((s, c) => s + m.cd(c), 0), D0 = B.reduce((s, c) => s + m.cd(c), 0), N0 = B.reduce((s, c) => s + m.cn(c), 0), R0 = N0 / (D0 || 1);
  const keys = new Set([...mapA.keys(), ...mapB.keys()]);
  return [...keys].map(key => { const a_ = mapA.get(key), b_ = mapB.get(key); const n1 = a_ ? m.cn(a_) : 0, d1 = a_ ? m.cd(a_) : 0, n0 = b_ ? m.cn(b_) : 0, d0 = b_ ? m.cd(b_) : 0; return { key, c: (n1 - R0 * d1) / (D1 || 1) - (n0 - R0 * d0) / (D0 || 1), o1: a_ ? a_.o : 0, o0: b_ ? b_.o : 0, r1: d1 ? n1 / d1 : NaN, r0: d0 ? n0 / d0 : NaN, so: (a_ || b_).so, de: (a_ || b_).de }; });
}
function stageTable(k1, k0, l1, l0) {
  const rows = [["Prometido", "est"], ["Aprovação", "appr"], ["Postagem", "hand"], ["Transporte", "trans"], ["Real (compra → porta)", "days"]];
  return table(["Etapa (dias)", l0, l1, "Δ"], rows.map(([n, f]) => { const d = k1[f] - k0[f]; const bad = f === "est" ? 0 : d > .05; const tone = f === "est" || Math.abs(d) < .05 ? "flat" : d > 0 ? "bad" : "good"; return { cells: [esc(n), f1(k0[f]), f1(k1[f]), `<span class="mzc ${tone}">${Math.abs(d) < .05 ? "estável" : sg(d) + f1(Math.abs(d)) + " d"}</span>`] }; }));
}
function explicar(a) {
  const R = resolve(a), m = metsOf(a)[0], bl = baselineFor(R.m0, R.m1, a.base), bullets = []; let h = "", nextExtra = [];
  const tipical = ["atraso", "prazo", "prometido", "folga", "dias_atraso", "nota", "aprovacao", "postagem", "transporte"].includes(m.id);
  if (bl) {
    const c0 = bl.cur[0], c1 = bl.cur[1], cur = raw(c0, c1, R.ufs), base = raw(bl.m0, bl.m1, R.ufs), v1 = mv(m, cur), v0 = mv(m, base), d = dlt(m, v1, v0);
    const verb = d.tone === "flat" && Math.abs(d.d) < 1e-9 ? "ficou estável" : d.d > 0 ? "subiu" : "caiu";
    h += `<div class="mz-title">Por que ${esc(m.l)} ${verb} · ${esc(R.name)}</div><div class="mz-big">${m.fmt(v0)} → ${m.fmt(v1)}<span>${perLabel(bl.m0, bl.m1)} → ${perLabel(c0, c1)}</span></div><div class="mz-chips">${chip(d, esc(bl.label))}</div>`;
    const total = v1 - v0;
    if (R.ufs.length > 1 && (!m.den || m.den(cur) > 0)) {
      const cs = contribByUf(m, R.ufs, c0, c1, bl.m0, bl.m1).filter(x => isFinite(x.c)), sum = cs.reduce((s, x) => s + x.c, 0), sign = Math.sign(total) || 1;
      cs.sort((x, y) => sign * (y.c - x.c));
      const top = cs.slice(0, 5), t3 = cs.slice(0, 3).reduce((s, x) => s + x.c, 0);
      const tone = x => m.better === "none" ? "var(--mz-blue)" : (x > 0) === (m.better === "up") ? "var(--mz-good)" : "var(--mz-bad)";
      h += `<div class="mz-sub">Quem mais pesou na variação (contribuição por UF)</div>` + dbars(top.map(x => ({ l: x.u, v: x.c, t: sfmt(m, x.c), c: tone(x.c), call: CALL("consultar", { metrics: [m.id], ufs: [x.u], m0: c0, m1: c1 }) })), { lw: "40px" });
      if (Math.abs(total) > 1e-9) bullets.push(`<b>${top.slice(0, 3).map(x => x.u).join(", ")}</b> explicam <b>${fP(t3 / sum, 0)}</b> da variação (${sfmt(m, t3)} de ${sfmt(m, sum)}).`);
      const rev = cs.filter(x => Math.sign(x.c) === -sign && Math.abs(x.c) > Math.abs(sum) * .05).slice(-1)[0];
      if (rev) bullets.push(`Em sentido contrário: <b>${rev.u}</b> (${sfmt(m, rev.c)}) amorteceu parte do movimento.`);
      nextExtra.push(nxt(`Por que ${top[0].u}?`, CALL("explicar", { metrics: [m.id], ufs: [top[0].u], m0: R.m0, m1: R.m1 })));
    }
    if (tipical) { h += `<div class="mz-sub">Etapas do prazo</div>` + stageTable(kp(cur), kp(base), perLabel(c0, c1), perLabel(bl.m0, bl.m1)); const k1 = kp(cur), k0 = kp(base), st = [["aprovação", k1.appr - k0.appr], ["postagem", k1.hand - k0.hand], ["transporte", k1.trans - k0.trans]].sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))[0]; if (Math.abs(st[1]) >= .2) bullets.push(`Maior mudança de etapa: <b>${st[0]}</b> (${sg(st[1])}${f1(Math.abs(st[1]))} d). Prazo prometido ${k1.est > k0.est + .1 ? "<b>subiu</b> " + f1(k1.est - k0.est) + " d (compensa parte do atraso)" : k1.est < k0.est - .1 ? "<b>caiu</b> " + f1(k0.est - k1.est) + " d (a promessa ficou mais apertada)" : "ficou estável"}.`); }
    const cc = contribByCorr(m, R.ufs, c0, c1, bl.m0, bl.m1);
    if (cc) { const sign = Math.sign(total) || 1, top = cc.filter(x => x.o1 + x.o0 >= 30 && isFinite(x.c)).sort((x, y) => sign * (y.c - x.c)).slice(0, 3); if (top.length) bullets.push(`Corredores que mais puxaram: ${top.map(x => `<b>${x.so}→${x.de}</b> (${sfmt(m, x.c)})`).join(", ")}.`); }
    if (m.id === "nota") { const k = kp(cur), cf = k.notaOn * SLA_META + k.notaLate * (1 - SLA_META); bullets.push(`Link com atraso: nota no prazo <b>${f2(k.notaOn)}★</b> vs <b>${f2(k.notaLate)}★</b> quando atrasa. Com atraso na meta (${fP(1 - SLA_META, 0)}), a nota estimada seria ${f2(cf)}★ (hoje ${f2(k.nota)}★).`); }
    const evsIn = evLine(c0, c1), evsBase = evLine(bl.m0, bl.m1);
    if (evsIn.length) bullets.push(`Evento no período: ${evsIn.map(e => `<b>${esc(e.label)}</b> (${mlabel(M.indexOf(e.m))})`).join(", ")}${c1 > c0 ? "" : ` — ${esc(evsIn[0].desc.toLowerCase())}`}.`);
    if (evsBase.length && !evsIn.length) bullets.push(`O período-base inclui <b>${esc(evsBase[0].label)}</b> (${mlabel(M.indexOf(evsBase[0].m))}), o que distorce a comparação.`);
    if (c1 > c0) { const ser = mseries(m, R.ufs, c0, c1), pk = ser.indexOf(Math.max(...ser)) + c0; bullets.push(`Dentro da janela, o pior ponto foi <b>${mlabel(pk)}</b> (${m.fmt(mv(m, raw(pk, pk, R.ufs)))}).`); }
    if (m.kind === "pct" && m.n(cur) && Math.abs(d.d) < 3 * Math.sqrt(Math.max(1e-9, v0 * (1 - v0)) / Math.max(1, m.n(cur)))) bullets.push(`Cuidado: a variação é pequena frente ao ruído amostral (n=${fN(m.n(cur))}).`);
  } else if (!R.all) {
    const cur = raw(R.m0, R.m1, R.ufs), bench = raw(R.m0, R.m1, U), v1 = mv(m, cur), vb = mv(m, bench), d = dlt(m, v1, vb);
    h += `<div class="mz-title">Por que ${esc(m.l)} em ${esc(R.name)} difere do Brasil</div><div class="mz-big">${m.fmt(v1)}<span>${esc(R.name)} · Brasil ${m.fmt(vb)}</span></div><div class="mz-chips">${chip(d, "vs Brasil")}</div>`;
    if (tipical) { h += `<div class="mz-sub">Etapas do prazo vs Brasil</div>` + stageTable(kp(cur), kp(bench), R.name, "Brasil"); const k1 = kp(cur), k0 = kp(bench), st = [["aprovação", k1.appr - k0.appr], ["postagem", k1.hand - k0.hand], ["transporte", k1.trans - k0.trans]].sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))[0]; bullets.push(`Maior diferença de etapa: <b>${st[0]}</b> (${sg(st[1])}${f1(Math.abs(st[1]))} d vs Brasil). Prometido: ${f1(k1.est)} d vs ${f1(k0.est)} d.`); }
    if (m.cn) { const cs = corridors(R.ufs, R.m0, R.m1).filter(c => m.cd(c) >= MIN_N && c.so !== "Outros"), tot = cs.reduce((s, c) => s + m.cd(c), 0), num = cs.reduce((s, c) => s + m.cn(c), 0), r0 = mv(m, bench); const top = cs.map(c => ({ c, x: (m.cn(c) - r0 * m.cd(c)) / (tot || 1) })).sort((p, q) => Math.sign(v1 - vb) * (q.x - p.x)).slice(0, 3); if (top.length) bullets.push(`Corredores que mais afastam ${esc(R.name)} da média: ${top.map(t => `<b>${t.c.key}</b> (${fP(m.cn(t.c) / m.cd(t.c))}, ${fN(t.c.o)} pedidos)`).join(", ")}.`); }
    const nn = m.n(cur); if (m.kind === "pct") { const z = zprop(v1, nn, vb); bullets.push(Math.abs(z) < 2 ? `Diferença <b>não é estatisticamente clara</b> (z=${f1(z)}, n=${fN(nn)}).` : `Diferença estatisticamente relevante (z=${f1(z)}, n=${fN(nn)}).`); }
    const evsIn = evLine(R.m0, R.m1); if (evsIn.length) bullets.push(`O período inclui <b>${esc(evsIn.map(e => e.label).join(", "))}</b>.`);
  } else {
    const cur = raw(R.m0, R.m1, U), v1 = mv(m, cur);
    h += `<div class="mz-title">O que explica ${esc(m.l)} · Brasil · ${R.per}</div><div class="mz-big">${m.fmt(v1)}<span>sem período anterior para comparar</span></div>`;
    if (m.den) {
      const D1 = m.den(cur), cs = U.map(u => { const r = raw(R.m0, R.m1, [u]); return { u, c: (m.num(r) - v1 * m.den(r)) / D1, v: mv(m, r), sh: m.den(r) / D1 }; }).filter(x => isFinite(x.c)).sort((x, y) => (m.better === "up" ? x.c - y.c : y.c - x.c)).slice(0, 5);
      h += `<div class="mz-sub">UFs que mais empurram a média ${m.better === "up" ? "para baixo" : "para cima"}</div>` + dbars(cs.map(x => ({ l: x.u, v: x.c, t: `${m.fmt(x.v)} · ${fP(x.sh, 0)} do volume`, c: "var(--mz-bad)", call: CALL("consultar", { metrics: [m.id], ufs: [x.u], m0: R.m0, m1: R.m1 }) })), { lw: "40px" });
      bullets.push(`Peso = (valor da UF − média) × participação no volume: <b>${cs.slice(0, 3).map(x => x.u).join(", ")}</b> concentram o desvio.`);
    } else { const rr = U.map(u => ({ u, v: m.num(raw(R.m0, R.m1, [u])) })).sort((x, y) => y.v - x.v).slice(0, 5), tot = m.num(cur); h += bars(rr.map(x => ({ l: x.u, v: x.v, t: fP(x.v / tot, 0) })), { fmt: m.fmt }); bullets.push(`Top 3 UFs = <b>${fP(rr.slice(0, 3).reduce((s, x) => s + x.v, 0) / tot, 0)}</b> do total.`); }
    const evsIn = evLine(R.m0, R.m1); if (evsIn.length) bullets.push(`Eventos no período: ${evsIn.map(e => `<b>${esc(e.label)}</b> (${mlabel(M.indexOf(e.m))})`).join(", ")}.`);
  }
  h += ins(bullets) + note("Decomposição exata: as contribuições somam a variação total. Associação temporal não prova causalidade.");
  return R_("explicar", a, R, h, { next: [...nextExtra, nxt("Mês a mês", CALL("serie", { ...a, metrics: [m.id] })), nxt(`Corredores ${R.single ? "para " + R.single : ""}`, CALL("corredores", { ...a, by: "atrasos" })), nxt("Detectar anomalias", CALL("anomalias", a))].slice(0, 4), acts: [filterAct(R)] });
}

/* ---------------- corredores ---------------- */
function corredoresT(a) {
  const R = resolve(a), by = a.by || "atrasos", sellers = D.sellers;
  let cs = corridors(R.ufs, R.m0, R.m1); const orig = a.orig ? (sellers.includes(a.orig) ? a.orig : "Outros") : null;
  if (orig) cs = cs.filter(c => c.so === orig);
  const nAll = cs.reduce((s, c) => s + c.o, 0), lAll = cs.reduce((s, c) => s + c.l, 0), rAll = lAll / (nAll || 1);
  if (a.orig && a.dest && cs.length === 1) {
    const c = cs[0], bench = corridors(U, R.m0, R.m1), all = bench.reduce((s, x) => s + x.l, 0) / bench.reduce((s, x) => s + x.o, 0), pos = bench.filter(x => x.o >= MIN_N).sort((x, y) => y.l - x.l).findIndex(x => x.key === c.key) + 1;
    const z = zprop(c.late, c.o, all);
    const h = `<div class="mz-title">Corredor ${esc(c.key)} · ${R.per}</div><div class="mz-big">${fP(c.late)}<span>de atraso em ${fN(c.o)} pedidos</span></div>` + table(["", "Corredor", "Média Brasil"], [{ cells: ["Prazo real", f1(c.days) + " d", f1(kp(raw(R.m0, R.m1, U)).days) + " d"] }, { cells: ["Prometido", f1(c.est) + " d", f1(kp(raw(R.m0, R.m1, U)).est) + " d"] }, { cells: ["Atraso", fP(c.late), fP(all)] }, { cells: ["Frete médio", fRs(c.frete), fRs(kp(raw(R.m0, R.m1, U)).freight / kp(raw(R.m0, R.m1, U)).orders)] }, { cells: ["Nota", f2(c.nota) + "★", f2(kp(raw(R.m0, R.m1, U)).nota) + "★"] }]) + ins([c.dist ? `Distância rodoviária estimada ~${fN(c.dist)} km · transporte ${f1(c.trans)} d (piso físico ${f1(FLOOR.base + c.dist / FLOOR.kmDia)} d) · custo modelado ${fRs(c.cost)} vs frete ${fRs(c.frete)} (margem ${fP(c.margin, 0)}).` : "Origem agrupada (“Outros”): distância é média de várias origens.", c.lowN ? `<b>Amostra pequena</b> (${fN(c.o)} pedidos): IC 95% do atraso ${fP(c.ci[0])} a ${fP(c.ci[1])}; não tire conclusão.` : `IC 95% do atraso: ${fP(c.ci[0])} a ${fP(c.ci[1])}.`, pos ? `${ordinal(pos)} corredor em volume de atrasos entre ${bench.filter(x => x.o >= MIN_N).length} com ${MIN_N}+ pedidos.` : "", Math.abs(z) < 2 ? `Diferença vs média nacional <b>dentro do ruído</b> (z=${f1(z)}).` : `Diferença vs média nacional relevante (z=${f1(z)}).`]);
    return R_("corredores", a, R, h, { next: [nxt(`Por que ${c.de} atrasa?`, CALL("explicar", { ufs: [c.de], metrics: ["atraso"], m0: R.m0, m1: R.m1 })), nxt(`Todos os corredores para ${c.de}`, CALL("corredores", { ufs: [c.de], m0: R.m0, m1: R.m1, by: "atrasos" }))], acts: [{ label: "Abrir Rotas", fn: () => goView("rotas") }] });
  }
  let list, valFn, fmtFn, title, minO = 15;
  if (by === "taxa") { minO = MIN_N; list = cs.filter(c => c.o >= minO); valFn = c => c.late; fmtFn = v => fP(v); title = "maior taxa de atraso"; }
  else if (by === "volume") { list = cs; valFn = c => c.o; fmtFn = v => fN(v) + " ped."; title = "maior volume"; }
  else if (by === "caros") { minO = MIN_N; list = cs.filter(c => c.o >= minO); valFn = c => c.frete; fmtFn = fRs; title = "frete médio mais alto"; }
  else if (by === "lentos") {
    minO = 30; const pts = cs.filter(c => c.dist && c.so !== "Outros" && c.o >= minO), mx = mean(pts.map(c => c.dist)), my = mean(pts.map(c => c.trans)), b = pts.reduce((s, c) => s + (c.dist - mx) * (c.trans - my), 0) / (pts.reduce((s, c) => s + (c.dist - mx) ** 2, 0) || 1), a0 = my - b * mx;
    list = pts.map(c => ({ ...c, resid: c.trans - (a0 + b * c.dist) })); valFn = c => c.resid; fmtFn = v => sg(v) + f1(Math.abs(v)) + " d"; title = "mais lentos que a distância prevê";
  } else { list = cs.filter(c => c.o >= MIN_N); valFn = c => c.l; fmtFn = v => fN(v) + " atr."; title = "mais pedidos atrasados"; }
  const asc = a.dir === "asc"; list = list.slice().sort((x, y) => asc ? valFn(x) - valFn(y) : valFn(y) - valFn(x)); const top = list.slice(0, a.n || 6);
  if (!top.length) return R_("corredores", a, R, `<div class="mz-title">Corredores</div>Sem corredores com volume suficiente neste recorte. Amplie o período ou escolha outro destino.`, {});
  const bullets = [];
  const topL = cs.slice().sort((x, y) => y.l - x.l), t5 = topL.slice(0, 5).reduce((s, c) => s + c.l, 0);
  bullets.push(`<b>${esc(top[0].key)}</b> lidera (${fmtFn(valFn(top[0]))}) · ${fN(top[0].o)} pedidos · ${f1(top[0].days)} d reais para ${f1(top[0].est)} d prometidos · ${fP(top[0].late)} de atraso.`);
  if (lAll) bullets.push(`Os 5 corredores com mais atrasos concentram <b>${fP(t5 / lAll, 0)}</b> dos ${fN(lAll)} atrasos${R.single ? " para " + esc(R.single) : ""}.`);
  const byO = {}; cs.forEach(c => byO[c.so] = (byO[c.so] || 0) + c.l); const hub = Object.entries(byO).sort((x, y) => y[1] - x[1])[0]; if (hub && lAll && !orig) bullets.push(`Origem que mais gera atraso: <b>${esc(hub[0])}</b> (${fP(hub[1] / lAll, 0)} dos atrasos).`);
  const intra = cs.filter(c => c.so === c.de).reduce((s, c) => s + c.o, 0); if (intra && !orig) bullets.push(`Entregas dentro da própria UF = ${fP(intra / nAll, 0)} do volume.`);
  if (by === "lentos") bullets.push("Resíduo = dias de TRANSPORTE (sem aprovação e postagem) − dias esperados por regressão linear sobre a distância rodoviária estimada; positivo = mais lento que o esperado.");
  const cmax = Math.max(...top.map(c => Math.abs(valFn(c))));
  const h = `<div class="mz-title">Corredores ${orig ? "saindo de " + esc(orig) + " " : ""}${R.single ? "para " + esc(R.single) : R.all ? "" : "em " + esc(R.name)} · ${title} · ${R.per}</div>` +
    bars(top.map(c => ({ l: c.key, sub2: `${fN(c.o)} ped · ${f1(c.days)} d (prom. ${f1(c.est)}) · ${fP(c.late)} atraso${c.lowN ? "*" : ""}`, v: valFn(c), t: fmtFn(valFn(c)), c: c.late > .12 ? "var(--mz-bad)" : "var(--mz-blue)", call: CALL("corredores", { orig: c.so === "Outros" ? undefined : c.so, ufs: [c.de], dest: c.de, m0: R.m0, m1: R.m1 }) })), { lw: "68px", max: cmax, fmt: fmtFn }) + ins(bullets) + (R.all || R.ufs.length > 1 ? note(`“Outros” = vendedores de UFs fora das 11 maiores origens. Distâncias: ${esc(D.meta.km)} × ${f1(CIRC)} (estimativa rodoviária). Corredores com menos de ${MIN_N} pedidos ficam fora de rankings de taxa.`) : "");
  return R_("corredores", a, R, h, { csv: [["Corredor", "Pedidos", "Atrasos", "Taxa", "Dias reais", "Prometido", "Frete médio", "Nota"], ...list.map(c => [c.key, c.o, c.l, c.late, c.days, c.est, c.frete, c.nota])], next: [nxt(`Por que ${top[0].de} atrasa?`, CALL("explicar", { ufs: [top[0].de], metrics: ["atraso"], m0: R.m0, m1: R.m1 })), nxt("Mais lentos que a distância", CALL("corredores", { ...a, by: "lentos" })), nxt("Por taxa de atraso", CALL("corredores", { ...a, by: "taxa" }))], acts: [{ label: "Abrir Rotas", fn: () => { if (R.single) S.uf = R.single, S.region = ""; syncFilters(false); goView("rotas"); } }] });
}

/* ---------------- categorias ---------------- */
function catsR(ufs, m0, m1) {
  const set = new Set(ufs.map(u => UI[u])), arr = D.cats.map((n, i) => ({ n, i, o: 0, g: 0, l: 0, d: 0 }));
  for (const r of D.cat) { if (r[0] < m0 || r[0] > m1 || !set.has(r[1])) continue; const c = arr[r[2]]; c.o += r[3]; c.g += r[4]; c.l += r[5]; c.d += r[6]; }
  return arr;
}
function categorias(a) {
  const R = resolve(a), by = a.by || "receita", cs = catsR(R.ufs, R.m0, R.m1).filter(c => c.n !== "Outras" && c.o > 20);
  const f = { receita: [c => c.g, fR, "receita de produtos"], pedidos: [c => c.o, fN, "pedidos"], ticket: [c => c.g / c.o, fRs, "ticket (produto)"], atraso: [c => c.l / c.d, v => fP(v), "taxa de atraso"], frete: [c => c.g, fR, "receita"] }[by];
  const sorted = cs.slice().sort((x, y) => (a.dir === "asc" ? f[0](x) - f[0](y) : f[0](y) - f[0](x))), top = sorted.slice(0, 8), tot = cs.reduce((s, c) => s + c.g, 0), totL = cs.reduce((s, c) => s + c.l, 0) / (cs.reduce((s, c) => s + c.d, 0) || 1);
  const bullets = [`<b>${esc(top[0].n)}</b> lidera em ${f[2]}: <b>${f[1](f[0](top[0]))}</b>${by === "receita" ? ` (${fP(top[0].g / tot, 0)} da receita de produtos)` : ""}.`];
  if (by === "receita") bullets.push(`As 3 maiores categorias somam <b>${fP(top.slice(0, 3).reduce((s, c) => s + c.g, 0) / tot, 0)}</b> da receita.`);
  const worst = cs.slice().sort((x, y) => y.l / y.d - x.l / x.d)[0]; if (worst) bullets.push(`Maior atraso: <b>${esc(worst.n)}</b> (${fP(worst.l / worst.d)} vs ${fP(totL)} na média) — ${worst.l / worst.d > totL * 1.15 ? "categoria que pressiona o SLA" : "diferença pequena frente à média"}.`);
  const h = `<div class="mz-title">Categorias por ${f[2]} · ${esc(R.name)} · ${R.per}</div>` + bars(top.map(c => ({ l: c.n, v: f[0](c), t: f[1](f[0](c)), c: by === "atraso" ? (c.l / c.d > totL * 1.15 ? "var(--mz-bad)" : "var(--mz-blue)") : "var(--mz-blue)" })), { lw: "132px", fmt: f[1], ref: by === "atraso" ? totL : NaN, refL: "média " + fP(totL) }) + ins(bullets);
  return R_("categorias", a, R, h, { csv: [["Categoria", "Pedidos", "Receita produtos", "Atrasos", "Entregues"], ...cs.map(c => [c.n, c.o, c.g, c.l, c.d])], next: [nxt("Por taxa de atraso", CALL("categorias", { ...a, by: "atraso" })), nxt("Por ticket", CALL("categorias", { ...a, by: "ticket" })), nxt("Receita mês a mês", CALL("serie", { ...a, metrics: ["faturamento"] }))], acts: [{ label: "Abrir Faturamento", fn: () => goView("receita") }] });
}

/* ---------------- etapas ---------------- */
function etapas(a) {
  const R = resolve(a), cur = raw(R.m0, R.m1, R.ufs), k = kp(cur), bl = baselineFor(R.m0, R.m1, a.base), bench = R.all ? null : kp(raw(R.m0, R.m1, U));
  const parts = [["Aprovação", k.appr, "var(--mz-blue)"], ["Postagem", k.hand, "var(--mz-teal)"], ["Transporte", k.trans, "var(--mz-acc)"], ["Folga", Math.max(0, k.est - k.appr - k.hand - k.trans), "var(--mz-mute)"]], tot = parts.reduce((s, x) => s + x[1], 0);
  const seg = `<div class="mz-seg">${parts.map(([n, v, c]) => `<div style="flex:${v / tot};background:${c}" title="${esc(n)}: ${f1(v)} d">${v / tot > .1 ? `<b>${f1(v)} d</b>` : ""}</div>`).join("")}</div><div class="mz-seg-l">${parts.map(([n, v, c]) => `<span><i style="background:${c}"></i>${n} ${f1(v)} d (${fP(v / tot, 0)})</span>`).join("")}</div>`;
  const bullets = [`Entrega real <b>${f1(k.days)} d</b> para <b>${f1(k.est)} d</b> prometidos (folga ${f1(k.slack)} d). A <b>postagem</b> consome ${fP(k.hand / k.days, 0)} do lead time — é a etapa que o vendedor controla, antes de o caminhão sair.`];
  const big = [["aprovação", k.appr], ["postagem", k.hand], ["transporte", k.trans]].sort((x, y) => y[1] - x[1])[0]; bullets.push(`Maior etapa: <b>${big[0]}</b> (${f1(big[1])} d, ${fP(big[1] / k.days, 0)}).`);
  if (bench) { const dd = [["aprovação", k.appr - bench.appr], ["postagem", k.hand - bench.hand], ["transporte", k.trans - bench.trans]].sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))[0]; bullets.push(`Vs Brasil: real ${sg(k.days - bench.days)}${f1(Math.abs(k.days - bench.days))} d; a maior diferença está em <b>${dd[0]}</b> (${sg(dd[1])}${f1(Math.abs(dd[1]))} d).`); }
  if (bl) { const b = kp(raw(bl.m0, bl.m1, R.ufs)), c = kp(raw(bl.cur[0], bl.cur[1], R.ufs)); bullets.push(`${esc(bl.label)}: real ${f1(b.days)} → <b>${f1(c.days)} d</b>; transporte ${f1(b.trans)} → ${f1(c.trans)} d.`); }
  const h = `<div class="mz-title">Onde o tempo vai · ${esc(R.name)} · ${R.per}</div>` + seg + ins(bullets);
  return R_("etapas", a, R, h, { next: [nxt("Por que o prazo mudou?", CALL("explicar", { ...a, metrics: ["prazo"] })), nxt("Prazo por UF", CALL("ranking", { metrics: ["prazo"], dim: "uf", dir: "desc", m0: R.m0, m1: R.m1 })), nxt("E se reduzir 2 dias?", CALL("simular", { ...a, sim: { trans: 2, hand: 0, est: 0 } }))], acts: [{ label: "Abrir Prazo & SLA", fn: () => goView("prazo") }] });
}

/* ---------------- pagamento ---------------- */
function pagamento(a) {
  const R = resolve(a), k = kp(raw(R.m0, R.m1, R.ufs)), bench = R.all ? null : kp(raw(R.m0, R.m1, U)), bl = baselineFor(R.m0, R.m1, a.base);
  const rows = [["Cartão", "credito", k.credit, bench && bench.credit], ["Boleto", "boleto", k.boleto, bench && bench.boleto], ["Voucher", "voucher", k.voucher, bench && bench.voucher], ["Débito", "debito", k.debit, bench && bench.debit]];
  const bullets = [`Cartão parcela em média <b>${f1(k.inst)}x</b>. A soma passa de 100% porque um pedido pode usar mais de um meio de pagamento.`];
  if (bl) { const c = kp(raw(bl.cur[0], bl.cur[1], R.ufs)), b = kp(raw(bl.m0, bl.m1, R.ufs)); bullets.push(`${esc(bl.label)}: boleto ${fP(b.boleto)} → <b>${fP(c.boleto)}</b>; cartão ${fP(b.credit)} → <b>${fP(c.credit)}</b>.`); }
  if (R.all || R.ufs.length > 1) { const rr = rankUf(MET.boleto, R.m0, R.m1, R.ufs); if (rr.length) bullets.push(`Maior uso de boleto: <b>${rr[0].u}</b> (${fP(rr[0].v)}); menor: <b>${rr[rr.length - 1].u}</b> (${fP(rr[rr.length - 1].v)}).`); }
  bullets.push("Boleto atrasa a aprovação (~1 dia) antes de o vendedor postar o pedido.");
  const h = `<div class="mz-title">Meios de pagamento · ${esc(R.name)} · ${R.per}</div>` + bars(rows.map(([l, id, v, b]) => ({ l, v, t: fP(v) + (b != null ? ` <small>BR ${fP(b, 0)}</small>` : ""), call: CALL("ranking", { metrics: [id], dim: "uf", dir: "desc", m0: R.m0, m1: R.m1 }) })), { lw: "68px", max: 1, fmt: v => fP(v) }) + ins(bullets);
  return R_("pagamento", a, R, h, { next: [nxt("Boleto por UF", CALL("ranking", { metrics: ["boleto"], dim: "uf", dir: "desc", m0: R.m0, m1: R.m1 })), nxt("Boleto mês a mês", CALL("serie", { ...a, metrics: ["boleto"] }))], acts: [{ label: "Abrir Faturamento", fn: () => goView("receita") }] });
}

/* ---------------- evento ---------------- */
function evento(a) {
  const R = resolve({ ...a, m0: 0, m1: NM - 1 }); const ufs = R.ufs;
  const list = a.ev ? D.events.filter(e => e.m === a.ev) : D.events;
  if (!list.length) return R_("evento", a, R, `Não há evento mapeado para esse termo.`, {});
  const atr = mseries(MET.atraso, ufs), order = atr.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]).map(x => x[1]), avg = mean(atr);
  let h = `<div class="mz-title">${a.ev ? esc(list[0].label) : "Eventos mapeados"} · ${esc(R.name)}</div>`; const bullets = [];
  list.forEach(e => {
    const i = M.indexOf(e.m), b = i > 0 ? i - 1 : null, af = i < NM - 1 ? i + 1 : null, cols = [b, i, af].filter(x => x != null);
    const rowsM = ["atraso", "prazo", "pedidos", "nota"].map(id => { const m = MET[id], vs = cols.map(c => mv(m, raw(c, c, ufs))), d = b != null ? dlt(m, vs[cols.indexOf(i)], vs[0]) : null; return { cells: [`<b>${esc(m.L)}</b>`, ...vs.map(v => m.fmt(v)), d ? chip(d) : "–"] }; });
    h += `<div class="mz-sub">${esc(e.label)} · ${mlabel(i)}</div>` + table(["", ...cols.map(c => mlabel(c)), "Δ evento"], rowsM) + note(esc(e.desc));
    const dA = b != null ? atr[i] - atr[b] : 0, rank = order.indexOf(i) + 1;
    bullets.push(`<b>${esc(e.label)}</b>: atraso ${b != null ? fP(atr[b]) + " → " : ""}<b>${fP(atr[i])}</b> (${b != null ? sg(dA) + f1(Math.abs(dA) * 100) + " p.p." : "sem mês anterior"}) · ${ordinal(rank)} pior mês de ${NM} (média da série ${fP(avg)}). ${rank <= 2 ? "Entre os piores momentos da série." : Math.abs(dA) < .01 ? "Efeito modesto neste recorte." : ""}`);
    { const sp = lateSplit(ufs, i, i); bullets.push(sp.excess > 0 ? `Estrutural x evento: base sem evento <b>${fP(sp.base)}</b>; o mês teve <b>${fN(sp.excess)}</b> atrasos acima da base (${fP(sp.excess / (sp.late || 1), 0)} dos atrasos do mês). Janela: ${esc(e.janela)}.` : `Neste escopo o mês <b>não fica acima da base estrutural</b> (${fP(sp.base)}): o evento não aparece nos dados daqui.`); }
    if (b != null && af != null) bullets.push(`Depois do evento: ${mlabel(af)} ficou em ${fP(atr[af])} — ${atr[af] < atr[i] - .005 ? "a malha se recuperou" : atr[af] > atr[i] + .005 ? "o problema persistiu/piorou" : "estável"}.`);
  });
  h += ins(bullets) + note("O painel agrupa pelo MÊS DA COMPRA: o evento aparece em quem comprou e estava em trânsito/backlog, não no mês da entrega. Leitura temporal (antes/durante/depois); não prova causalidade." + (D.meta.real ? "" : " <b>Dados simulados:</b> o tamanho do efeito vem do gerador (sim.py), não do mundo; valide com etl_olist.py no dataset real."));
  const e0 = list[0], i0 = M.indexOf(e0.m);
  return R_("evento", a, R, h, { next: [nxt(`Por que ${mlabel(i0)} foi crítico?`, CALL("explicar", { metrics: ["atraso"], m0: i0, m1: i0, ufs: a.ufs })), nxt("Quais UFs mais sofreram?", CALL("ranking", { metrics: ["atraso"], dim: "uf", dir: "desc", m0: i0, m1: i0 })), nxt("Atraso mês a mês", CALL("serie", { metrics: ["atraso"], ufs: a.ufs }))], acts: [{ label: `Ver ${mlabel(i0)} no painel`, fn: () => setFilters({ m0: i0, m1: i0 }) }] });
}

/* ---------------- simular ---------------- */
// usa o mesmo motor da aba Simulador (simRun/simNeed): ganho por corredor, com piso físico, custo e meta por região
function simular(a) {
  const R = resolve(a), s = a.sim || { trans: 0, hand: 0, est: 0 }, mode = a.mode || "struct";
  const base = simRun(R.ufs, { mode }), nd = simNeed(R.ufs, mode), split = lateSplit(R.ufs, 0, NM - 1), act = (s.trans || 0) + (s.hand || 0) + (s.est || 0) > 0;
  const money = x => (x < 0 ? "−" : "") + fR(Math.abs(x));
  let h = `<div class="mz-title">Simulação · ${esc(R.name)} · base: ${MODE_LBL[mode]} (${fN(base.n)} entregas)</div>`; const bullets = [];
  if (act) {
    const sel = s.sel != null ? s.sel : SIMP.sel, acc = SIMP.acc, r = simRun(R.ufs, { tv: s.trans || 0, hv: s.hand || 0, ev: s.est || 0, mode, sel, acc });
    h += `<div class="mz-big">${fP(r.L1)}<span>atraso projetado (hoje ${fP(r.L0)})</span></div><div class="mz-chips">${chip({ txt: sg(r.L1 - r.L0) + f1(Math.abs(r.L1 - r.L0) * 100) + " p.p.", tone: r.L1 < r.L0 ? "good" : "bad" })}<span class="mzc flat">${fN(r.fixed)} pedidos deixam de atrasar</span><span class="mzc flat">nota ${f2(r.N0)} → ${f2(r.N1)}★</span></div>`;
    if (s.trans) bullets.push(`Transporte: pedido <b>−${s.trans} d</b>, realizado <b>−${f1(r.gT)} d</b> nos pedidos acelerados (${fP(r.accShare, 0)} do escopo; triagem acerta ${acc}% dos mais atrasados). O ganho é aplicado por corredor e para no <b>piso físico</b> (1 d + km rodoviário ÷ ${FLOOR.kmDia}); ${fP(r.atFloor, 0)} do escopo já está no piso.`);
    if (s.hand) bullets.push(`Postagem: pedido −${s.hand} d, realizado <b>−${f1(r.gH)} d</b> (piso de ${FLOOR.hand} d).`);
    if (s.est) bullets.push(`Folga de <b>+${s.est} d</b> na promessa não acelera nada: só empurra a data prometida. Custo operacional zero, mas custa conversão: ${fN(r.lost)} pedidos perdidos (premissa ${f1(SIMP.conv)}%/dia) = <b>${money(r.costProm)}</b>, já descontado do resultado.`);
    bullets.push(1 - r.L1 >= SLA_META ? `Atinge a meta de ${fP(SLA_META, 0)} no prazo.` : `Ainda <b>não</b> atinge a meta de ${fP(SLA_META, 0)} no prazo (${fP(1 - r.L1)}).`);
    if (r.cost > 0) bullets.push(`Custo total: <b>${money(r.cost)}</b> (operação ${money(r.costOp)} + promessa ${money(r.costProm)}). <b>Custo por atraso evitado: ${isFinite(r.costPerAvoided) ? fRs(r.costPerAvoided) : "–"}</b>. Com um atraso custando ${fRs(SIMP.late)}, o resultado líquido é <b>${money(r.net)}</b> (${r.net >= 0 ? "vale a pena" : "não se paga"}); empata se um atraso custar ${isFinite(r.costPerAvoided) ? fRs(r.costPerAvoided) : "–"}.`);
  }
  { const fb = simBest(R.ufs, mode, "all", SIMP.acc); bullets.push(`<b>Vale a pena?</b>${bestMsg(fb)}`); }
  bullets.push(nd.already ? `${esc(R.name)} já cumpre a meta de ${fP(SLA_META, 0)} (${fP(1 - base.L0)} no prazo, base estrutural).` : nd.reachable ? `Para bater <b>${fP(SLA_META, 0)} no prazo</b>, ${esc(R.name)} precisa de <b>−${nd.tv >= 30 ? "o máximo físico" : nd.tv + " d"} de transporte</b>${nd.hv ? ` e −${nd.hv} d de postagem` : ""}.` : `${esc(R.name)} <b>não bate ${fP(SLA_META, 0)} só com operação</b>: no piso físico fica em ${fP(1 - nd.L1)}. O resto exige rever a promessa ou a malha.`);
  if (split.hasEv) bullets.push(`Atraso <b>estrutural ${fP(split.base)}</b>; meses de evento chegam a ${fP(split.evRate)} e respondem por <b>${fN(split.excess)}</b> atrasos (${fP(split.excess / (split.late || 1), 0)}). Velocidade extra não resolve evento: precisa de plano de contingência.`);
  const SC = [[1, 0], [2, 0], [3, 0], [5, 0], [10, 0], [3, 1]].map(([t, hd]) => { const r = simRun(R.ufs, { tv: t, hv: hd, mode, sel: SIMP.sel, acc: SIMP.acc }); return { cells: [`−${t} d transp.${hd ? ` + ${hd} d post.` : ""}`, `−${f1(r.gT + r.gH)} d em ${fP(r.accShare, 0)}`, fP(r.L1), fN(r.fixed), money(r.cost), isFinite(r.costPerAvoided) ? fRs(r.costPerAvoided) : "–", `<span class="mzc ${1 - r.L1 >= SLA_META ? "good" : "flat"}">${1 - r.L1 >= SLA_META ? "bate a meta" : "abaixo"}</span>`] }; });
  h += `<div class="mz-sub">Cenários · ganho pedido → realizado (com piso) e custo</div>` + table(["Cenário", "Realizado", "Atraso", "Evitados", "Custo", "R$/evitado", "Meta"], SC) + ins(bullets) + note(`Premissas de custo (modelo, não dado): transporte R$ ${f2(COST.a)} fixo + parcela por kg e km calibrada p/ margem nacional de ${fP(MARGEM_REF, 0)}; só os ${SIMP.sel}% de pedidos em risco pagam o prêmio de expresso (${SIMP.prem}%/dia, +25%/dia) e a postagem (R$ ${f2(HAND_COST)}/pedido/dia); triagem acerta ${SIMP.acc}%. Distribuição deslocada por corredor (aproximação).`);
  return R_("simular", a, R, h, { next: [nxt("Onde o tempo é gasto?", CALL("etapas", a)), nxt("Quais corredores mais atrasam?", CALL("corredores", { ...a, by: "atrasos" })), nxt("Simular −3 dias de transporte", CALL("simular", { ...a, sim: { trans: 3, hand: 0, est: 0 } }))], acts: [{ label: "Aplicar no Simulador", fn: () => nav(() => { const t = s.trans || (act ? 0 : Math.min(10, nd.tv)); $("#sTrans").value = Math.min(10, t); $("#sHand").value = Math.min(4, s.hand || (act ? 0 : nd.hv)); $("#sEst").value = Math.min(10, s.est || 0); $("#sSel").value = s.sel != null ? s.sel : (act ? SIMP.sel : 100); if (R.single) { S.uf = R.single; S.region = ""; } else if (R.region && !R.all) { S.region = R.region; S.uf = ""; } syncFilters(false); setView("simulador"); }) }] });
}

/* ---------------- anomalias ---------------- */
function robustZ(v) { const md = median(v), mad = median(v.map(x => Math.abs(x - md))) * 1.4826 || (Math.sqrt(mean(v.map(x => (x - mean(v)) ** 2))) || 1e-9); return v.map(x => (x - md) / mad); }
function detrend(v) { const n = v.length, xs = v.map((_, i) => i), mx = mean(xs), my = mean(v), b = xs.reduce((s, x, i) => s + (x - mx) * (v[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0); return v.map((y, i) => y - (my + b * (i - mx))); }
function anomalias(a) {
  const R = resolve(a), out = [], TH = 2.2;
  ["atraso", "prazo", "pedidos", "nota", "frete", "ticket", "nao_entregues"].forEach(id => {
    const m = MET[id], s = mseries(m, R.ufs); if (s.some(x => !isFinite(x))) return;
    const z = robustZ(m.kind === "count" || m.kind === "money" ? detrend(s) : s);
    z.forEach((zz, i) => { if (Math.abs(zz) >= TH) out.push({ m, i, z: zz, v: s[i], med: median(s) }); });
  });
  out.sort((x, y) => Math.abs(y.z) - Math.abs(x.z));
  const top = out.slice(0, 7), ufRows = [];
  if (R.ufs.length > 1) ["atraso", "prazo", "frete", "nota", "ticket"].forEach(id => { const m = MET[id], rr = rankUf(m, R.m0, R.m1, R.ufs); if (rr.length < 6) return; const z = robustZ(rr.map(x => x.v)); z.forEach((zz, i) => { if (Math.abs(zz) >= TH) ufRows.push({ m, u: rr[i].u, z: zz, v: rr[i].v, med: median(rr.map(x => x.v)) }); }); });
  ufRows.sort((x, y) => Math.abs(y.z) - Math.abs(x.z));
  const tone = (m, z) => m.better === "none" ? "flat" : (z > 0) === (m.better === "up") ? "good" : "bad";
  let h = `<div class="mz-title">Anomalias · ${esc(R.name)}</div>`;
  h += `<div class="mz-sub">No tempo (mês fora do padrão da própria série)</div>`;
  h += top.length ? table(["Mês", "Métrica", "Valor", "Típico", "Desvio"], top.map(x => ({ cells: [mlabel(x.i) + (evOf(x.i) ? ` <small>${esc(evOf(x.i).label)}</small>` : ""), esc(x.m.L), `<b>${x.m.fmt(x.v)}</b>`, x.m.fmt(x.med), `<span class="mzc ${tone(x.m, x.z)}">${sg(x.z)}${f1(Math.abs(x.z))}σ</span>`], call: CALL("explicar", { metrics: [x.m.id], ufs: a.ufs, region: a.region, m0: x.i, m1: x.i }) }))) : `<div class="mz-note">Nenhum mês passou do limiar de ${TH}σ.</div>`;
  if (ufRows.length) h += `<div class="mz-sub">Entre UFs (${R.per})</div>` + table(["UF", "Métrica", "Valor", "Mediana", "Desvio"], ufRows.slice(0, 6).map(x => ({ cells: [`<b>${x.u}</b>`, esc(x.m.L), x.m.fmt(x.v), x.m.fmt(x.med), `<span class="mzc ${tone(x.m, x.z)}">${sg(x.z)}${f1(Math.abs(x.z))}σ</span>`], call: CALL("consultar", { metrics: [x.m.id], ufs: [x.u], m0: R.m0, m1: R.m1 }) })));
  const bullets = []; if (top[0]) bullets.push(`Desvio mais forte: <b>${esc(top[0].m.l)}</b> em <b>${mlabel(top[0].i)}</b> (${top[0].m.fmt(top[0].v)} vs típico ${top[0].m.fmt(top[0].med)})${evOf(top[0].i) ? ` — coincide com <b>${esc(evOf(top[0].i).label)}</b>` : " — <b>sem evento mapeado</b>, vale investigar"}.`);
  const noEv = top.filter(x => !evOf(x.i)); if (noEv.length) bullets.push(`${noEv.length} desvio(s) <b>não coincidem</b> com eventos mapeados.`);
  if (ufRows[0]) bullets.push(`UF mais fora do padrão: <b>${ufRows[0].u}</b> em ${esc(ufRows[0].m.l)} (${ufRows[0].m.fmt(ufRows[0].v)} vs mediana ${ufRows[0].m.fmt(ufRows[0].med)}).`);
  h += ins(bullets) + note(`σ robusto (mediana/MAD) · pedidos e faturamento são medidos sem a tendência de crescimento · limiar ${TH}σ.`);
  return R_("anomalias", a, R, h, { next: top[0] ? [nxt(`Por que ${mlabel(top[0].i)}?`, CALL("explicar", { metrics: [top[0].m.id], ufs: a.ufs, m0: top[0].i, m1: top[0].i })), nxt("Mês a mês", CALL("serie", { ...a, metrics: [top[0].m.id] }))] : [nxt("Resumo", CALL("resumo", a))] });
}

/* ---------------- distribuição ---------------- */
function distribuicao(a) {
  const R = resolve(a), mm_ = rangeOf(R.m0, R.m1), h0 = diffDist(R.ufs, mm_), hB = diffDist(U, mm_), N = h0.reduce((s, x) => s + x, 0), NB = hB.reduce((s, x) => s + x, 0);
  const B = [["≥10 d antes", -99, -10], ["1–9 d antes", -9, -1], ["no dia", 0, 0], ["1–3 d depois", 1, 3], ["4–7 d depois", 4, 7], ["8–14 d depois", 8, 14], ["≥15 d depois", 15, 99]];
  const share = (h, n, lo, hi) => { let s = 0; h.forEach((c, i) => { const d = i + D.diffMin; if (d >= lo && d <= hi) s += c; }); return s / n; };
  const pct = (h, n, p) => { let acc = 0; for (let i = 0; i < h.length; i++) { acc += h[i]; if (acc / n >= p) return i + D.diffMin; } return D.diffMax; };
  const rows = B.map(([l, lo, hi]) => ({ l, v: share(h0, N, lo, hi), vb: share(hB, NB, lo, hi), late: lo > 0 }));
  const p50 = pct(h0, N, .5), p90 = pct(h0, N, .9), p95 = pct(h0, N, .95), bullets = [];
  bullets.push(p50 < 0 ? `A mediana chega <b>${Math.abs(p50)} dia(s) antes</b> do prometido — a promessa é <b>conservadora</b>; há folga para prometer menos.` : `A mediana chega ${p50 === 0 ? "no dia prometido" : p50 + " dia(s) depois"} — promessa apertada.`);
  bullets.push(`Cauda: 90% das entregas chegam até <b>${p90 > 0 ? "+" + p90 : p90} d</b> do prometido e 95% até <b>${p95 > 0 ? "+" + p95 : p95} d</b>. Atraso grave (≥ 8 d): <b>${fP(rows[5].v + rows[6].v)}</b> dos pedidos.`);
  if (!R.all) bullets.push(`Vs Brasil: ${fP(rows.filter(r => r.late).reduce((s, r) => s + r.v, 0))} atrasados contra ${fP(rows.filter(r => r.late).reduce((s, r) => s + r.vb, 0))}.`);
  const h = `<div class="mz-title">Chegou antes ou depois? · ${esc(R.name)} · ${R.per} (${fN(N)} entregas)</div>` + bars(rows.map(r => ({ l: r.l, v: r.v, t: fP(r.v), c: r.late ? "var(--mz-bad)" : r.l === "no dia" ? "var(--mz-acc)" : "var(--mz-blue)" })), { lw: "92px", fmt: v => fP(v) }) + ins(bullets) + note("Dias relativos ao prazo prometido no checkout (negativo = antes). Mês = mês da compra.");
  return R_("distribuicao", a, R, h, { csv: [["Faixa", "Participação", "Brasil"], ...rows.map(r => [r.l, r.v, r.vb])], next: [nxt("E se reduzir 2 dias?", CALL("simular", { ...a, sim: { trans: 2, hand: 0, est: 0 } })), nxt("Como o atraso afeta a nota?", CALL("nota_vs_atraso", a))] });
}

/* ---------------- nota × atraso ---------------- */
function notaVsAtraso(a) {
  const R = resolve(a), k = kp(raw(R.m0, R.m1, R.ufs));
  const B = [[-45, -10, "≥10 d antes"], [-9, -1, "1–9 d antes"], [0, 0, "no dia"], [1, 3, "1–3 d depois"], [4, 7, "4–7 d depois"], [8, 14, "8–14 d depois"], [15, 30, "≥15 d depois"]];
  const rows = B.map(([lo, hi, l]) => { let n = 0, s = 0; for (let d = lo; d <= hi; d++) { const r = D.revCurve[d - D.diffMin]; n += r[0]; s += r[1]; } return { l, v: n ? s / n : NaN, n, late: lo > 0 }; });
  const cf = k.notaOn * SLA_META + k.notaLate * (1 - SLA_META);
  const bullets = [`Entregue no prazo: <b>${f2(k.notaOn)}★</b>. Atrasado: <b>${f2(k.notaLate)}★</b> — diferença de <b>${f2(k.notaOn - k.notaLate)}★</b>.`, `Atraso é só ${fP(k.late)} das entregas, mas responde por <b>${fP(k.rev1Late, 0)}</b> das avaliações 1★.`, `Com o atraso na meta (${fP(1 - SLA_META, 0)}), a nota média estimada seria <b>${f2(cf)}★</b> (hoje ${f2(k.nota)}★).`, `Quanto mais cedo chega, melhor: de “1–9 d antes” para “≥15 d depois” a nota cai ${f2(rows[1].v - rows[6].v)}★.`];
  const h = `<div class="mz-title">Atraso derruba a nota · ${esc(R.name)} · ${R.per}</div><div class="mz-big">${f2(k.notaOn)} → ${f2(k.notaLate)}★<span>no prazo → atrasado</span></div>` + bars(rows.map(r => ({ l: r.l, v: r.v, t: f2(r.v) + "★", c: r.late ? "var(--mz-bad)" : "var(--mz-blue)" })), { lw: "96px", max: 5, fmt: v => f2(v) }) + ins(bullets) + note("A curva por faixa usa todas as avaliações do Brasil (não varia por UF/período).");
  return R_("nota_vs_atraso", a, R, h, { next: [nxt("Por que a nota mudou?", CALL("explicar", { ...a, metrics: ["nota"] })), nxt("E se reduzir 2 dias?", CALL("simular", { ...a, sim: { trans: 2, hand: 0, est: 0 } })), nxt("Notas por UF", CALL("ranking", { metrics: ["nota"], dim: "uf", dir: "asc", m0: R.m0, m1: R.m1 }))] });
}

/* ---------------- resumo ---------------- */
function resumo(a) {
  const R = resolve(a), cur = raw(R.m0, R.m1, R.ufs), bl = baselineFor(R.m0, R.m1, a.base), base = bl ? raw(bl.m0, bl.m1, R.ufs) : null, curC = bl && bl.kind === "yoy" ? raw(bl.cur[0], bl.cur[1], R.ufs) : cur;
  const k = kp(cur), it = ["pedidos", "faturamento", "atraso", "prazo", "nota", "frete"].map(id => { const m = MET[id]; return { l: m.L, v: m.fmt(mv(m, cur)), d: base ? dlt(m, mv(m, curC), mv(m, base)) : null }; });
  let findings = [];
  if (R.single || R.region || R.all) findings = withState({ m0: R.m0, m1: R.m1, uf: R.single || "", region: R.single ? "" : R.all ? "" : R.region }, () => buildInsights());
  findings.sort((x, y) => (y.cls === "bad") - (x.cls === "bad"));
  const h = `<div class="mz-title">Resumo · ${esc(R.name)} · ${R.per}</div>${kpis(it)}${bl ? note("Δ " + esc(bl.label)) : ""}` + (findings.length ? `<div class="mz-sub">Achados</div><div class="mz-finds">${findings.slice(0, 5).map((f, i) => `<div class="mz-find clk"${f.call ? at(f.call) : ` data-q="${esc(f.ask)}"`}><span class="n">${i + 1}</span><div><b>${esc(f.h)}</b><small>${esc(f.p)}</small></div><span class="badge ${f.cls}">${esc(f.b)}</span></div>`).join("")}</div>` : "");
  return R_("resumo", a, R, h, { next: [nxt("Quais UFs mais atrasam?", CALL("ranking", { metrics: ["atraso"], dim: "uf", dir: "desc", m0: R.m0, m1: R.m1 })), nxt("Detectar anomalias", CALL("anomalias", a)), nxt("Mês a mês", CALL("serie", { ...a, metrics: ["pedidos"] }))], acts: [filterAct(R)] });
}
function kpis(items) { return `<div class="mz-kpis">${items.map(k => `<div class="mz-k"><span class="kl">${esc(k.l)}</span><b>${k.v}</b>${k.d ? chip(k.d) : ""}</div>`).join("")}</div>`; }

/* ---------------- utilitárias ---------------- */
const EXAMPLES = [
  ["ranking", "Ranking", "Qual UF mais atrasa?", { metrics: ["atraso"], dim: "uf", dir: "desc" }],
  ["consultar", "Consultar", "Frete em RR", null],
  ["serie", "Série", "Evolução do atraso mês a mês", null],
  ["comparar", "Comparar", "SP vs RJ", null],
  ["explicar", "Explicar", "Por que o atraso subiu em março de 2018?", null],
  ["corredores", "Corredores", "Corredores para a BA", null],
  ["categorias", "Categorias", "Categorias com mais atraso", null],
  ["etapas", "Etapas", "Onde o tempo de entrega é gasto?", null],
  ["pagamento", "Pagamento", "Como o cliente paga?", null],
  ["evento", "Eventos", "Efeito da greve dos caminhoneiros", null],
  ["simular", "Simular", "E se eu reduzir 2 dias no transporte?", null],
  ["anomalias", "Anomalias", "O que está fora do padrão?", null],
  ["distribuicao", "Distribuição", "Distribuição de dias vs prometido", null],
  ["nota_vs_atraso", "Nota × atraso", "Como o atraso afeta a nota?", null],
  ["resumo", "Resumo", "Resumo dos achados", null],
];
const SIG = { ranking: "metrica, dim(uf|regiao|mes), dir, n, escopo, periodo", consultar: "metricas[], escopo, periodo", serie: "metrica, escopo, periodo", comparar: "grupos[2–4] (UFs, regiões ou períodos), metricas[]", explicar: "metrica, escopo, periodo → decomposição por UF/etapa/corredor", corredores: "escopo, origem, por(atrasos|taxa|volume|lentos|caros)", categorias: "por(receita|atraso|ticket|pedidos), escopo, periodo", etapas: "escopo, periodo", pagamento: "escopo, periodo", evento: "evento(greve|black friday|carnaval|ressaca)", simular: "dias, etapa(transporte|postagem|prazo), escopo", anomalias: "escopo, periodo (σ robusto)", distribuicao: "escopo", nota_vs_atraso: "escopo, periodo", resumo: "escopo, periodo" };
function catalogo() {
  const h = `<div class="mz-title">Ferramentas disponíveis (${EXAMPLES.length})</div><div class="mz-tools">${EXAMPLES.map(([t, n, ex]) => `<div class="mz-tool clk" data-q="${esc(ex)}"><b>${t}</b><small>${esc(SIG[t])}</small><em>“${esc(ex)}”</em></div>`).join("")}</div>` + note("Funciona como um servidor MCP local: cada pergunta vira uma chamada tipada (visível no chip acima da resposta) executada sobre o cubo de dados. Clique num exemplo para rodar.");
  return R_("catalogo", {}, null, h, {});
}
function ajuda() {
  const h = `<div class="mz-title">O que dá para perguntar</div>` + ins([
    "<b>Rankings</b>: “qual UF mais atrasa?”, “top 5 fretes mais caros”, “pior mês de 2018”",
    "<b>Consultas</b>: “prazo na BA”, “nota em SP em março de 2018”",
    "<b>Por quê</b>: “por que o atraso subiu?”, “o que puxou o frete em RR?”",
    "<b>Comparações</b>: “SP vs RJ”, “2018 vs 2017”, “Nordeste × Sul”",
    "<b>Rotas</b>: “corredores para a BA”, “de SP para PE”, “rotas mais lentas que a distância”",
    "<b>Cenários</b>: “e se eu reduzir 3 dias?”, “quantos dias para bater a meta?”",
    "<b>Vigilância</b>: “o que está fora do padrão?”, “efeito da greve”",
    "<b>Conversa</b>: depois de uma resposta, “e em MG?”, “e em maio?”, “por quê?”, “mês a mês”",
  ]) + note("Clique em qualquer card, KPI ou achado do painel para gerar uma análise. Digite “ferramentas” para ver o catálogo.");
  return R_("ajuda", {}, null, h, {});
}
function fonte() {
  const k = kp(raw(0, NM - 1, U));
  const h = `<div class="mz-title">Sobre os dados</div>` + ins([`<b>${esc(D.meta.fonte)}</b>`, `${fN(k.orders)} pedidos · ${M[0]} a ${M[NM - 1]} · 27 UFs · ${D.cats.length - 1} categorias.`, "Atraso = entregue depois da data prometida no checkout. Prazo = compra → entrega ao cliente. Nota = review_score (1–5).", D.meta.real ? "Dados reais do dataset Olist." : "Esta versão usa <b>dados simulados</b> calibrados em estatísticas públicas do Olist. Rode <code>etl_olist.py</code> com os CSVs do Kaggle para trocar pelos reais — o painel e a Mesa não mudam.", "Licença do dataset: CC BY-NC-SA 4.0 (atribuição, uso não comercial)."]);
  return R_("fonte", {}, null, h, {});
}
function saudacao() { return R_("saudacao", {}, null, `Oi! Pergunte sobre <b>atraso, prazo, frete, faturamento, nota, corredores</b> ou eventos — por UF, região ou mês. Ou clique em qualquer card do painel para eu analisar.`, { next: [nxt("Resumo dos achados", CALL("resumo", {})), nxt("Qual UF mais atrasa?", CALL("ranking", { metrics: ["atraso"], dim: "uf", dir: "desc" })), nxt("Ferramentas", CALL("catalogo", {}))] }); }
function pix() { const k = kp(raw(S.m0, S.m1, scopeUfs())); return R_("pix", {}, null, `O Pix só foi lançado em nov/2020 — no período do painel os meios são <b>cartão de crédito (${fP(k.credit, 0)})</b>, <b>boleto (${fP(k.boleto, 0)})</b>, voucher e débito.`, { next: [nxt("Como o cliente paga?", CALL("pagamento", {}))] }); }

/* ---------------- contexto exportável (cole em um chat gratuito de LLM) ---------------- */
function contextMD() {
  const L = []; const k = kp(raw(0, NM - 1, U));
  L.push(`# Contexto de dados — Trecho Logística (entregas e frete)`, "", `Responda apenas com base nos dados abaixo. Se algo não estiver aqui, diga que não há dado. Mostre os cálculos quando fizer contas.`, "", `Fonte: ${D.meta.fonte}`, `Período: ${M[0]} a ${M[NM - 1]} · ${fN(k.orders)} pedidos · 27 UFs · SLA meta: ${fP(SLA_META, 0)} no prazo.`, `Definições: atraso = entregue após a data prometida; prazo = compra→entrega (dias); folga = prometido − real; peso do frete = frete ÷ (produtos+frete); nota = review 1–5.`, "");
  L.push(`## Recorte atual do painel`, `${scopeLabel()}`, "");
  const row = (name, r) => { const x = kp(r); return `| ${name} | ${fN(x.orders)} | ${fR(x.freight)} | ${fR(x.gmv)} | ${fR(x.cost)} | ${fP(x.margin, 0)} | ${fP(x.late)} | ${f1(x.days)} | ${f1(x.est)} | ${f2(x.nota)} |`; };
  const head = `| ${"{}"} | Pedidos | Receita de frete | GMV transportado | Custo transp. (modelo) | Margem (modelo) | Atraso | Prazo real (d) | Prometido (d) | Nota |\n|---|---|---|---|---|---|---|---|---|---|`;
  L.push(`## Por mês (Brasil)`, head.replace("{}", "Mês")); for (let i = 0; i < NM; i++) L.push(row(M[i], raw(i, i, U))); L.push("");
  L.push(`## Por UF (período completo)`, head.replace("{}", "UF")); U.map(u => ({ u, r: raw(0, NM - 1, [u]) })).sort((a, b) => b.r[F.orders] - a.r[F.orders]).forEach(x => L.push(row(`${x.u} (${REG[x.u]})`, x.r))); L.push("");
  L.push(`## Por UF — últimos 6 meses (${perLabel(NM - 6, NM - 1)})`, head.replace("{}", "UF")); U.map(u => ({ u, r: raw(NM - 6, NM - 1, [u]) })).filter(x => x.r[F.orders] > 0).sort((a, b) => b.r[F.orders] - a.r[F.orders]).forEach(x => L.push(row(x.u, x.r))); L.push("");
  const cs = corridors(U, 0, NM - 1).filter(c => c.o >= MIN_N).sort((a, b) => b.l - a.l).slice(0, 25);
  L.push(`## Corredores com mais atrasos (origem→destino, top 25, mínimo ${MIN_N} pedidos)`, `| Corredor | Pedidos | Atrasos | Taxa | IC 95% | Prazo real | Transporte | Prometido | Frete médio | Custo (modelo) |`, `|---|---|---|---|---|---|---|---|---|---|`); cs.forEach(c => L.push(`| ${c.key} | ${fN(c.o)} | ${fN(c.l)} | ${fP(c.late)} | ${fP(c.ci[0])}–${fP(c.ci[1])} | ${f1(c.days)} | ${f1(c.trans)} | ${f1(c.est)} | ${fRs(c.frete)} | ${fRs(c.cost)} |`)); L.push("");
  const cc = catsR(U, 0, NM - 1).filter(c => c.n !== "Outras").sort((a, b) => b.g - a.g);
  L.push(`## Categorias`, `| Categoria | Pedidos | Receita de produtos | Atraso |`, `|---|---|---|---|`); cc.forEach(c => L.push(`| ${c.n} | ${fN(c.o)} | ${fR(c.g)} | ${fP(c.l / (c.d || 1))} |`)); L.push("");
  L.push(`## Eventos`); D.events.forEach(e => L.push(`- ${e.m} (mês da compra) · ${e.label}: ${e.desc}. Janela: ${e.janela}.`)); { const sp = lateSplit(U, 0, NM - 1); L.push(`Atraso estrutural (meses sem evento): ${fP(sp.base)}; meses de evento: ${fP(sp.evRate)}; excesso de eventos: ${fN(sp.excess)} atrasos.`); } L.push("");
  L.push(`## Premissas e limites`, ...(D.meta.real ? [] : ["- DADOS SIMULADOS (sim.py, calibrados em estatísticas públicas do Olist): achados são propriedades do gerador, não do mundo."]), `- Meta de SLA: ${fP(SLA_META, 0)} no prazo, medida por região de destino.`, `- Custo de transporte é MODELO (R$ ${f2(COST.a)} fixo + parcela por kg^${COST.wk} × km^${COST.dk}, calibrada para margem nacional de ${fP(MARGEM_REF, 0)}), não dado: margem por UF/corredor só reflete essa premissa. Receita de frete = frete cobrado do cliente; GMV = valor das mercadorias.`, `- Distância: ${D.meta.km}, multiplicada por ${f1(CIRC)} para estimar a rodoviária.`, `- Simulador: ganho por corredor limitado ao piso físico (1 d + km rodoviário ÷ ${FLOOR.kmDia}; postagem ≥ ${FLOOR.hand} d).`, `- Taxas com menos de ${MIN_N} observações não devem ser interpretadas.`, "");
  L.push(`## Etapas do prazo (Brasil)`, `Aprovação ${f1(k.appr)} d · Postagem ${f1(k.hand)} d · Transporte ${f1(k.trans)} d · Prometido ${f1(k.est)} d · Real ${f1(k.days)} d.`, `Nota no prazo ${f2(k.notaOn)}★ vs atrasado ${f2(k.notaLate)}★.`);
  return L.join("\n");
}

/* ---------------- despacho ---------------- */
const TOOLS = { consultar, serie, ranking, comparar, explicar, corredores: corredoresT, categorias, etapas, pagamento, evento, simular, anomalias, distribuicao, nota_vs_atraso: notaVsAtraso, resumo, catalogo, ajuda, fonte, saudacao, pix };
const FRIENDLY = { m0: "de", m1: "até" };
function describeArgs(tool, a) {
  const R = a && (a.ufs || a.region || a.m0 != null || a.metrics) ? resolve(a) : null, p = [];
  if (a && a.metrics && ["consultar", "serie", "ranking", "explicar", "comparar"].includes(tool)) p.push("metrica=" + a.metrics.join("+"));
  if (a && a.dim && a.dim !== "uf") p.push("dim=" + a.dim);
  if (a && a.dir && tool === "ranking") p.push("ordem=" + a.dir);
  if (a && a.by) p.push("por=" + a.by);
  if (a && a.orig) p.push("origem=" + a.orig);
  if (a && a.periods) p.push("periodos=" + a.periods.map(x => perLabel(x[0], x[1])).join(" × "));
  if (a && a.regions) p.push("regioes=" + a.regions.join(" × "));
  if (a && a.ev) p.push("evento=" + a.ev);
  if (a && a.sim) p.push("transporte=" + (a.sim.trans || 0) + "d postagem=" + (a.sim.hand || 0) + "d folga=" + (a.sim.est || 0) + "d acelerados=" + (a.sim.sel != null ? a.sim.sel : SIMP.sel) + "%");
  const sc = resolve(a || {}); p.push("escopo=" + (a && a.ufs && a.ufs.length ? a.ufs.join(",") : sc.region || (sc.all ? "Brasil" : sc.single || sc.name)));
  if (!a || !a.periods) p.push("periodo=" + sc.per);
  return p;
}
function run(call) {
  const fn = TOOLS[call.tool]; if (!fn) return null;
  const t0 = performance.now(), res = fn(call.args || {}); res.ms = Math.max(1, Math.round(performance.now() - t0)); res.call = call; res.params = describeArgs(call.tool, call.args || {}); res.text = toText(res.h);
  return res;
}
return { run, TOOLS, EXAMPLES, contextMD, toText, CALL };
})();
