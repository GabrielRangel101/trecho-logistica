"""Gera CSVs falsos no schema EXATO do Olist (colunas e tipos) para testar etl_olist.py sem baixar o dataset.
Uso: python tests/make_fake_olist.py pasta_saida [n_pedidos]
Os valores são aleatórios: serve para validar o pipeline (colunas, joins, schema de saída), não para análise."""
import sys, uuid
from pathlib import Path
import numpy as np, pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from geo import UFS

out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
N = int(sys.argv[2]) if len(sys.argv) > 2 else 6000
rng = np.random.default_rng(1)
ufs = list(UFS)
w = np.array([40 if u == "SP" else 12 if u in ("RJ", "MG") else 3 for u in ufs], float); w /= w.sum()
uid = lambda: uuid.UUID(int=int(rng.integers(0, 2**62)) << 64 | int(rng.integers(0, 2**62))).hex

# geolocation: 40 prefixos de CEP por UF, perto do centróide
geo = []
zips = {}
for i, u in enumerate(ufs):
    lon, lat = UFS[u][5], UFS[u][6]
    zips[u] = [10000 + i * 1000 + j for j in range(40)]
    for z in zips[u]:
        geo.append([z, lat + rng.normal(0, .8), lon + rng.normal(0, .8), "cidade", u])
pd.DataFrame(geo, columns=["geolocation_zip_code_prefix", "geolocation_lat", "geolocation_lng", "geolocation_city", "geolocation_state"]).to_csv(out / "olist_geolocation_dataset.csv", index=False)

sel = pd.DataFrame({"seller_id": [uid() for _ in range(120)]})
sel["seller_state"] = rng.choice(["SP", "MG", "PR", "RJ", "SC", "RS"], 120, p=[.7, .08, .08, .06, .05, .03])
sel["seller_zip_code_prefix"] = [int(rng.choice(zips[u])) for u in sel["seller_state"]]
sel["seller_city"] = "cidade"; sel = sel[["seller_id", "seller_zip_code_prefix", "seller_city", "seller_state"]]; sel.to_csv(out / "olist_sellers_dataset.csv", index=False)

cats = ["cama_mesa_banho", "beleza_saude", "esporte_lazer", "moveis_decoracao", "informatica_acessorios", "utilidades_domesticas", "relogios_presentes", "telefonia", "ferramentas_jardim", "automotivo", "brinquedos", "cool_stuff", "papelaria"]
pr = pd.DataFrame({"product_id": [uid() for _ in range(300)], "product_category_name": rng.choice(cats, 300)})
pr["product_name_lenght"] = 40; pr["product_description_lenght"] = 300; pr["product_photos_qty"] = 1
pr["product_weight_g"] = rng.lognormal(7, 1, 300).round(); pr["product_length_cm"] = rng.integers(10, 60, 300); pr["product_height_cm"] = rng.integers(2, 40, 300); pr["product_width_cm"] = rng.integers(8, 50, 300)
pr.loc[rng.choice(300, 8), ["product_weight_g", "product_length_cm"]] = np.nan          # produtos sem dimensão (existem no dataset real)
pr.to_csv(out / "olist_products_dataset.csv", index=False)

cu = pd.DataFrame({"customer_id": [uid() for _ in range(N)], "customer_unique_id": [uid() for _ in range(N)]})
cu["customer_state"] = rng.choice(ufs, N, p=w); cu["customer_zip_code_prefix"] = [int(rng.choice(zips[u])) for u in cu["customer_state"]]
cu["customer_city"] = "cidade"; cu = cu[["customer_id", "customer_unique_id", "customer_zip_code_prefix", "customer_city", "customer_state"]]; cu.to_csv(out / "olist_customers_dataset.csv", index=False)

t0 = pd.Timestamp("2017-01-01") + pd.to_timedelta(rng.integers(0, 600, N) * 86400 + rng.integers(0, 86400, N), unit="s")
appr = t0 + pd.to_timedelta(rng.gamma(1, .5, N), unit="D"); car = appr + pd.to_timedelta(rng.gamma(2, 1.5, N), unit="D")
dlv = car + pd.to_timedelta(rng.gamma(3, 3, N) + 1, unit="D"); est = t0 + pd.to_timedelta(rng.integers(8, 40, N), unit="D")
st = rng.choice(["delivered", "shipped", "canceled"], N, p=[.96, .02, .02])
orders = pd.DataFrame({"order_id": [uid() for _ in range(N)], "customer_id": cu["customer_id"], "order_status": st,
                       "order_purchase_timestamp": t0, "order_approved_at": appr, "order_delivered_carrier_date": car,
                       "order_delivered_customer_date": np.where(st == "delivered", dlv, pd.NaT), "order_estimated_delivery_date": est})
orders.to_csv(out / "olist_orders_dataset.csv", index=False)

rows = []
for oid in orders["order_id"]:
    for k in range(1 + (rng.random() < .1)):
        rows.append([oid, k + 1, rng.choice(pr["product_id"]), rng.choice(sel["seller_id"]), "2018-01-01 00:00:00", round(float(rng.lognormal(4.3, .8)), 2), round(float(rng.lognormal(2.9, .4)), 2)])
pd.DataFrame(rows, columns=["order_id", "order_item_id", "product_id", "seller_id", "shipping_limit_date", "price", "freight_value"]).to_csv(out / "olist_order_items_dataset.csv", index=False)
pd.DataFrame({"order_id": orders["order_id"], "payment_sequential": 1, "payment_type": rng.choice(["credit_card", "boleto", "voucher", "debit_card"], N, p=[.74, .19, .05, .02]),
              "payment_installments": rng.integers(1, 10, N), "payment_value": 100.0}).to_csv(out / "olist_order_payments_dataset.csv", index=False)
pd.DataFrame({"review_id": [uid() for _ in range(N)], "order_id": orders["order_id"], "review_score": rng.choice([1, 2, 3, 4, 5], N, p=[.1, .04, .08, .2, .58]),
              "review_comment_title": "", "review_comment_message": "", "review_creation_date": "2018-01-01 00:00:00", "review_answer_timestamp": "2018-01-02 00:00:00"}).to_csv(out / "olist_order_reviews_dataset.csv", index=False)
print("ok:", N, "pedidos em", out)
