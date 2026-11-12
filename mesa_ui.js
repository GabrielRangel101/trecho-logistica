/* ======================================================================
   MESA · UI — painel (overlay ou fixado ao lado), contexto, chamadas visíveis,
   cliques nos cards/KPIs/mapa e exportação de contexto.
   Gancho opcional: window.TRECHO_ASK = async (pergunta, contextoMarkdown) => "texto" | {html}
   ====================================================================== */
MZ.ui = (() => {
"use strict";
const { CALL } = MZ.tools;
const panel = $("#mesa"), body = $("#mesaBody"), scrim = $("#scrim"), sugEl = $("#mesaSug"), input = $("#mesaInput"), ctxBar = $("#mesaCtx");
const CTX = { last: null }, RES = new Map(); let rid = 0;
let docked = false; try { docked = localStorage.getItem("trecho-dock") === "1"; } catch (e) { }
const hist = []; let hi = 0;
const isOpen = () => panel.classList.contains("on");
const canDock = () => innerWidth >= 1100;
const el = (tag, cls, html) => { const d = document.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; };
const clean = o => JSON.parse(JSON.stringify(o || {}));
const callAttr = c => ` data-call="${esc(JSON.stringify(c))}"`;

/* ---------- abrir / fechar / fixar ---------- */
function applyDock(rerender) {
  const on = docked && isOpen() && canDock();
  document.body.classList.toggle("mesa-dock", on);
  scrim.classList.toggle("on", isOpen() && !on);
  const b = $("#mesaDock"); if (b) { b.setAttribute("aria-pressed", String(docked)); b.title = docked ? "Soltar painel (sobrepor ao conteúdo)" : "Fixar ao lado do painel"; }
  if (rerender) setTimeout(() => renderView(), 330);
}
function open() { panel.classList.add("on"); if (!body.children.length) welcome(); applyDock(true); ctxRefresh(); setTimeout(() => input.focus(), 160); }
function close() { const was = document.body.classList.contains("mesa-dock"); panel.classList.remove("on"); applyDock(was); $("#mesaBtn").focus(); }
function navigated() { if (!(docked && canDock())) close(); }
$("#mesaBtn").addEventListener("click", () => isOpen() ? close() : open());
$("#mesaClose").addEventListener("click", close);
scrim.addEventListener("click", close);
$("#mesaDock").addEventListener("click", () => { docked = !docked; try { localStorage.setItem("trecho-dock", docked ? "1" : "0"); } catch (e) { } applyDock(true); });
$("#mesaReset").addEventListener("click", resetConv);
$("#mesaTools").addEventListener("click", () => askCall(CALL("catalogo", {}), "Ferramentas disponíveis"));
$("#mesaCopy").addEventListener("click", doExport);
addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); isOpen() ? close() : open(); }
  else if (e.key === "Escape" && isOpen()) close();
});
addEventListener("resize", () => { if (isOpen()) applyDock(false); });

/* ---------- mensagens ---------- */
function scrollTo(node) { body.scrollTo({ top: Math.max(0, node.offsetTop - 10), behavior: REDUCED ? "auto" : "smooth" }); }
function addQ(text) { const d = el("div", "msg q"); d.textContent = text; body.appendChild(d); return d; }
function addText(html, cls = "") { const d = el("div", "msg a " + cls, html); body.appendChild(d); scrollTo(d); return d; }
function addA(res, notes) {
  const id = ++rid; RES.set(id, res);
  const prm = res.params.map(x => { const i = x.indexOf("="); return `<span class="pm"><i>${esc(x.slice(0, i))}</i>=${esc(x.slice(i + 1))}</span>`; }).join("");
  const d = el("div", "msg a");
  d.innerHTML = `<div class="mz-call" title="Chamada de ferramenta executada localmente sobre o cubo de dados"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12l5 5L20 6"/></svg><span class="fn">${esc(res.tool)}</span><span class="ps">(${prm})</span><span class="ms">${res.ms} ms</span></div>` +
    (notes && notes.length ? `<div class="mz-notes">${notes.map(esc).join(" · ")}</div>` : "") +
    `<div class="mz-res">${res.h}</div>` +
    (res.acts.length ? `<div class="act">${res.acts.map((a, i) => `<button data-act="${id}:${i}">${esc(a.label)}</button>`).join("")}</div>` : "") +
    `<div class="mz-foot"><button data-copy="${id}" title="Copiar a resposta como texto">Copiar texto</button>${res.csv ? `<button data-tsv="${id}" title="Copiar a tabela para colar no Excel ou Google Sheets">Copiar tabela</button>` : ""}</div>`;
  body.appendChild(d); scrollTo(d);
  setSug(res.next && res.next.length ? res.next : null);
  return d;
}
function addErr(e) { addText(`Algo deu errado ao calcular essa resposta (<code>${esc(e.message || e)}</code>). Tente reformular ou escolha uma sugestão abaixo.`, "err"); }

/* ---------- sugestões e contexto ---------- */
const DEFAULT_SUG = ["Resumo dos achados", "Qual UF mais atrasa?", "Efeito da greve dos caminhoneiros", "O que está fora do padrão?", "SP vs RJ", "Ferramentas"];
function setSug(next) {
  sugEl.innerHTML = next ? next.map(n => `<button${callAttr(n.call)}>${esc(n.t)}</button>`).join("") : DEFAULT_SUG.map(s => `<button data-q="${esc(s)}">${esc(s)}</button>`).join("");
}
function focusText() {
  const l = CTX.last; if (!l) return "";
  const a = l.args || {}, m = a.metrics && MZ.core.MET[a.metrics[0]], bits = [];
  bits.push(l.tool); if (m) bits.push(m.L); if (a.ufs && a.ufs.length) bits.push(a.ufs.join("+")); else if (a.region) bits.push(a.region); if (a.m0 != null) bits.push(MZ.core.perLabel(a.m0, a.m1));
  return bits.join(" · ");
}
function ctxRefresh() {
  const f = focusText();
  ctxBar.innerHTML = `<span class="cb-k">Painel</span><span class="cb-v">${esc(scopeLabel())}</span>` + (f ? `<span class="cb-k">Foco</span><button class="cb-chip" data-clearctx title="Esquecer o foco da conversa (“e em SP?” deixa de herdar métrica/escopo)">${esc(f)} <b>✕</b></button>` : `<span class="cb-hint">As respostas seguem o painel; use “e em SP?” para continuar.</span>`);
}
function welcome() {
  body.innerHTML = "";
  let ins = []; try { ins = buildInsights().sort((a, b) => (b.cls === "bad") - (a.cls === "bad")).slice(0, 3); } catch (e) { }
  body.appendChild(el("div", "pauta", `<div class="ph">Pauta do recorte · ${esc(scopeLabel())}</div>${ins.map((x, i) => `<button ${x.call ? callAttr(x.call) : `data-q="${esc(x.ask)}"`}><span class="pn">${i + 1}</span><span>${esc(x.h)}</span><span class="badge ${x.cls}">${esc(x.b)}</span></button>`).join("") || `<div class="ph" style="color:#7f8f8b">Sem achados para este recorte.</div>`}`));
  body.appendChild(el("div", "msg a", `<b>Pergunte em português</b> sobre atraso, prazo, frete, custo, margem, nota, corredores ou eventos. Cada pergunta vira uma <b>chamada de ferramenta</b> (visível no topo da resposta) calculada <b>aqui no navegador</b>, sobre os mesmos dados do painel — sem servidor e sem custo.<div class="mz-note" style="margin-top:8px">Dica: depois de uma resposta, continue com “e em MG?”, “e em maio?”, “por quê?” ou “mês a mês”. Clique em qualquer card, KPI ou achado para analisar.</div>`));
  setSug(null); ctxRefresh();
}
function resetConv() { CTX.last = null; RES.clear(); welcome(); body.scrollTop = 0; input.focus(); }

/* ---------- perguntar ---------- */
function pushHist(q) { if (hist[hist.length - 1] !== q) hist.push(q); hi = hist.length; }
function ask(q) {
  q = q.trim(); if (!q) return; if (!isOpen()) open(); pushHist(q); addQ(q);
  let p; try { p = MZ.core.plan(q, CTX); } catch (e) { console.error(e); return addErr(e); }
  if (!p.tool) return fallback(q, p);
  respond({ tool: p.tool, args: clean(p.args) }, p.notes, p.label, q);
}
function askCall(call, label) {
  if (!isOpen()) open(); if (label) addQ(label);
  respond({ tool: call.tool, args: clean(call.args) }, [], label || call.tool, label);
}
function respond(call, notes, label, q) {
  if (call.tool === "exportar") return doExport();
  if (call.tool === "reset") return resetConv();
  let res; try { res = MZ.tools.run(call); } catch (e) { console.error(e); return addErr(e); }
  if (!res) return fallback(q || label, { notes });
  addA(res, notes);
  if (!["saudacao", "ajuda", "catalogo", "fonte", "pix"].includes(call.tool)) { CTX.last = { tool: call.tool, args: call.args, label }; ctxRefresh(); }
}
async function fallback(q, p) {
  if (typeof window.TRECHO_ASK === "function") {
    const d = addText(`<span class="mz-note">Não casei com nenhuma ferramenta local — consultando o modelo conectado…</span>`);
    try { const r = await window.TRECHO_ASK(q, MZ.tools.contextMD()); d.innerHTML = typeof r === "string" ? esc(r).replace(/\n/g, "<br>") : r.html || esc(String(r)); } catch (e) { d.innerHTML = `O modelo conectado falhou: <code>${esc(e.message || e)}</code>.`; }
    return;
  }
  addText(`Não consegui ligar essa pergunta a uma ferramenta. Dá para falar de <b>atraso, prazo, frete, custo, margem, nota, pagamento, categorias, corredores</b> e <b>eventos</b>, por UF, região ou mês. Exemplos: <i>“atraso no Nordeste em 2018”</i>, <i>“MG vs PR”</i>, <i>“por que o frete subiu?”</i>.<div class="mz-note" style="margin-top:8px">Quer ir além dos dados do painel? Use <b>Copiar contexto</b> (ícone no topo) e cole num chat de IA gratuito.</div>`);
  setSug(null);
}

/* ---------- copiar / exportar ---------- */
let toastT; function toast(msg) { let t = $("#mzToast"); if (!t) { t = el("div", "mz-toast"); t.id = "mzToast"; t.setAttribute("role", "status"); panel.appendChild(t); } t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2200); }
async function copyText(txt, ok) {
  try { await navigator.clipboard.writeText(txt); toast(ok || "Copiado"); return true; } catch (e) { }
  try { const ta = el("textarea"); ta.value = txt; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); const r = document.execCommand("copy"); ta.remove(); if (r) { toast(ok || "Copiado"); return true; } } catch (e) { }
  toast("Não consegui copiar — use Baixar"); return false;
}
function download(name, txt) { const a = el("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "text/markdown;charset=utf-8" })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
function doExport() {
  if (!isOpen()) open();
  const md = MZ.tools.contextMD(), prompt = "Use só o contexto abaixo para responder minhas perguntas sobre entregas e faturamento. Mostre os cálculos.\n\n" + md;
  copyText(prompt, "Contexto copiado para a área de transferência");
  const d = addText(`<b>Contexto copiado</b> (${fN(prompt.length)} caracteres · ~${fN(prompt.length / 3.6)} tokens). Cole em qualquer chat de IA (inclusive planos gratuitos) e pergunte à vontade — ele traz resumos por mês e UF, corredores, categorias e eventos.<div class="act"><button data-dl="1">Baixar .md</button><button data-recopy="1">Copiar de novo</button></div>`);
  d.querySelector("[data-dl]").onclick = () => download("trecho-contexto.md", md);
  d.querySelector("[data-recopy]").onclick = () => copyText(prompt, "Contexto copiado");
}
const tsv = rows => rows.map(r => r.map(c => typeof c === "number" ? String(Math.round(c * 10000) / 10000).replace(".", ",") : String(c)).join("\t")).join("\n");

/* ---------- delegação de cliques dentro do painel ---------- */
panel.addEventListener("click", e => {
  const dc = e.target.closest("[data-call]"); if (dc) { try { const c = JSON.parse(dc.dataset.call); if (c && c.tool) askCall(c, labelOf(dc)); } catch (er) { } return; }
  const dq = e.target.closest("[data-q]"); if (dq) { ask(dq.dataset.q); return; }
  const ac = e.target.closest("[data-act]"); if (ac) { const [id, i] = ac.dataset.act.split(":"); const r = RES.get(+id); r && r.acts[+i].fn(); return; }
  const cp = e.target.closest("[data-copy]"); if (cp) { const r = RES.get(+cp.dataset.copy); r && copyText(`${r.tool}(${r.params.join(", ")})\n\n${r.text}`, "Resposta copiada"); return; }
  const ts = e.target.closest("[data-tsv]"); if (ts) { const r = RES.get(+ts.dataset.tsv); r && r.csv && copyText(tsv(r.csv), "Tabela copiada — cole no Excel/Sheets"); return; }
  if (e.target.closest("[data-clearctx]")) { CTX.last = null; ctxRefresh(); toast("Foco da conversa esquecido"); }
});
function labelOf(n) {
  if (n.matches(".pauta button")) return n.children[1].textContent;
  if (n.classList.contains("mz-find")) return n.querySelector("b").textContent;
  const ml = n.querySelector(".ml"), td = n.querySelector("td"), t = ml ? ml.childNodes[0] : td;
  return "Detalhar: " + ((t && t.textContent) || n.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
}
$("#mesaForm").addEventListener("submit", e => { e.preventDefault(); const v = input.value.trim(); if (v) { input.value = ""; ask(v); } });
input.addEventListener("keydown", e => {
  if (e.key === "ArrowUp" && hist.length) { e.preventDefault(); hi = Math.max(0, hi - 1); input.value = hist[hi] || ""; }
  else if (e.key === "ArrowDown" && hist.length) { e.preventDefault(); hi = Math.min(hist.length, hi + 1); input.value = hist[hi] || ""; }
});
sugEl.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.call) { askCall(JSON.parse(b.dataset.call), b.textContent); } else if (b.dataset.q) ask(b.dataset.q); });

/* ---------- cliques no painel: cards, KPIs, mapa ---------- */
const CARD_MAP = [
  [/pedidos por m[eê]s/i, () => CALL("serie", { metrics: ["pedidos"] })],
  [/taxa de atraso mensal|no prazo × atrasados/i, () => CALL("evento", {})],
  [/achados do per/i, () => CALL("resumo", {})],
  [/corredores cr[ií]ticos|todos os corredores/i, () => CALL("corredores", { by: "atrasos" })],
  [/atraso derruba a nota/i, () => CALL("nota_vs_atraso", {})],
  [/onde o tempo vai/i, () => CALL("etapas", {})],
  [/prometido × real por uf/i, () => CALL("ranking", { metrics: ["folga"], dim: "uf", dir: "asc" })],
  [/chegou antes ou depois|distribui[cç][aã]o antes/i, () => CALL("distribuicao", {})],
  [/tempo total de entrega/i, () => CALL("ranking", { metrics: ["prazo"], dim: "uf", dir: "desc" })],
  [/atraso por regi[aã]o/i, () => CALL("ranking", { metrics: ["atraso"], dim: "regiao", dir: "desc" })],
  [/valor movimentado|faturamento mensal/i, () => CALL("serie", { metrics: ["receita_frete"] })],
  [/como o cliente paga/i, () => CALL("pagamento", {})],
  [/ticket por regi[aã]o/i, () => CALL("ranking", { metrics: ["ticket"], dim: "regiao", dir: "desc" })],
  [/peso do frete/i, () => CALL("ranking", { metrics: ["frete"], dim: "uf", dir: "desc" })],
  [/categorias/i, () => CALL("categorias", { by: "receita" })],
  [/matriz origem/i, () => CALL("corredores", { by: "atrasos" })],
  [/dist[aâ]ncia × (prazo|tempo)/i, () => CALL("corredores", { by: "lentos" })],
  [/resultado projetado/i, () => { const g = id => +$("#" + id).value || 0; return CALL("simular", { sim: { trans: g("sTrans"), hand: g("sHand"), est: g("sEst"), sel: g("sSel") } }); }],
  [/malha de entregas/i, () => mapCall()],
];
const cardCall = title => { const m = CARD_MAP.find(([re]) => re.test(title)); return m ? m[1]() : null; };
const KPI_MAP = [
  [/^pedidos$/i, "pedidos"], [/^faturamento$/i, "faturamento"], [/receita de frete/i, "receita_frete"], [/custo de transporte/i, "custo_frete"], [/margem de frete/i, "margem_frete"], [/gmv transportado/i, "gmv"], [/prazo m[eé]dio|entrega real/i, "prazo"], [/entregas no prazo|^atrasados$/i, "atraso"], [/nota do cliente/i, "nota"],
  [/prazo prometido/i, "prometido"], [/folga/i, "folga"], [/quando atrasa/i, "dias_atraso"], [/frete cobrado/i, "frete"], [/ticket/i, "ticket"], [/parcelas/i, "parcelas"],
];
function kpiCall(lbl) {
  const t = lbl.replace(/<[^>]+>/g, "").trim();
  if (/corredores ativos/i.test(t)) return CALL("corredores", { by: "volume" });
  if (/saem de sp/i.test(t)) return CALL("corredores", { orig: "SP", by: "volume" });
  if (/entrega local/i.test(t)) return CALL("corredores", { by: "volume" });
  if (/dist[aâ]ncia m[eé]dia|corredor mais lento/i.test(t)) return CALL("corredores", { by: "lentos" });
  const k = KPI_MAP.find(([re]) => re.test(t)); return k ? CALL("explicar", { metrics: [k[1]] }) : null;
}
function mapCall() { const m = { volume: "pedidos", late: "atraso", days: "prazo", freight: "frete" }[S.metric] || "atraso"; return CALL("ranking", { metrics: [m], dim: "uf", dir: "desc" }); }
function cardAsk(title) { const c = cardCall(title); if (!c) return; open(); askCall(c, `✦ Analisar “${title.trim()}”`); }
document.addEventListener("click", e => {
  if (panel.contains(e.target)) return;
  const ma = e.target.closest("[data-mapask]"); if (ma) { open(); askCall(mapCall(), "✦ Analisar o mapa"); return; }
  const ab = e.target.closest(".ask-btn"); if (ab) { cardAsk(ab.dataset.title); return; }
  const k = e.target.closest(".kpi[data-kpi]"); if (k) { const c = kpiCall(k.dataset.kpi); if (c) { open(); askCall(c, `✦ Analisar “${k.dataset.kpi}”`); } return; }
  const ua = e.target.closest("[data-uask]"); if (ua) { open(); askCall(CALL("resumo", { ufs: [S.uf] }), `✦ Analisar ${D.geo[S.uf].nome}`); }
});
document.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".kpi[data-kpi]")) { e.preventDefault(); e.target.click(); } });
function decorate() {
  $$(".view.on .card-h").forEach(h => {
    if (h.querySelector(".ask-btn") || h.closest(".kpi")) return;
    const t = h.querySelector(".card-t"); if (!t || !cardCall(t.textContent)) return;
    const b = el("button", "ask-btn", `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2Z"/></svg>Analisar`);
    b.type = "button"; b.dataset.title = t.textContent; b.title = "Gerar análise deste gráfico na Mesa"; b.setAttribute("aria-label", "Analisar “" + t.textContent + "” na Mesa de análise"); h.appendChild(b);
  });
  const mc = $(".map-ctrl"); if (mc && !mc.querySelector("[data-mapask]")) { const b = el("button", "ask-btn map", `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2Z"/></svg>Analisar mapa`); b.type = "button"; b.dataset.mapask = "1"; b.title = "Gerar análise do mapa na Mesa"; mc.appendChild(b); }
}

return { open, close, ask, askCall, decorate, ctxRefresh, cardAsk, navigated, CTX };
})();
