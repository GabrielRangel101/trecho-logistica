"""
Gera data.json no schema do dashboard Trecho Logística a partir de uma simulação calibrada
em estatísticas públicas do dataset Olist (Brazilian E-Commerce, Kaggle); os valores de referência são constantes escritas à mão neste arquivo, não extraídas do CSV.
Para usar os dados reais, rode etl_olist.py (mesmo schema de saída).
"""
import json, math, random
from datetime import date
import numpy as np
from geo import UFS, UF_AREA, EVENTS

rng = np.random.default_rng(42)
random.seed(42)

MONTHS = [f"2017-{m:02d}" for m in range(1, 13)] + [f"2018-{m:02d}" for m in range(1, 9)]
MONTH_ORDERS = [800, 1780, 2680, 2400, 3700, 3250, 4030, 4330, 4290, 4630, 7540, 5670,
                7270, 6730, 7210, 6940, 6870, 6170, 6290, 6510]
UF_ORDER = ["SP", "RJ", "MG", "RS", "PR", "SC", "BA", "DF", "ES", "GO", "PE", "CE", "PA", "MT",
            "MA", "MS", "PB", "PI", "RN", "AL", "SE", "TO", "RO", "AM", "AC", "AP", "RR"]
SHARE = [41.9, 12.9, 11.7, 5.5, 5.1, 3.7, 3.4, 2.2, 2.0, 2.0, 1.7, 1.3, 1.0, 0.9, 0.75, 0.72,
         0.54, 0.50, 0.49, 0.42, 0.35, 0.28, 0.25, 0.15, 0.08, 0.07, 0.05]
DAYS = dict(SP=8.3, RJ=14.8, MG=11.5, RS=14.8, PR=11.5, SC=14.5, BA=18.9, DF=12.5, ES=15.3, GO=15.0,
            PE=18.0, CE=20.8, PA=23.3, MT=17.6, MA=21.1, MS=15.2, PB=19.9, PI=19.0, RN=18.8, AL=24.0,
            SE=21.0, TO=17.2, RO=18.9, AM=26.0, AC=21.0, AP=26.7, RR=29.0)
LATE = dict(SP=.059, RJ=.135, MG=.056, RS=.071, PR=.050, SC=.098, BA=.140, DF=.071, ES=.122, GO=.082,
            PE=.108, CE=.153, PA=.124, MT=.068, MA=.197, MS=.115, PB=.111, PI=.160, RN=.109, AL=.239,
            SE=.169, TO=.128, RO=.029, AM=.041, AC=.037, AP=.045, RR=.122)
FREIGHT = dict(SP=15.1, RJ=20.9, MG=20.6, RS=21.7, PR=20.5, SC=21.5, BA=26.4, DF=21.0, ES=22.0, GO=22.8,
               PE=32.9, CE=32.7, PA=35.8, MT=28.2, MA=38.3, MS=23.4, PB=42.7, PI=39.1, RN=35.7, AL=35.8,
               SE=36.7, TO=37.2, RO=41.1, AM=33.2, AC=40.1, AP=34.0, RR=43.0)
PRICE = dict(SP=125, RJ=143, MG=140, RS=140, PR=139, SC=145, BA=152, DF=146, ES=140, GO=147, PE=160,
             CE=170, PA=180, MT=172, MA=150, MS=150, PB=195, PI=160, RN=155, AL=182, SE=155, TO=158,
             RO=166, AM=135, AC=175, AP=165, RR=150)
SELLERS = ["SP", "MG", "PR", "RJ", "SC", "RS", "DF", "BA", "GO", "PE", "ES", "Outros"]
SELLER_P = [.71, .08, .077, .043, .036, .02, .008, .006, .005, .004, .003, .008]
CATS = ["Cama, mesa e banho", "Beleza e saúde", "Esporte e lazer", "Móveis e decoração", "Informática",
        "Utilidades domésticas", "Relógios e presentes", "Telefonia", "Ferramentas e jardim", "Automotivo",
        "Brinquedos", "Cool stuff", "Outras"]
CAT_P = [9.5, 8.7, 7.7, 6.6, 6.6, 6.0, 5.6, 4.3, 3.5, 3.9, 3.8, 3.4, 30.3]
CAT_PRICE = [93, 130, 114, 87, 116, 90, 201, 71, 111, 139, 117, 167, 128]
CAT_FREIGHT = [1.05, .85, 1.0, 1.35, .95, 1.05, .8, .75, 1.15, 1.1, 1.0, 1.0, 1.0]
CAT_LATE = [1.05, .95, 1.0, 1.15, 1.0, 1.0, .9, .95, 1.05, 1.0, 1.0, .95, 1.0]
def hav(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    d = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(d))


CAP = {k: (v[5], v[6]) for k, v in UFS.items()}
CAP["Outros"] = (-47.0, -18.0)


def km_pair(su, cu):
    """distância média (linha reta) vendedor→cliente. Mesma UF: estimativa pela área (vendedores e clientes
    concentram-se perto da capital); outra UF: capital→capital."""
    if su == cu:
        return 0.30 * math.sqrt(UF_AREA[cu])
    return hav(CAP[su], CAP[cu])


KM = np.array([[km_pair(s_, u_) for u_ in UF_ORDER] for s_ in SELLERS])

# ---------- gerar pedidos ----------
rows = []
share = np.array(SHARE) / sum(SHARE)
for mi, n in enumerate(MONTH_ORDERS):
    # leve migração de demanda para fora de SP em 2018
    drift = np.array([1 - 0.04 * (mi / 19) if u == "SP" else 1 + 0.03 * (mi / 19) for u in UF_ORDER])
    p = share * drift; p /= p.sum()
    cu = rng.choice(len(UF_ORDER), n, p=p)
    su = rng.choice(len(SELLERS), n, p=SELLER_P)
    ca = rng.choice(len(CATS), n, p=np.array(CAT_P) / sum(CAT_P))
    for i in range(n):
        rows.append([mi, cu[i], su[i], ca[i]])
R = np.array(rows)
N = len(R)
mi_, cu_, su_, ca_ = R[:, 0], R[:, 1], R[:, 2], R[:, 3]

# dia da compra (índice em dias desde 01/01/2017)
D0 = date(2017, 1, 1)
di = lambda y, m, d: (date(y, m, d) - D0).days
mstart = np.array([di(int(mm[:4]), int(mm[5:]), 1) for mm in MONTHS])
mlen = np.array([(date(int(mm[:4]) + (int(mm[5:]) == 12), int(mm[5:]) % 12 + 1, 1) - date(int(mm[:4]), int(mm[5:]), 1)).days for mm in MONTHS])
t0 = mstart[mi_] + (rng.random(N) * mlen[mi_]).astype(int)
uev = rng.random((4, N))
reg_se = np.array([UFS[UF_ORDER[c]][1] in ("Sudeste", "Sul") for c in cu_])
BF0, BF1 = di(2017, 11, 18), di(2017, 11, 30)
CA0, CA1 = di(2018, 2, 9), di(2018, 2, 21)
MR0, MR1 = di(2018, 3, 1), di(2018, 3, 20)
GR0, GR1 = di(2018, 5, 21), di(2018, 5, 31)


def ev_extra(days_s):
    """dias extras por evento, separando backlog de postagem (hand) de atraso em trânsito (trans).
    Em trânsito = intervalo [compra+2, compra+dias] cruzando a janela do evento."""
    ship, arr = t0 + 2.0, t0 + days_s
    ov = lambda a, b: np.clip(np.minimum(arr, b) - np.maximum(ship, a), 0, None)
    h = np.zeros(N); t = np.zeros(N)
    h += ((t0 >= BF0) & (t0 <= BF1)) * (3.0 + 6.5 * uev[0])                                   # Black Friday
    tail = (t0 > BF1) & (t0 <= BF1 + 10); h += tail * 2.0 * uev[0] * (1 - (t0 - BF1) / 10)    # cauda em dezembro
    h += ((t0 >= MR0) & (t0 <= MR1)) * (4.0 + 9.0 * uev[2])                                  # ressaca de março
    t += (t0 >= di(2018, 2, 1)) * ov(CA0, CA1) * (0.40 + 0.45 * uev[1]) * np.where(reg_se, 1.3, 0.8)                    # carnaval + chuvas
    og = (t0 >= di(2018, 5, 1)) * ov(GR0, GR1); t += og * (0.28 + 0.32 * uev[3]) + (og > 0) * 1.5 * uev[3]              # greve
    return h, t

# fator de distância vendedor -> cliente, normalizado por UF de destino
dist = np.array([hav(CAP[SELLERS[s]], CAP[UF_ORDER[c]]) for s, c in zip(su_, cu_)])
km_ord = KM[su_, cu_] * rng.lognormal(0, 0.12, N)
intra = np.array([SELLERS[s] == UF_ORDER[c] for s, c in zip(su_, cu_)])
km_ord = np.where(intra, KM[su_, cu_] * rng.lognormal(0, 0.35, N), km_ord)
dsp = np.array([hav(CAP["SP"], CAP[UF_ORDER[c]]) for c in cu_])
dfac = ((dist + 350) / (dsp + 350)) ** 0.45
for u in range(len(UF_ORDER)):
    m = cu_ == u
    dfac[m] /= dfac[m].mean()

noise_d = rng.lognormal(0, 0.48, N); noise_d /= noise_d.mean()
noise_e = rng.lognormal(0, 0.16, N); noise_e /= noise_e.mean()
base_days = np.array([DAYS[UF_ORDER[c]] for c in cu_])
catlate = np.array([CAT_LATE[c] for c in ca_])
emul = {u: 1.9 for u in UF_ORDER}
add_h = np.zeros(N); add_t = np.zeros(N)

for it in range(16):
    raw = base_days * dfac * noise_d * catlate
    for u, uf in enumerate(UF_ORDER):
        m = cu_ == u
        raw[m] *= max(DAYS[uf] - (add_h[m] + add_t[m]).mean(), 2.0) / raw[m].mean()
    add_h, add_t = ev_extra(raw)
    days = np.clip(np.round(raw + add_h + add_t), 1, 140)
    est = np.array([emul[UF_ORDER[c]] for c in cu_]) * base_days * noise_e
    est = np.round(est)
    late = days > est
    for u, uf in enumerate(UF_ORDER):
        m = cu_ == u
        r = late[m].mean()
        emul[uf] *= (r / LATE[uf]) ** 0.35

print("late geral", late.mean().round(4), "dias", days.mean().round(2), "prometido", est.mean().round(2))

# status (não entregues)
st = rng.random(N)
status = np.full(N, "delivered", dtype=object)
status[st < 0.0063] = "canceled"
status[(st >= 0.0063) & (st < 0.0124)] = "unavailable"
status[(st >= 0.0124) & (st < 0.0235)] = "shipped"
status[(st >= 0.0235) & (st < 0.0295)] = "processing"
delivered = status == "delivered"

# etapas
pay_p = [.74, .19, .055, .015]
pay = rng.choice(4, N, p=pay_p)
appr = np.where(pay == 1, rng.gamma(2.0, 0.6, N), rng.gamma(0.6, 0.35, N))
hand = rng.gamma(1.6, 1.75, N) + add_h
hand = np.minimum(hand, days * 0.55)
appr = np.minimum(appr, days * 0.2)
trans = np.maximum(days - appr - hand, 0.5)
inst = np.where(pay == 0, rng.choice([1, 2, 3, 4, 5, 6, 8, 10], N, p=[.34, .13, .12, .1, .07, .06, .07, .11]), 1)

# valores
price_state = np.array([PRICE[UF_ORDER[c]] for c in cu_]) / 137
cat_price = np.array([CAT_PRICE[c] for c in ca_])
pn = rng.lognormal(0, 0.75, N); pn /= pn.mean()
price = np.round(cat_price * price_state * pn * 1.13, 2)
fnoise = rng.lognormal(0, 0.35, N)
fr = np.array([FREIGHT[UF_ORDER[c]] for c in cu_]) * np.array([CAT_FREIGHT[c] for c in ca_]) * fnoise
fr *= ((dist + 300) / (dsp + 300)) ** 0.3; fr *= 1.08
freight = np.round(fr * 1.0, 2)

# peso cobrado (kg): categoria x resíduo do frete (frete ~ kg^0,35), para frete e peso serem coerentes
CAT_KG = np.array([1.9, 0.9, 2.3, 7.5, 1.4, 2.8, 0.6, 0.5, 4.0, 3.6, 1.8, 1.2, 2.0])
kg = CAT_KG[ca_] * np.exp(0.9 * np.log(fnoise) / 0.35)
kg = np.clip(kg / (kg.mean() / 2.4), 0.05, 80)
WK, DK = 0.4, 0.5                                   # expoentes do custo: kg^WK x km^DK (tarifa concava em peso e distância)
kw = kg ** WK * km_ord ** DK

# reviews
diff = days - est  # >0 atrasado
rev = np.zeros(N, dtype=int)
u = rng.random(N)
for i in range(N):
    if not delivered[i]:
        probs = [.72, .1, .08, .04, .06]
    elif diff[i] > 0:
        L = diff[i]
        p1 = min(.75, .36 + .022 * L)
        rest = 1 - p1
        probs = [p1, rest * .16, rest * .22, rest * .22, rest * .40]
    else:
        early = -diff[i]
        b5 = min(.66, .55 + .006 * early)
        probs = [.055, .028, .08, .21, 0]
        probs[4] = b5; s = sum(probs); probs = [x / s for x in probs]
    c = np.cumsum(probs)
    rev[i] = int(np.searchsorted(c, u[i])) + 1
rev = np.minimum(rev, 5)
has_rev = rng.random(N) < 0.992

# ---------- vendedores (ids sintéticos): rótulos permutados dentro do bucket de UF, sem mexer nos agregados ----------
# vendedor lento recebe pedidos de postagem longa e mais atrasados (por construção: é simulação)
rng2 = np.random.default_rng(7)
seller_id = np.zeros(N, dtype=int); sel_uf = []; sel_slow = []
for b in range(len(SELLERS)):
    idx_b = np.where(su_ == b)[0]
    if not len(idx_b): continue
    ns = max(8, int(len(idx_b) / 55))
    zipf = 1 / np.arange(1, ns + 1) ** 0.9; zipf /= zipf.sum()
    slots = np.sort(rng2.choice(ns, len(idx_b), p=zipf))                       # vendedor de cada pedido (contagens ~ Zipf)
    slow = rng2.lognormal(0, 0.5, ns)
    order_slots = np.argsort(slow[slots] * np.exp(rng2.normal(0, 0.35, len(slots))), kind="stable")
    slots = slots[order_slots]                                                  # vendedores lentos ao final
    key = np.log(hand[idx_b] + 0.5) + 0.012 * np.clip(days[idx_b] - est[idx_b], -10, 25) + rng2.normal(0, 0.6, len(idx_b))
    seller_id[idx_b[np.argsort(key, kind="stable")]] = slots + len(sel_uf)
    sel_uf += [SELLERS[b]] * ns; sel_slow += list(slow)
sel_names = [format(int(x), "06x") for x in rng2.integers(0x100000, 0xffffff, len(sel_uf))]
wk_ = (t0 + 6) // 7                                                             # semana ISO (segunda a domingo), índice 0 = semana de 26/12/2016
NW = int(wk_.max()) + 1
WEEK0 = date(2016, 12, 26)

# ---------- agregação ----------
NU, NM = len(UF_ORDER), len(MONTHS)
F = ["orders", "delivered", "late", "sumDays", "sumEst", "sumAppr", "sumHand", "sumTrans", "gmv", "freight",
     "nRev", "sumRev", "rev1", "rev5", "notDelivered", "sumLateDays", "credit", "boleto", "voucher", "debit",
     "sumInst", "lateRev", "nLateRev", "ndRev", "nNdRev", "lateRev1", "sumKm", "sumKg", "sumKW"]
cube = np.zeros((NM, NU, len(F)))
BINS = [0, 4, 7, 10, 13, 16, 21, 26, 31, 41, 61, 999]
hist = np.zeros((NM, NU, len(BINS) - 1), dtype=int)
DMIN, DMAX = -45, 30
diffh = np.zeros((NM, NU, DMAX - DMIN + 1), dtype=int)
revcurve = np.zeros((DMAX - DMIN + 1, 2))
corr = {}
cat = {}
selr = {}; wkr = {}
for i in range(N):
    m, c, s, k = mi_[i], cu_[i], su_[i], ca_[i]
    v = cube[m, c]
    v[0] += 1
    v[8] += price[i]; v[9] += freight[i]
    v[16 + pay[i]] += 1
    if pay[i] == 0: v[20] += inst[i]
    if has_rev[i]:
        v[10] += 1; v[11] += rev[i]; v[12] += rev[i] == 1; v[13] += rev[i] == 5
    if delivered[i]:
        v[1] += 1; v[3] += days[i]; v[4] += est[i]; v[5] += appr[i]; v[6] += hand[i]; v[7] += trans[i]; v[26] += km_ord[i]; v[27] += kg[i]; v[28] += kw[i]
        lt = diff[i] > 0
        if lt:
            v[2] += 1; v[15] += diff[i]
            if has_rev[i]: v[21] += rev[i]; v[22] += 1; v[25] += rev[i] == 1
        hist[m, c, np.searchsorted(BINS, days[i], side="right") - 1] += 1
        di = int(min(max(diff[i], DMIN), DMAX)) - DMIN
        diffh[m, c, di] += 1
        if has_rev[i]: revcurve[di] += [1, rev[i]]
        key = (m, s, c)
        r = corr.setdefault(key, [0] * 12)
        r[0] += 1; r[1] += lt; r[2] += days[i]; r[3] += est[i]; r[4] += freight[i]
        r[7] += trans[i]; r[8] += hand[i]; r[9] += km_ord[i]; r[10] += kw[i]; r[11] += kg[i]
        if has_rev[i]: r[5] += rev[i]; r[6] += 1
    else:
        v[14] += 1
        if has_rev[i]: v[23] += rev[i]; v[24] += 1
    sr = selr.setdefault((int(m), int(seller_id[i])), [0, 0, 0, 0, 0, 0]); sr[0] += 1
    wr = wkr.setdefault((int(wk_[i]), int(c)), [0, 0, 0]); wr[0] += 1
    if delivered[i]:
        sr[1] += 1; sr[2] += diff[i] > 0; sr[3] += hand[i]; sr[4] += trans[i]; sr[5] += days[i]
        wr[1] += 1; wr[2] += diff[i] > 0
    kk = (m, c, k)
    r = cat.setdefault(kk, [0, 0, 0, 0])
    r[0] += 1; r[1] += price[i]; r[2] += (delivered[i] and diff[i] > 0); r[3] += delivered[i]

cube_out = [[[round(float(x), 1) for x in cube[m, u]] for u in range(NU)] for m in range(NM)]

# amostra para o feed "ao vivo"
idx = rng.choice(np.where(delivered)[0], 420, replace=False)
samples = []
for i in idx:
    samples.append([format(int(rng.integers(0, 16 ** 6)), "06x"), SELLERS[su_[i]], UF_ORDER[cu_[i]],
                    int(days[i]), int(est[i]), int(diff[i] > 0), round(float(price[i] + freight[i]), 2), int(ca_[i]),
                    int(mi_[i])])

tot_sel = {}
for (m, k), r in selr.items(): tot_sel[k] = tot_sel.get(k, 0) + r[0]
top_sel = sorted(tot_sel, key=tot_sel.get, reverse=True)[:80]
remap = {k: i for i, k in enumerate(top_sel)}
geo = {k: {"nome": v[0], "regiao": v[1], "c": [v[2], v[3]], "cap": v[4], "cc": [v[5], v[6]]} for k, v in UFS.items()}
data = {
    "meta": {
        "fonte": "Simulação calibrada em estatísticas públicas do Olist (valores de referência escritos à mão, não extraídos do dataset). Substitua com etl_olist.py.",
        "real": False, "ref": "Ago/18", "gerado": "sim.py",
        "mes": "mês da compra", "km": "linha reta capital→capital; mesma UF estimada pela área da UF",
        "custo": {"wk": WK, "dk": DK}, "margemRef": 0.22,
    },
    "months": MONTHS, "ufs": UF_ORDER, "fields": F, "cube": cube_out,
    "bins": BINS, "hist": hist.tolist(),
    "diffMin": DMIN, "diffMax": DMAX, "diffHist": diffh.tolist(),  # [mês][UF][dias vs prometido]
    "revCurve": [[int(a), round(float(b), 1)] for a, b in revcurve],
    "sellers": SELLERS,
    "corr": [[int(m), int(s), int(c)] + [round(float(x), 1) for x in r] for (m, s, c), r in corr.items()],
    "cats": CATS,
    "cat": [[int(m), int(c), int(k)] + [round(float(x), 1) for x in r] for (m, c, k), r in cat.items()],
    "samples": samples, "events": EVENTS, "geo": geo,
    "sel": [[sel_names[k], sel_uf[k]] for k in top_sel],                       # vendedores com maior volume
    "selr": [[m, remap[k]] + [round(float(x), 1) for x in r] for (m, k), r in selr.items() if k in remap],   # [mês, vendedor, pedidos, entregues, atrasados, sumHand, sumTrans, sumDays]
    "weeks": [str(date.fromordinal(WEEK0.toordinal() + 7 * w)) for w in range(NW)],
    "wk": [[w, c] + [int(x) for x in r] for (w, c), r in wkr.items()],       # [semana, UF destino, pedidos, entregues, atrasados] por semana da compra
}
with open("data.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
print("pedidos", N, "gmv", price.sum().round(), "frete", freight.sum().round(), "nota", rev[has_rev].mean().round(2))
print("nota no prazo", rev[has_rev & delivered & (diff <= 0)].mean().round(2), "atrasado", rev[has_rev & delivered & (diff > 0)].mean().round(2))
for u, uf in enumerate(UF_ORDER[:8]):
    m = (cu_ == u) & delivered
    print(uf, days[m].mean().round(1), est[m].mean().round(1), (diff[m] > 0).mean().round(3))
for k in range(NM):
    m = (mi_ == k) & delivered
    print(MONTHS[k], (diff[m] > 0).mean().round(3), end=" | ")
