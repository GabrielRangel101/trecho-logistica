/* ======================================================================
   MESA · CORE — consultas tipadas: métricas, parser de linguagem natural, planner e contexto
   Roda 100% no navegador sobre o cubo de dados embutido. Custo zero.
   Este arquivo é injetado dentro do IIFE de app.js (usa D, F, S, agg, corridors…).
   ====================================================================== */
const MZ = {};
MZ.core = (() => {
"use strict";
const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/* ---------------- métricas ---------------- */
// kind: count | money | rs | pct | days | stars | x     better: up | down | none
// num/den: funções sobre o vetor bruto do cubo (permitem decompor razões com exatidão)
// cn/cd: equivalentes sobre corredores (origem→destino); n: tamanho de amostra
const r_ = k => r => r[F[k]];
const MET = {
  pedidos:      { L: "Pedidos", l: "pedidos", kind: "count", fmt: fN, num: r_("orders"), n: r_("orders"), better: "up" },
  entregues:    { L: "Pedidos entregues", l: "pedidos entregues", kind: "count", fmt: fN, num: r_("delivered"), n: r_("delivered"), better: "up" },
  atrasados:    { L: "Pedidos atrasados", l: "pedidos atrasados", kind: "count", fmt: fN, num: r_("late"), n: r_("delivered"), better: "down" },
  faturamento:  { L: "Valor movimentado (GMV + frete)", l: "valor movimentado (GMV + frete)", kind: "money", fmt: fR, num: r => r[F.gmv] + r[F.freight], n: r_("orders"), better: "up" },
  gmv:          { L: "GMV transportado", l: "GMV transportado (valor das mercadorias)", kind: "money", fmt: fR, num: r_("gmv"), n: r_("orders"), better: "up" },
  receita_frete:{ L: "Receita de frete", l: "receita de frete (o que o cliente paga pelo transporte)", kind: "money", fmt: fR, num: r_("freight"), n: r_("orders"), better: "up" },
  custo_frete:  { L: "Custo de transporte (modelo)", l: "custo de transporte (modelo)", kind: "money", fmt: fR, num: r => costOf(r[F.delivered], r[F.sumKW]), n: r_("delivered"), better: "down", model: true },
  margem_frete: { L: "Margem de frete (modelo)", l: "margem de frete (modelo)", kind: "pct", fmt: v => fP(v, 0), num: r => r[F.freight] - costOf(r[F.delivered], r[F.sumKW]), den: r_("freight"), n: r_("delivered"), better: "up", model: true },
  ticket:       { L: "Ticket médio", l: "ticket médio", kind: "rs", fmt: fRs, num: r => r[F.gmv] + r[F.freight], den: r_("orders"), n: r_("orders"), better: "up" },
  atraso:       { L: "Taxa de atraso", l: "taxa de atraso", kind: "pct", fmt: v => fP(v), num: r_("late"), den: r_("delivered"), n: r_("delivered"), better: "down", cn: c => c.l, cd: c => c.o },
  prazo:        { L: "Prazo real", l: "prazo real de entrega", kind: "days", fmt: v => f1(v) + " d", num: r_("sumDays"), den: r_("delivered"), n: r_("delivered"), better: "down", cn: c => c.d, cd: c => c.o },
  prometido:    { L: "Prazo prometido", l: "prazo prometido", kind: "days", fmt: v => f1(v) + " d", num: r_("sumEst"), den: r_("delivered"), n: r_("delivered"), better: "none", cn: c => c.e, cd: c => c.o },
  folga:        { L: "Folga média", l: "folga (prometido − real)", kind: "days", fmt: v => f1(v) + " d", num: r => r[F.sumEst] - r[F.sumDays], den: r_("delivered"), n: r_("delivered"), better: "none" },
  aprovacao:    { L: "Aprovação do pagamento", l: "tempo de aprovação", kind: "days", fmt: v => f1(v) + " d", num: r_("sumAppr"), den: r_("delivered"), n: r_("delivered"), better: "down" },
  postagem:     { L: "Postagem", l: "tempo de postagem (vendedor → transportadora)", kind: "days", fmt: v => f1(v) + " d", num: r_("sumHand"), den: r_("delivered"), n: r_("delivered"), better: "down" },
  transporte:   { L: "Transporte", l: "tempo de transporte", kind: "days", fmt: v => f1(v) + " d", num: r_("sumTrans"), den: r_("delivered"), n: r_("delivered"), better: "down" },
  dias_atraso:  { L: "Dias de atraso (quando atrasa)", l: "dias de atraso quando atrasa", kind: "days", fmt: v => "+" + f1(v) + " d", num: r_("sumLateDays"), den: r_("late"), n: r_("late"), better: "down" },
  frete:        { L: "Peso do frete", l: "peso do frete no pedido", kind: "pct", fmt: v => fP(v), num: r_("freight"), den: r => r[F.gmv] + r[F.freight], n: r_("orders"), better: "down" },
  frete_medio:  { L: "Frete médio", l: "frete médio por pedido", kind: "rs", fmt: fRs, num: r_("freight"), den: r_("orders"), n: r_("orders"), better: "down", cn: c => c.f, cd: c => c.o },
  nota:         { L: "Nota do cliente", l: "nota média do cliente", kind: "stars", fmt: v => f2(v) + "★", num: r_("sumRev"), den: r_("nRev"), n: r_("nRev"), better: "up", cn: c => c.rs, cd: c => c.rn },
  nota_atrasados: { L: "Nota de quem recebeu atrasado", l: "nota dos pedidos atrasados", kind: "stars", fmt: v => f2(v) + "★", num: r_("lateRev"), den: r_("nLateRev"), n: r_("nLateRev"), better: "up" },
  pct_1estrela: { L: "Avaliações 1★", l: "avaliações 1★", kind: "pct", fmt: v => fP(v), num: r_("rev1"), den: r_("nRev"), n: r_("nRev"), better: "down" },
  pct_5estrela: { L: "Avaliações 5★", l: "avaliações 5★", kind: "pct", fmt: v => fP(v), num: r_("rev5"), den: r_("nRev"), n: r_("nRev"), better: "up" },
  nao_entregues:{ L: "Não entregues", l: "pedidos não entregues", kind: "pct", fmt: v => fP(v), num: r_("notDelivered"), den: r_("orders"), n: r_("orders"), better: "down" },
  credito:      { L: "Pago no cartão de crédito", l: "participação do cartão de crédito", kind: "pct", fmt: v => fP(v), num: r_("credit"), den: r_("orders"), n: r_("orders"), better: "none" },
  boleto:       { L: "Pago no boleto", l: "participação do boleto", kind: "pct", fmt: v => fP(v), num: r_("boleto"), den: r_("orders"), n: r_("orders"), better: "none" },
  voucher:      { L: "Pago com voucher", l: "participação do voucher", kind: "pct", fmt: v => fP(v), num: r_("voucher"), den: r_("orders"), n: r_("orders"), better: "none" },
  debito:       { L: "Pago no débito", l: "participação do débito", kind: "pct", fmt: v => fP(v), num: r_("debit"), den: r_("orders"), n: r_("orders"), better: "none" },
  parcelas:     { L: "Parcelas no cartão", l: "parcelas médias no cartão", kind: "x", fmt: v => f1(v) + "x", num: r_("sumInst"), den: r_("credit"), n: r_("credit"), better: "none" },
};
Object.keys(MET).forEach(id => MET[id].id = id);
const mv = (m, r) => { const n = m.num(r); if (!m.den) return n; const d = m.den(r); return d ? n / d : NaN; };
const raw = (m0, m1, ufs) => agg(m0, m1, ufs).raw;
const val = (m, m0, m1, ufs) => mv(m, raw(m0, m1, ufs));
const mseries = (m, ufs, m0 = 0, m1 = NM - 1) => { const o = []; for (let i = m0; i <= m1; i++) o.push(mv(m, raw(i, i, ufs))); return o; };

// diferença formatada + tom (good/bad/flat) segundo a direção "melhor" da métrica
function dlt(m, a, b) {
  if (!isFinite(a) || !isFinite(b)) return { txt: "–", tone: "flat", d: NaN, rel: NaN };
  let txt, d = a - b, rel = b ? a / b - 1 : NaN;
  const sg = x => x > 0 ? "+" : x < 0 ? "−" : "";
  if (m.kind === "pct") txt = sg(d) + f1(Math.abs(d) * 100) + " p.p.";
  else if (m.kind === "days") txt = sg(d) + f1(Math.abs(d)) + " d";
  else if (m.kind === "stars") txt = sg(d) + f2(Math.abs(d)) + "★";
  else if (m.kind === "x") txt = sg(d) + f1(Math.abs(d)) + "x";
  else txt = isFinite(rel) ? sg(rel) + f1(Math.abs(rel) * 100) + "%" : "–";
  const mag = m.kind === "pct" ? Math.abs(d) * 100 : m.kind === "days" ? Math.abs(d) : m.kind === "stars" ? Math.abs(d) * 4 : Math.abs(rel) * 100;
  const flat = !isFinite(mag) || mag < (m.kind === "days" ? .05 : m.kind === "pct" ? .05 : .3);
  const tone = flat || m.better === "none" ? "flat" : ((d > 0) === (m.better === "up") ? "good" : "bad");
  return { txt: flat ? "estável" : txt, tone, d, rel };
}
// teste z de proporção (atraso, % de 1★…): diferença vs referência é maior que o ruído?
function zprop(p, n, p0) { if (!(n > 0) || !(p0 > 0 && p0 < 1)) return 0; return (p - p0) / Math.sqrt(p0 * (1 - p0) / n); }

/* ---------------- período, escopo, estado ---------------- */
const perLabel = (m0, m1) => m0 === 0 && m1 === NM - 1 ? "jan/17–ago/18" : m0 === m1 ? mlabel(m0) : mlabel(m0) + "–" + mlabel(m1);
function withState(o, fn) { const sv = { m0: S.m0, m1: S.m1, uf: S.uf, region: S.region }; Object.assign(S, o); try { return fn(); } finally { Object.assign(S, sv); } }
function resolve(a) {
  const ufs = a.ufs && a.ufs.length ? a.ufs : a.region ? U.filter(u => REG[u] === a.region) : scopeUfs();
  const m0 = a.m0 ?? S.m0, m1 = a.m1 ?? S.m1;
  const name = a.ufs && a.ufs.length === 1 ? D.geo[a.ufs[0]].nome : a.ufs && a.ufs.length > 1 ? a.ufs.join(" + ") : a.region ? a.region : (S.uf ? D.geo[S.uf].nome : S.region || "Brasil");
  const single = ufs.length === 1 ? ufs[0] : null;
  return { ufs, m0, m1, name, single, all: ufs.length === U.length, per: perLabel(m0, m1), region: a.region || (!(a.ufs && a.ufs.length) && S.region) || "" };
}
// mesma regra do painel: período anterior; sem ele, mesmos meses de 2017
function baselineFor(m0, m1, prefer) {
  const len = m1 - m0 + 1;
  const yoy = () => { if (m1 < 12) return null; const c0 = Math.max(12, m0); return { kind: "yoy", m0: c0 - 12, m1: m1 - 12, cur: [c0, m1], label: perLabel(c0, m1) + " vs " + perLabel(c0 - 12, m1 - 12) }; };
  const prev = () => m0 - len >= 0 ? { kind: "prev", m0: m0 - len, m1: m0 - 1, cur: [m0, m1], label: perLabel(m0, m1) + " vs " + perLabel(m0 - len, m0 - 1) } : null;
  return prefer === "yoy" ? (yoy() || prev()) : (prev() || yoy());
}
const evOf = i => D.events.find(e => e.m === M[i]);

/* ---------------- vocabulário, sinônimos e correção de digitação ---------------- */
const SYN = [
  [/dias? de atraso|atraso medio|quanto (tempo )?atrasa|quando atrasa|diasatraso/, "dias_atraso"],
  [/nao entreg|extravi|nao chegou|nao chegaram|perdid|cancelad/, "nao_entregues"],
  [/\b(1|uma) estrelas?\b|\bnota 1\b|reclam|detrat|insatisf/, "pct_1estrela"],
  [/\b5 estrelas?\b|\bnota 5\b|promotor|elogi/, "pct_5estrela"],
  [/nota|avalia|review|satisf|estrela|csat|nps/, "nota"],
  [/custo (de |do |da )?(transporte|frete|entrega|logistic)|quanto (custa|gasta) (para )?(transportar|entregar)/, "custo_frete"],
  [/margem(?! de erro)|lucro/, "margem_frete"],
  [/receita (de |do )?frete|receita logistic|receita (de )?transport/, "receita_frete"],
  [/frete (medio|por pedido)|valor do frete|quanto (custa|cobra).*frete/, "frete_medio"],
  [/frete/, "frete"],
  [/ticket|valor medio|gasto medio|compra media/, "ticket"],
  [/receita(?! (de |do )?(frete|logistic|transport))/, "receita_frete"],
  [/gmv|valor das mercadorias|mercadoria/, "gmv"],
  [/fatura|vendas?\b|vendeu|dinheiro|r\$|ganh/, "faturamento"],
  [/pedidos?|volume|demanda|compras|quantidade|movimento/, "pedidos"],
  [/atras|sla\b|pontual|cumpr|promessa|dentro do prazo|diasprazo/, "atraso"],
  [/prometid|estimad|previst|diasprom/, "prometido"],
  [/folga|margem de erro/, "folga"],
  [/aprovac/, "aprovacao"],
  [/postagem|despacho|coleta|vendedor/, "postagem"],
  [/transport|transito|viagem/, "transporte"],
  [/prazo|demor|\bdias\b|tempo de entrega|tempo|rapid|lent|lead ?time|chega/, "prazo"],
  [/parcel/, "parcelas"],
  [/credito|cartao/, "credito"],
  [/boleto/, "boleto"],
  [/voucher/, "voucher"],
  [/debito/, "debito"],
];
function findMetrics(t) {
  let s = t.replace(/no prazo|dentro do prazo|fora do prazo/g, " pontual ").replace(/prazo prometido|prazo estimado|prazo previsto/g, " prometido ").replace(/prazo (real|medio)/g, " prazo ").replace(/frete (medio|por pedido)/g, " fretemedio ");
  const hits = [];
  SYN.forEach(([re, id]) => { const k = id === "frete_medio" ? /fretemedio|valor do frete|quanto (custa|cobra).*frete/ : re; const m = s.match(k); if (m) hits.push([m.index, id]); });
  const ids = new Set(hits.map(h => h[1]));
  const drop = (a, b) => { if (ids.has(a)) ids.delete(b); };
  drop("dias_atraso", "atraso"); drop("frete_medio", "frete"); drop("custo_frete", "frete"); drop("custo_frete", "frete_medio"); drop("receita_frete", "frete"); drop("margem_frete", "frete"); drop("custo_frete", "margem_frete"); drop("pct_1estrela", "nota"); drop("pct_5estrela", "nota"); drop("nota_atrasados", "nota");
  if (ids.has("prometido") || ids.has("folga") || ids.has("aprovacao") || ids.has("postagem") || ids.has("transporte")) ids.delete("prazo");
  if (ids.has("atraso") && ids.has("dias_atraso")) ids.delete("atraso");
  return hits.filter(h => ids.has(h[1])).sort((a, b) => a[0] - b[0]).map(h => h[1]).filter((v, i, a) => a.indexOf(v) === i);
}
const VOC = new Set(("atraso atrasos atrasa atrasam atrasado atrasados pontual pontualidade prazo prazos prometido promessa folga entrega entregas entregue entregues demora demoram demorada lento rapido faturamento receita custo custos margem lucro gmv vendas venda pedidos pedido volume ticket frete nota notas avaliacao avaliacoes estrelas reclamacao categoria categorias corredor corredores rota rotas origem destino regiao regioes nordeste sudeste centro-oeste norte estado estados compare comparar comparacao versus evolucao tendencia historico mensal simular simulacao anomalia anomalias outlier distribuicao percentil mediana pagamento pagamentos boleto cartao credito debito voucher parcelas parcelamento resumo panorama destaque insights explica explicar porque motivo causa greve caminhoneiros paralisacao black friday carnaval ressaca melhor pior maior menor ranking transporte postagem aprovacao etapas gargalo semestre trimestre ultimos meses janeiro fevereiro marco abril maio junho julho agosto setembro outubro novembro dezembro cliente clientes quanto quantos quantas onde quando qual quais mais menos aumentou diminuiu subiu caiu cresceu").split(" "));
U.forEach(u => norm(D.geo[u].nome).split(" ").forEach(w => w.length > 3 && VOC.add(w)));
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let mn = i;
    for (let j = 1; j <= b.length; j++) { const c = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); cur[j] = c; if (c < mn) mn = c; }
    if (mn > max) return max + 1; prev = cur;
  }
  return prev[b.length];
}
function fixTypos(t, notes) {
  return t.replace(/[a-z]{5,}/g, w => {
    if (VOC.has(w)) return w;
    const max = w.length < 8 ? 1 : 2; let best = null, bd = max + 1;
    for (const v of VOC) { if (Math.abs(v.length - w.length) > max) continue; const d = lev(w, v, max); if (d < bd) { bd = d; best = v; } }
    if (best && bd <= max) { notes.push(`“${w}” → “${best}”`); return best; }
    return w;
  });
}

/* ---------------- entidades: UF, região, período ---------------- */
const UFNAMES = U.map(u => [u, norm(D.geo[u].nome)]).sort((a, b) => b[1].length - a[1].length);
const UF_ALIAS = [["sampa", "SP"], ["paulista", "SP"], ["minas", "MG"], ["mineiro", "MG"], ["brasilia", "DF"], ["gaucho", "RS"], ["capixaba", "ES"], ["catarinense", "SC"], ["carioca", "RJ"], ["baiano", "BA"], ["pernambucano", "PE"]];
const AMBIG = new Set(["SE", "ES", "PA", "MA", "TO", "AM", "AL", "PI", "GO", "AC", "RO"]);
const PREP = /(?:\b(?:em|no|na|nos|nas|do|da|de|para|pra|ao|vs|x|versus|contra|entre|com|ate)\s+)$/;
function findUfs(q, t) {
  const found = []; let s = t;
  for (const [u, n] of UFNAMES) {
    const re = new RegExp("(?<![a-z])" + n.replace(/ /g, "\\s+") + "(?![a-z])", "g"); let m;
    while ((m = re.exec(s))) {
      if (u === "PA") { const before = s.slice(0, m.index); const accent = /pará/i.test(q.slice(m.index, m.index + 4)); if (!accent && !/(?:\b(?:no|do|em|pelo|ao)\s+)$/.test(before)) continue; }
      found.push({ u, i: m.index, e: m.index + m[0].length }); s = s.slice(0, m.index) + " ".repeat(m[0].length) + s.slice(m.index + m[0].length);
    }
  }
  for (const [k, u] of UF_ALIAS) { const re = new RegExp("(?<![a-z])" + k + "(?![a-z])", "g"); let m; while ((m = re.exec(s))) { found.push({ u, i: m.index, e: m.index + k.length }); s = s.slice(0, m.index) + " ".repeat(k.length) + s.slice(m.index + k.length); } }
  { const re = /(?<![a-z])rio(?![a-z])/g; let m; while ((m = re.exec(s))) { found.push({ u: "RJ", i: m.index, e: m.index + 3 }); s = s.slice(0, m.index) + "   " + s.slice(m.index + 3); } }
  const re2 = /(?<![a-z0-9])([a-z]{2})(?![a-z0-9])/g; let m;
  while ((m = re2.exec(s))) {
    const u = m[1].toUpperCase(); if (!U.includes(u)) continue;
    const upper = q.slice(m.index, m.index + 2) === u;
    if (AMBIG.has(u) && !upper && (u === "SE" || u === "TO" || !PREP.test(s.slice(0, m.index)))) continue;
    found.push({ u, i: m.index, e: m.index + 2 });
  }
  found.sort((a, b) => a.i - b.i);
  return found.filter((f, i, a) => a.findIndex(g => g.u === f.u) === i);
}
function findRegions(t, ufHits) {
  let s = t; ufHits.forEach(h => { s = s.slice(0, h.i) + " ".repeat(h.e - h.i) + s.slice(h.e); });
  s = s.replace(/rio grande do (norte|sul)|mato grosso do sul/g, m => " ".repeat(m.length));
  const out = [];
  [[/centro[ -]?oeste/, "Centro-Oeste"], [/nordest/, "Nordeste"], [/sudest/, "Sudeste"], [/\bnorte\b/, "Norte"], [/\bsul\b/, "Sul"]].forEach(([re, r]) => { const m = s.match(re); if (m) { out.push([m.index, r]); s = s.slice(0, m.index) + " ".repeat(m[0].length) + s.slice(m.index + m[0].length); } });
  return out.sort((a, b) => a[0] - b[0]).map(x => x[1]);
}
const MIDX = {}; ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"].forEach((n, i) => { MIDX[n] = i; MIDX[n.slice(0, 3)] = i; });
const MIDX_RE = "(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)";
const yearAt = (mo, y) => M.indexOf(y + "-" + String(mo + 1).padStart(2, "0"));
function panelYear() { const a = M[S.m0].slice(0, 4), b = M[S.m1].slice(0, 4); return a === b ? a : null; }
function findPeriods(t, notes) {
  const ranges = []; let m;
  const push = (m0, m1, kind = "range") => { if (m0 >= 0 && m1 >= 0) ranges.push({ m0: Math.min(m0, m1), m1: Math.max(m0, m1), kind }); };
  if ((m = t.match(/ultimos?\s+(\d+)\s+mes(?:es)?/))) { const n = Math.min(NM, Math.max(1, +m[1])); push(NM - n, NM - 1, "rel"); return { ranges, joiner: null }; }
  if (/ultimo mes|mes mais recente|mes atual/.test(t)) { push(NM - 1, NM - 1, "rel"); return { ranges, joiner: null }; }
  if (/ultimos meses|recentemente|nos ultimos tempos/.test(t)) { push(NM - 3, NM - 1, "rel"); return { ranges, joiner: null }; }
  if ((m = t.match(/(1o|1º|primeiro|2o|2º|segundo)\s*semestre(?:\s*(?:de|do)?\s*(2017|2018))?/))) {
    const sem = /^(1|prim)/.test(m[1]) ? 0 : 1, y = m[2] || (sem ? "2017" : "2018"); push(yearAt(sem * 6, y), Math.min(NM - 1, yearAt(sem * 6 + 5, y) >= 0 ? yearAt(sem * 6 + 5, y) : NM - 1), "year"); if (ranges.length) return { ranges, joiner: null };
  }
  if ((m = t.match(/(?:\b(1o|primeiro|2o|segundo|3o|terceiro|4o|quarto)\s*tri(?:mestre)?|\bq([1-4])\b)(?:\s*(?:de|do)?\s*(2017|2018))?/))) {
    const qn = m[2] ? +m[2] - 1 : { "1o": 0, primeiro: 0, "2o": 1, segundo: 1, "3o": 2, terceiro: 2, "4o": 3, quarto: 3 }[m[1]], y = m[3] || (qn >= 2 ? "2017" : "2018");
    const a = yearAt(qn * 3, y); let b = yearAt(qn * 3 + 2, y); if (b < 0) b = NM - 1; push(a, b, "year"); if (ranges.length) return { ranges, joiner: null };
  }
  // meses (com ou sem ano)
  const ments = [];
  const re = new RegExp("(?<![a-z])" + MIDX_RE + "(?![a-z])(?:\\s*(?:\\/|-|de|em|do)?\\s*(?:20)?(17|18)(?![0-9]))?", "g");
  while ((m = re.exec(t))) ments.push({ mo: MIDX[m[1]], y: m[2] ? "20" + m[2] : null, i: m.index, e: m.index + m[0].length });
  const re3 = /(?<![0-9])(0?[1-9]|1[0-2])\/(?:20)?(17|18)(?![0-9])/g;
  while ((m = re3.exec(t))) ments.push({ mo: +m[1] - 1, y: "20" + m[2], i: m.index, e: m.index + m[0].length });
  ments.sort((a, b) => a.i - b.i);
  const years = [...new Set((t.match(/(?<![0-9])(2017|2018)(?![0-9])/g) || []))];
  if (ments.length) {
    const hint = panelYear();
    const resolved = ments.map(x => {
      let y = x.y || (years.length === 1 ? years[0] : null);
      if (!y) { if (x.mo >= 8) y = "2017"; else if (hint) y = hint; else { y = "2018"; if (!notes.some(n => n.startsWith("ano"))) notes.push("ano não informado: usei 2018 (diga “2017” se quiser o outro)"); } }
      const k = yearAt(x.mo, y); if (k < 0 && !notes.some(n => n.startsWith("sem dados"))) notes.push(`sem dados de ${MES[x.mo]}/${y.slice(2)}: a série vai de jan/17 a ago/18`);
      return { ...x, k };
    }).filter(x => x.k >= 0);
    let joiner = null;
    if (resolved.length >= 2) {
      const between = t.slice(resolved[0].e, resolved[1].i);
      joiner = /^\s*(a|ate|ao|-|–)\s*$/.test(between) ? "a" : /^\s*(e|vs|versus|contra|x|com|ou|,)\s*$/.test(between) || /\b(vs|versus|contra)\b/.test(between) ? "e" : "e";
    }
    if (resolved.length === 1) push(resolved[0].k, resolved[0].k, "month");
    else if (joiner === "a") push(resolved[0].k, resolved[resolved.length - 1].k, "month");
    else resolved.forEach(x => push(x.k, x.k, "month"));
    return { ranges, joiner };
  }
  if (years.length) { years.forEach(y => y === "2017" ? push(0, 11, "year") : push(12, NM - 1, "year")); return { ranges, joiner: years.length > 1 ? "e" : null }; }
  if (/todo o periodo|periodo (todo|completo|inteiro)|serie (toda|inteira|completa)|desde o inicio|historico completo|\btudo\b/.test(t)) push(0, NM - 1, "all");
  return { ranges, joiner: null };
}

/* ---------------- parser ---------------- */
function parse(qRaw) {
  const q = qRaw.normalize("NFC").trim(), notes = [];
  let t = norm(q).replace(/\s*(→|->|=>|›|»)\s*/g, " para ").replace(/[“”"']/g, " ").replace(/\s+/g, " ");
  const ufHits = findUfs(q.replace(/\s*(→|->|=>|›|»)\s*/g, " para ").replace(/[“”"']/g, " ").replace(/\s+/g, " "), t);
  const t0 = t; t = fixTypos(t, notes);
  const regions = findRegions(t, ufHits);
  const per = findPeriods(t, notes);
  const metrics = findMetrics(t);
  const P = { q, t, ufHits, ufs: ufHits.map(h => h.u), regions, ranges: per.ranges, joiner: per.joiner, metrics, notes, tokens: t.split(" ").filter(Boolean).length };
  // origem/destino ("de SP para BA", "saindo de SP", "para a BA")
  P.orig = null; P.dest = null;
  if (ufHits.length >= 2) {
    const [a, b] = ufHits; const between = t.slice(a.e, b.i), before = t.slice(0, a.i);
    if (/^\s*(para|pra|ate|a)\s*(o|a)?\s*$/.test(between) && /(\bde|\bdo|\bda|saindo de|sai de|saem de|origem)\s*$/.test(before)) { P.orig = a.u; P.dest = b.u; }
  }
  if (ufHits.length === 1 && !P.orig) {
    const h = ufHits[0], before = t.slice(0, h.i);
    if (/(origem|sai(ndo|m)? d[eao]|saem d[eao]|vind[oa]s? d[eao]|vem d[eao]|partindo d[eao]|parte d[eao]|despachad\w* d[eao]|enviad\w* d[eao]|vendedores? d[eao])\s*$/.test(before)) P.orig = h.u;
    else if (/(\bpara|\bpra|destino|chegam? (em|na|no)|entregu\w* (em|na|no)|ate)\s*(o|a)?\s*$/.test(before)) P.dest = h.u;
  }
  const n = t.match(/\btop\s*(\d+)|\b(\d+)\s*(maiores|menores|piores|melhores|primeir\w+|ultim\w+)/); P.n = n ? +(n[1] || n[2]) : null;
  P.ev = /greve|caminhoneir|paralisac/.test(t) ? "2018-05" : /black ?friday|\bbf\b/.test(t) ? "2017-11" : /carnaval|chuvas/.test(t) ? "2018-02" : /ressaca|backlog/.test(t) ? "2018-03" : null;
  P.evAny = /\beventos?\b|\bpicos?\b/.test(t);
  P.hi = /\b(maior(es)?|mais|top|lider\w*|campea\w*|alto|altos|acima)\b/.test(t);
  P.lo = /\b(menor(es)?|menos|baixo|baixos|minimo|abaixo)\b/.test(t) || /mais (rapid\w*|barat\w*|pontua\w*|cedo)/.test(t);
  P.worst = /\b(pior(es)?|critic\w*|problem\w*|ruim|ruins|preocup\w*|gargalo)\b/.test(t);
  P.best = /\b(melhor(es)?|otim\w*|bom|boas?|exemplar|referencia)\b/.test(t);
  if (/mais (rapid\w*|barat\w*|pontua\w*)/.test(t)) P.hi = false;
  P.nums = [...t.matchAll(/(\d+(?:[.,]\d+)?)\s*(dias?|d)\b/g)].map(m => +m[1].replace(",", "."));
  P.t0 = t0;
  return P;
}

/* ---------------- planner: pergunta → chamada de ferramenta ---------------- */
const RANKRE = /\b(ranking|top ?\d*|maior(es)?|menor(es)?|pior(es)?|melhor(es)?|mais (atras\w*|demor\w*|lent\w*|rapid\w*|car\w*|barat\w*|pontua\w*|pesa\w*|vend\w*|gast\w*|reclam\w*|problem\w*|critic\w*)|menos \w+|quais|qual (uf|estado|regiao|mes|rota|corredor|categoria)\b|lider\w*|campea\w*|critic\w*|ordem|classific\w*|pior|melhor)\b/;
function plan(q, ctx) {
  const P = parse(q), t = P.t, has = re => re.test(t);
  const last = ctx.last;
  const exp = { metric: P.metrics.length > 0, scope: P.ufs.length > 0 || P.regions.length > 0, period: P.ranges.length > 0 };
  const A = {}; // argumentos
  let tool = null;
  const dim = has(/\bmeses\b|\bmes\b(?! passado)/) && has(RANKRE) ? "mes" : has(/\bregioes?\b/) ? "regiao" : "uf";

  if (/^(oi|ola|e ai|opa|bom dia|boa tarde|boa noite|hey|salve)\b/.test(t) && P.tokens <= 4) tool = "saudacao";
  else if (has(/\b(ajuda|help|exemplos?)\b|o que (voce|vc|tu) (faz|sabe|consegue|responde|pode)|como (te )?uso/)) tool = "ajuda";
  else if (has(/\b(ferramentas|tools|comandos|capacidades)\b/)) tool = "catalogo";
  else if (has(/\b(fonte|olist|kaggle|metodologia|licenca)\b|de onde (vem|vieram)|sobre os dados|dados (sao|e) (reais|verdadeiros|simulad\w*)|simulad/)) tool = "fonte";
  else if (has(/(exportar|copiar|baixar|gerar|montar).*(contexto|csv)|contexto (para|pro|pra) (o )?(claude|llm|chatgpt|ia)/)) tool = "exportar";
  else if (has(/(limpar|esquecer|resetar|zerar).*(contexto|conversa|memoria)|nova conversa/)) tool = "reset";
  else if (has(/\bpix\b/)) tool = "pix";
  else if (has(/simul|\be se\b|se (eu )?(reduzir|diminuir|acelerar|cortar|aumentar|melhorar|tirar|ganhar)|(quantos|quanto) dias? (preciso|falta|para|devo|tenho)|bater a meta|meta (de )?sla|atingir a meta|\bcenario/)) tool = "simular";
  else if (P.ev || (P.evAny && !exp.metric)) tool = "evento";
  else if (has(/anomal|outlier|estranh|fora d[oa] (padrao|normal|curva)|inesperad|surpres|discrepan|suspeit|(algo|o que).*(errado|diferente|fora)|desvio/)) tool = "anomalias";
  else if (has(/distribuic|histograma|percentil|\bp9[05]\b|\bp50\b|mediana|dispers|faixas?\b|variabilidade|cauda/)) tool = "distribuicao";
  else if ((has(/nota|avalia|review|estrela/) && has(/atras/)) || has(/como o atraso (afeta|impacta|derruba|pesa)/)) tool = "nota_vs_atraso";
  else if (has(/onde (o )?tempo|etapas?\b|gargalo|fases?\b|onde (se )?perde|em que etapa|lead ?time|decomp\w* do prazo/) || (P.metrics.length && P.metrics.every(m => ["aprovacao", "postagem", "transporte"].includes(m)) && !has(RANKRE))) tool = "etapas";
  else if (has(/por ?que|porque|por qual|motivo|\bcausa|explica|o que (aconteceu|puxou|explica|causou|mudou|esta (puxando|por tras))|diagnost|raiz|culpa|responsavel|de onde vem (o|a) (aumento|queda|piora|alta)|qual o impacto|o que fez/)) tool = "explicar";
  else if (has(/\bvs\b|versus|compar|contra\b|diferenca entre|\bx\b|em relacao a|frente a|comparado/) || (P.ufs.length >= 2 && !P.orig) || P.regions.length >= 2 || (P.ranges.length >= 2 && P.joiner === "e")) tool = "comparar";
  else if (has(/corredor|\brotas?\b|origem|destino|vendedores? d|trajeto|\bmalha\b/) || P.orig || (P.ufs.length >= 2 && P.orig)) tool = "corredores";
  else if (has(/categoria|produto|segmento|setor|\bitens?\b/)) tool = "categorias";
  else if (has(/pagament|\bpag(a|am|ar|ou|o)\b|boleto|cartao|credito|debito|voucher|parcel/) && !has(RANKRE)) tool = "pagamento";
  else if (has(/evolucao|tendencia|serie|mes a mes|ao longo|historico|por mes|mensal|trajetoria|como (evoluiu|variou|mudou|foi)|crescimento|cresceu|caiu|subiu|sazonal|linha do tempo/)) tool = "serie";
  else if (has(RANKRE) && !(P.ufs.length === 1 && !has(/\b(ranking|top|quais|qual (uf|estado|regiao|mes))\b/))) tool = "ranking";
  else if (has(/resumo|panorama|visao geral|como (esta|estamos|vai|anda)|principais|destaques?|achados|insights?|pauta|alertas?|status|\bsitua\w+|radiografia|perfil/)) tool = "resumo";
  else if (exp.metric) tool = "consultar";
  const intent = tool;

  // ---- argumentos explícitos
  if (P.ufs.length) A.ufs = P.ufs.slice();
  if (P.regions.length && !P.ufs.length) A.region = P.regions[0];
  if (P.regions.length > 1) A.regions = P.regions.slice();
  if (P.ranges.length) { A.m0 = P.ranges[0].m0; A.m1 = P.ranges[0].m1; if (P.ranges[0].kind === "year" || P.ranges[0].kind === "all") A.base = "yoy"; }
  if (P.ranges.length > 1 && (tool === "comparar")) A.periods = P.ranges.map(r => [r.m0, r.m1]);
  if (P.metrics.length) A.metrics = P.metrics.slice();
  if (P.orig) A.orig = P.orig; if (P.dest) { A.ufs = [P.dest]; A.dest = P.dest; }
  if (P.orig && P.ufs.length >= 2 && P.dest) A.ufs = [P.dest];
  if (P.orig && !P.dest) A.ufs = (P.ufs.filter(u => u !== P.orig).length ? P.ufs.filter(u => u !== P.orig) : undefined); if (A.ufs === undefined) delete A.ufs;
  if (P.n) A.n = P.n;
  if (P.ev) A.ev = P.ev;

  // ---- sentido do ranking
  const dirFor = met => { const b = met ? met.better : "none"; if (P.worst) return b === "up" ? "asc" : "desc"; if (P.best) return b === "up" ? "desc" : "asc"; if (P.lo) return "asc"; return "desc"; };

  // ---- continuação: sem intenção própria herda ferramenta/argumentos do último turno
  let inherited = false;
  const marker = /^(e|entao|agora|mas|tambem|so|apenas|ok|beleza|sim)\b/.test(t), hasEnt = exp.metric || exp.scope || exp.period;
  const followUp = last && (marker || P.tokens <= 3 || (hasEnt && P.tokens <= 6));
  if (!intent && followUp) {
    inherited = true; tool = last.tool;
    const la = last.args || {};
    for (const k of Object.keys(la)) if (A[k] === undefined && !(k === "ufs" && A.region) && !(k === "region" && A.ufs)) A[k] = la[k];
    if (exp.scope) { if (A.region && P.ufs.length) delete A.region; if (P.ufs.length && !P.regions.length) delete A.region; }
    if (exp.period) { delete A.periods; }
    if (tool === "ranking" && P.ufs.length) { tool = "consultar"; }
    if (tool === "comparar" && P.ufs.length && last.args.ufs && !exp.metric) { A.ufs = [...new Set([...(last.args.ufs || []), ...P.ufs])].slice(0, 4); }
    if (["resumo", "ajuda", "saudacao", "catalogo", "fonte"].includes(tool) && exp.metric) tool = "consultar";
    P.notes.push("continuando a conversa: " + (last.label || last.tool));
  } else if (intent && last && last.args && ["explicar", "serie", "corredores", "categorias", "etapas", "nota_vs_atraso", "consultar", "anomalias", "distribuicao", "pagamento"].includes(tool) && ((marker && !exp.scope && !exp.period) || (!hasEnt && (P.tokens <= 3 || (tool === "explicar" && P.tokens <= 6))))) {
    // "por quê?", "mês a mês?", "e o boleto?" → herda o que faltar do turno anterior
    if (!exp.metric && last.args.metrics) A.metrics = last.args.metrics.slice();
    if (!exp.scope) { if (last.args.ufs) A.ufs = last.args.ufs.slice(); if (last.args.region) A.region = last.args.region; }
    if (!exp.period && last.args.m0 != null) { A.m0 = last.args.m0; A.m1 = last.args.m1; }
    inherited = true; P.notes.push("usei o contexto da pergunta anterior");
  } else if (!tool) {
    tool = (exp.scope || exp.period) ? "resumo" : null;
  }
  // ---- ajustes por ferramenta
  if (tool === "ranking") { A.dim = A.dim || dim; const m = MET[(A.metrics || [])[0]]; if (!A.metrics) { A.metrics = [P.worst || P.best ? "atraso" : "pedidos"]; } A.dir = dirFor(MET[A.metrics[0]]); if (inherited && last && last.tool === "ranking") { if (/contrario|inverso|oposto|\bpior\b|\bmelhor\b|menos|menor/.test(t)) A.dir = P.worst || P.best || P.lo ? A.dir : (last.args.dir === "asc" ? "desc" : "asc"); } if (!(exp.scope) && A.ufs && !inherited) delete A.ufs; if (A.dim !== "uf" && A.ufs && P.ufs.length === 0) delete A.ufs; }
  if (tool === "explicar" && !A.metrics) A.metrics = ["atraso"];
  if (tool === "serie" && !A.metrics) A.metrics = ["atraso"];
  if (tool === "corredores") { A.by = has(/taxa|percentual|proporc|%/) ? "taxa" : has(/lent\w*|devagar|acima do esperado|distancia/) ? "lentos" : has(/volume|pedidos|movimento|maiores/) && !has(/atras/) ? "volume" : has(/frete|car[oa]s?|custo/) ? "caros" : "atrasos"; if (P.worst || P.best) A.dir = P.best ? "asc" : "desc"; }
  if (tool === "categorias") A.by = has(/atras|pontual|prazo/) ? "atraso" : has(/ticket|medio/) ? "ticket" : has(/pedidos|volume|quantidade/) ? "pedidos" : has(/frete/) ? "frete" : "receita";
  if (tool === "simular") A.sim = parseSim(t, P);
  if (tool === "evento" && !A.ev && !P.evAny && last && last.args && last.args.ev) A.ev = last.args.ev;
  if (tool === "comparar" && !P.ufs.length && !P.regions.length && !(A.periods && A.periods.length > 1)) {
    // "SP vs média", "2018 vs 2017"
    if (/\b(2017)\b/.test(t) && /\b(2018)\b/.test(t)) A.periods = [[0, 11], [12, NM - 1]];
    else if (!A.ufs && !A.region && last && last.args && last.args.ufs) A.ufs = last.args.ufs.slice();
  }
  if (tool === "comparar" && A.periods == null && P.ranges.length === 1 && /compar|vs|versus|contra|frente/.test(t) && !P.ufs.length && !P.regions.length) {
    const b = baselineFor(P.ranges[0].m0, P.ranges[0].m1, A.base); if (b) A.periods = [[b.cur[0], b.cur[1]], [b.m0, b.m1]];
  }
  const label = q.length > 46 ? q.slice(0, 44) + "…" : q;
  return { tool, args: A, notes: P.notes, P, label, inherited };
}
function parseSim(t, P) {
  const s = { trans: 0, hand: 0, est: 0, meta: /meta|bater|atingir/.test(t) };
  const gain = /reduz|diminu|acelera|cort|tir[ao]|ganh|melhor|antecip|encurt/.test(t);
  const pc = t.match(/(\d+)\s*%\s*(dos\s+)?(pedidos|mais atrasados|em risco)/); if (pc) s.sel = Math.min(100, +pc[1]); else if (/todos os pedidos|corredor inteiro|tudo/.test(t)) s.sel = 100;
  const n = P.nums.length ? P.nums.filter(x => !pc || x !== +pc[1])[0] ?? null : null;
  if (n != null) {
    if (/prazo prometido|promessa|prometer|estimativa|folga|prometido/.test(t) || /(aument|ampli|along)\w*.*prazo/.test(t)) s.est = n;
    else if (/postagem|vendedor|despacho|coleta/.test(t)) s.hand = n;
    else s.trans = n;
  }
  return s;
}

return { MET, mv, raw, val, mseries, dlt, zprop, perLabel, withState, resolve, baselineFor, evOf, parse, plan, norm, SYN, UFNAMES };
})();
