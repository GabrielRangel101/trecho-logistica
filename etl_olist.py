"""
ETL: dataset público Olist (Kaggle: olistbr/brazilian-ecommerce) -> data.json do dashboard Trecho Logística.

Uso:
    python etl_olist.py caminho/da/pasta_com_os_csvs
    python build.py            # embute o data.json no index.html

Gera exatamente o mesmo schema de sim.py, então o front não muda.
Arquivos necessários na pasta: orders, customers, order_items, sellers, order_payments, order_reviews,
products e geolocation (olist_*_dataset.csv). O dataset NÃO tem transportadora nem "in full": OTIF e atraso
por parceiro de transporte não são calculáveis com ele.
"""
import json, sys
from pathlib import Path
import numpy as np
import pandas as pd
from geo import UFS, EVENTS
from datetime import date

WK, DK = 0.4, 0.5          # expoentes do custo: kg^WK x km^DK (mesmos de sim.py)

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
rd = lambda n: pd.read_csv(SRC / n)

orders = rd("olist_orders_dataset.csv")
cust = rd("olist_customers_dataset.csv")
items = rd("olist_order_items_dataset.csv")
sellers = rd("olist_sellers_dataset.csv")
pays = rd("olist_order_payments_dataset.csv")
revs = rd("olist_order_reviews_dataset.csv")
prods = rd("olist_products_dataset.csv")
geol = rd("olist_geolocation_dataset.csv")

# distância vendedor→cliente por pedido: haversine entre os centróides dos prefixos de CEP (geolocation Olist)
zp = geol.groupby("geolocation_zip_code_prefix")[["geolocation_lat", "geolocation_lng"]].mean()

for c in ["order_purchase_timestamp", "order_approved_at", "order_delivered_carrier_date",
          "order_delivered_customer_date", "order_estimated_delivery_date"]:
    orders[c] = pd.to_datetime(orders[c])

MONTHS = [f"2017-{m:02d}" for m in range(1, 13)] + [f"2018-{m:02d}" for m in range(1, 9)]
o = orders.merge(cust[["customer_id", "customer_state", "customer_zip_code_prefix"]], on="customer_id")
o["month"] = o["order_purchase_timestamp"].dt.strftime("%Y-%m")
o = o[o["month"].isin(MONTHS)].copy()

UF_ORDER = o["customer_state"].value_counts().index.tolist()
SELLERS = ["SP", "MG", "PR", "RJ", "SC", "RS", "DF", "BA", "GO", "PE", "ES", "Outros"]
CATMAP = {"cama_mesa_banho": 0, "beleza_saude": 1, "esporte_lazer": 2, "moveis_decoracao": 3,
          "informatica_acessorios": 4, "utilidades_domesticas": 5, "relogios_presentes": 6, "telefonia": 7,
          "ferramentas_jardim": 8, "automotivo": 9, "brinquedos": 10, "cool_stuff": 11}
CATS = ["Cama, mesa e banho", "Beleza e saúde", "Esporte e lazer", "Móveis e decoração", "Informática",
        "Utilidades domésticas", "Relógios e presentes", "Telefonia", "Ferramentas e jardim", "Automotivo",
        "Brinquedos", "Cool stuff", "Outras"]

# item principal (maior preço) define vendedor e categoria do pedido
# peso cobrado do item = max(peso real, peso cubado L*A*C/6000); itens sem dimensão usam a mediana do catálogo
pw = prods["product_weight_g"] / 1000
cub = prods["product_length_cm"] * prods["product_height_cm"] * prods["product_width_cm"] / 6000
prods["kg"] = np.fmax(pw, cub).fillna(np.fmax(pw, cub).median()).clip(lower=0.05, upper=80)
it = items.merge(sellers[["seller_id", "seller_state", "seller_zip_code_prefix"]], on="seller_id").merge(
    prods[["product_id", "product_category_name", "kg"]], on="product_id", how="left")
it["kg"] = it["kg"].fillna(prods["kg"].median())
agg = it.groupby("order_id").agg(gmv=("price", "sum"), freight=("freight_value", "sum"), kg=("kg", "sum")).reset_index()
main = it.sort_values("price", ascending=False).drop_duplicates("order_id")[
    ["order_id", "seller_id", "seller_state", "seller_zip_code_prefix", "product_category_name"]]
o = o.merge(agg, on="order_id", how="left").merge(main, on="order_id", how="left")
o[["gmv", "freight"]] = o[["gmv", "freight"]].fillna(0)
o["kg"] = o["kg"].fillna(prods["kg"].median())
o["s"] = o["seller_state"].map({s: i for i, s in enumerate(SELLERS)}).fillna(len(SELLERS) - 1).astype(int)
def _hav(la1, lo1, la2, lo2):
    R = np.pi / 180
    h = np.sin((la2 - la1) * R / 2) ** 2 + np.cos(la1 * R) * np.cos(la2 * R) * np.sin((lo2 - lo1) * R / 2) ** 2
    return 6371 * 2 * np.arcsin(np.sqrt(h))


sz = o["seller_zip_code_prefix"].map(zp["geolocation_lat"]), o["seller_zip_code_prefix"].map(zp["geolocation_lng"])
cz = o["customer_zip_code_prefix"].map(zp["geolocation_lat"]), o["customer_zip_code_prefix"].map(zp["geolocation_lng"])
o["km"] = _hav(sz[0], sz[1], cz[0], cz[1])
o["kw"] = (o["kg"] ** WK) * (o["km"].fillna(0) ** DK)
o["k"] = o["product_category_name"].map(CATMAP).fillna(12).astype(int)

p1 = pays.sort_values("payment_value", ascending=False).drop_duplicates("order_id")
o = o.merge(p1[["order_id", "payment_type", "payment_installments"]], on="order_id", how="left")
o["pay"] = o["payment_type"].map({"credit_card": 0, "boleto": 1, "voucher": 2, "debit_card": 3}).fillna(0).astype(int)
r = revs.groupby("order_id")["review_score"].mean().round().reset_index()
o = o.merge(r, on="order_id", how="left")

d = lambda a, b: (o[a] - o[b]).dt.total_seconds() / 86400
o["delivered"] = (o["order_status"] == "delivered") & o["order_delivered_customer_date"].notna()
o["days"] = d("order_delivered_customer_date", "order_purchase_timestamp").round()
o["est"] = d("order_estimated_delivery_date", "order_purchase_timestamp").round()
o["appr"] = d("order_approved_at", "order_purchase_timestamp").clip(lower=0).fillna(0)
o["hand"] = d("order_delivered_carrier_date", "order_approved_at").clip(lower=0).fillna(0)
o["trans"] = d("order_delivered_customer_date", "order_delivered_carrier_date").clip(lower=0.5)
o["diff"] = (o["order_delivered_customer_date"].dt.normalize() - o["order_estimated_delivery_date"].dt.normalize()).dt.days
o["late"] = o["delivered"] & (o["diff"] > 0)
o["mi"] = o["month"].map({m: i for i, m in enumerate(MONTHS)})
o["c"] = o["customer_state"].map({u: i for i, u in enumerate(UF_ORDER)})
WEEK0 = pd.Timestamp("2016-12-26")
o["wk"] = ((o["order_purchase_timestamp"].dt.normalize() - WEEK0).dt.days // 7).astype(int)
top_ids = o.groupby("seller_id").size().sort_values(ascending=False).head(80).index.tolist()
sid = {s_: i for i, s_ in enumerate(top_ids)}
sel_uf = sellers.set_index("seller_id")["seller_state"].to_dict()

F = ["orders", "delivered", "late", "sumDays", "sumEst", "sumAppr", "sumHand", "sumTrans", "gmv", "freight",
     "nRev", "sumRev", "rev1", "rev5", "notDelivered", "sumLateDays", "credit", "boleto", "voucher", "debit",
     "sumInst", "lateRev", "nLateRev", "ndRev", "nNdRev", "lateRev1", "sumKm", "sumKg", "sumKW"]
NM, NU = len(MONTHS), len(UF_ORDER)
cube = np.zeros((NM, NU, len(F)))
BINS = [0, 4, 7, 10, 13, 16, 21, 26, 31, 41, 61, 999]
hist = np.zeros((NM, NU, len(BINS) - 1), dtype=int)
DMIN, DMAX = -45, 30
diffh = np.zeros((NM, NU, DMAX - DMIN + 1), dtype=int)
revcurve = np.zeros((DMAX - DMIN + 1, 2))
corr, cat, selr, wkr = {}, {}, {}, {}

for row in o.itertuples(index=False):
    m, c = row.mi, row.c
    v = cube[m, c]
    hr = not np.isnan(row.review_score)
    v[0] += 1; v[8] += row.gmv; v[9] += row.freight; v[16 + row.pay] += 1
    if row.pay == 0: v[20] += row.payment_installments if not np.isnan(row.payment_installments) else 1
    if hr:
        v[10] += 1; v[11] += row.review_score; v[12] += row.review_score == 1; v[13] += row.review_score == 5
    if row.delivered and not np.isnan(row.days):
        v[1] += 1; v[3] += row.days; v[4] += row.est; v[5] += row.appr; v[6] += row.hand; v[7] += row.trans
        if not np.isnan(row.km): v[26] += row.km
        v[27] += row.kg; v[28] += row.kw
        if row.late:
            v[2] += 1; v[15] += row.diff
            if hr: v[21] += row.review_score; v[22] += 1; v[25] += row.review_score == 1
        hist[m, c, np.searchsorted(BINS, row.days, side="right") - 1] += 1
        di = int(min(max(row.diff, DMIN), DMAX)) - DMIN
        diffh[m, c, di] += 1
        if hr: revcurve[di] += [1, row.review_score]
        rr = corr.setdefault((m, row.s, c), [0] * 12)
        rr[0] += 1; rr[1] += row.late; rr[2] += row.days; rr[3] += row.est; rr[4] += row.freight
        if hr: rr[5] += row.review_score; rr[6] += 1
        rr[7] += row.trans; rr[8] += row.hand
        if not np.isnan(row.km): rr[9] += row.km
        rr[10] += row.kw; rr[11] += row.kg
    else:
        v[14] += 1
        if hr: v[23] += row.review_score; v[24] += 1
    wr = wkr.setdefault((int(row.wk), int(c)), [0, 0, 0]); wr[0] += 1
    if row.seller_id in sid:
        sr = selr.setdefault((int(m), sid[row.seller_id]), [0] * 6); sr[0] += 1
    if row.delivered and not np.isnan(row.days):
        wr[1] += 1; wr[2] += bool(row.late)
        if row.seller_id in sid:
            sr[1] += 1; sr[2] += bool(row.late); sr[3] += row.hand; sr[4] += row.trans; sr[5] += row.days
    rr = cat.setdefault((m, c, row.k), [0] * 4)
    rr[0] += 1; rr[1] += row.gmv; rr[2] += bool(row.late); rr[3] += bool(row.delivered)

dl = o[o["delivered"] & o["days"].notna()].sample(420, random_state=7)
samples = [[r.order_id[:6], SELLERS[r.s], r.customer_state, int(r.days), int(r.est), int(r.late),
            round(r.gmv + r.freight, 2), int(r.k), int(r.mi)] for r in dl.itertuples()]

geo = {k: {"nome": v[0], "regiao": v[1], "c": [v[2], v[3]], "cap": v[4], "cc": [v[5], v[6]]} for k, v in UFS.items()}
r1 = lambda a: [round(float(x), 1) for x in a]
data = {
    "meta": {"fonte": "Brazilian E-Commerce Public Dataset by Olist (Kaggle, CC BY-NC-SA 4.0)", "real": True,
             "ref": "Ago/18", "gerado": "etl_olist.py",
             "mes": "mês da compra", "km": "linha reta entre centróides de CEP (geolocation Olist)",
             "custo": {"wk": WK, "dk": DK}, "margemRef": 0.22},
    "months": MONTHS, "ufs": UF_ORDER, "fields": F,
    "cube": [[r1(cube[m, u]) for u in range(NU)] for m in range(NM)],
    "bins": BINS, "hist": hist.tolist(), "diffMin": DMIN, "diffMax": DMAX, "diffHist": diffh.tolist(),
    "revCurve": [[int(a), round(float(b), 1)] for a, b in revcurve], "sellers": SELLERS,
    "corr": [[int(m), int(s), int(c)] + r1(v) for (m, s, c), v in corr.items()], "cats": CATS,
    "cat": [[int(m), int(c), int(k)] + r1(v) for (m, c, k), v in cat.items()],
    "samples": samples, "events": EVENTS, "geo": geo,
    "sel": [[s_[:6], sel_uf.get(s_, "Outros")] for s_ in top_ids],
    "selr": [[m, k] + r1(v) for (m, k), v in selr.items()],
    "weeks": [str(date.fromordinal(date(2016, 12, 26).toordinal() + 7 * w)) for w in range(int(o["wk"].max()) + 1)],
    "wk": [[w, c] + [int(x) for x in v] for (w, c), v in wkr.items()],
}
json.dump(data, open("data.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("ok:", len(o), "pedidos |", int(o["late"].sum()), "atrasados")
