# Trecho Logística · Inteligência de Entregas e Receita de Frete

Dashboard de logística e frete de e-commerce, em HTML único (sem frameworks nem bibliotecas de gráfico), por **Gabriel Rangel** · [LinkedIn](https://www.linkedin.com/in/gabriel-rangel-a954ba26a/) · [GitHub](https://github.com/GabrielRangel101)

> **Os dados do `index.html` entregue são uma simulação** (`sim.py`, calibrada em estatísticas públicas do Olist (valores de referência escritos à mão em `sim.py`, não extraídos do dataset); o painel mostra o selo "Dados simulados"). Cada achado (greve, Black Friday, vendedores lentos, Nordeste) é propriedade do gerador, não do mundo: os números mudam se o `sim.py` mudar. Os números reais só aparecem depois de rodar `etl_olist.py` com o dataset. O custo é um **modelo com premissas explícitas**, não dado contábil.

## O que é simulado, o que é modelo e o que é medido
| Camada | O que é | Onde aparece | Vira dado real quando |
|---|---|---|---|
| **Simulado** | Pedidos, datas, prazos, frete, peso, notas, vendedores e os eventos (greve, Black Friday, chuvas) saem de `sim.py`, calibrado nas distribuições do Olist | Todos os números do `index.html` entregue; selo "Dados simulados" no cabeçalho | Você roda `etl_olist.py` com o dataset e reconstrói (`python build.py`) |
| **Modelo** | Custo de transporte (R$ 7 fixo + parcela por kg e km, `b` calibrado para margem nacional de 22%), prêmio de expresso, custo do atraso, queda de conversão, distância rodoviária (× 1,3), piso físico de prazo | Cards de custo, margem, corredores e Simulador; rotulados "modelo" ou "premissa" | Você troca as premissas pelos valores do contrato/tabela da transportadora |
| **Medido** (só com dados reais) | Taxa de atraso, prazo, folga, nota, frete cobrado, volume, distribuição de dias vs. prometido, postagem por vendedor, volume × atraso por semana | Idem, mas com valor de verdade apenas depois do ETL | Dataset Olist; com os CSVs reais o painel mede, não simula |

## Como ler os achados (e o que não afirmar)
- **Vendedores (postagem × atraso, r ≈ 0,80) e capacidade (volume × atraso, r ≈ 0,02) são circulares na versão simulada:** o gerador os constrói. Servem para mostrar a análise funcionando; com o Olist real, os mesmos cards passam a ser descoberta (ou não).
- **A margem nacional de 22% é entrada, não resultado.** O `b` do custo é calibrado para ela. O que o modelo diz é a *diferença* entre corredores dado esse formato de custo, e isso também depende da premissa. Margem por UF não é achado.
- **A triagem do simulador olha o resultado final** para escolher os "mais atrasados" e usa o acerto (padrão 70%) para compensar. Em operação o risco só é conhecido em trânsito, então 100% é um teto otimista.
- **Efeitos de evento (greve etc.)** na versão simulada são propriedade do gerador; só valem como afirmação sobre o mundo depois do ETL real.

## Views
| Rota | Conteúdo |
|---|---|
| `#geral` | KPIs, mapa ao vivo, pedidos por mês com eventos, **atraso estrutural × evento**, achados automáticos, corredores críticos, nota × atraso |
| `#prazo` | Lead time por etapa, prometido × real por UF, folga/atraso, histograma de entrega, atraso por região e por mês, **volume × atraso por semana** (capacidade) e **vendedores** (postagem por `seller_id`) |
| `#receita` | Receita de frete, custo e margem **modelados** (por peso e distância), GMV movimentado, mix de pagamento, ticket, peso do frete, categorias |
| `#rotas` | Matriz origem × destino (mínimo 100 pedidos), distância × tempo de **transporte** com piso físico, corredores com intervalo de confiança, custo e margem |
| `#simulador` | "Vale a pena?": ganho por corredor com piso físico, custo, benefício, custo por atraso evitado e SLA por região |

## Premissas (editáveis no topo de `app.js` e nos sliders do simulador)
| Premissa | Valor | Motivo |
|---|---|---|
| `SLA_META` | 95% por região | Marketplaces miram ≥95%; meta única nacional não orienta |
| `CIRC` | 1,3 | Fator linha reta → distância rodoviária |
| `FLOOR` | transporte ≥ 1 d + km/450; postagem ≥ 1 d | Ninguém entrega abaixo do limite físico |
| Custo de transporte | R$ 7,00 fixo + b · kg^0,4 · km_rod^0,5 por pedido | Tarifa côncava em peso e distância (tabela de zonas). `b` é **calibrado** para margem nacional de 22% sobre o frete cobrado; margem por UF/corredor é consequência dessa forma, não medição. Sem tabela real da transportadora, compare corredores entre si, não leia como valor |
| Peso | `product_weight_g` e cubagem (L×A×C/6000), o maior dos dois, somado por pedido | Peso cobrado |
| Expresso | +6%/dia ganho no custo (+25% a cada dia), R$ 1,50/pedido/dia na postagem | Acelerar custa mais que proporcionalmente; **só os pedidos selecionados pagam** |
| Custo do atraso | R$ 20/pedido (slider) | Reenvio, suporte, nota ruim; dependente do negócio |
| Conversão | −1,5% de pedidos por dia a mais de promessa (até 40%) × R$ 18 por pedido perdido (sliders) | A folga na promessa não é de graça |
| `MIN_N` | 100 pedidos | Abaixo disso a taxa não é colorida nem ranqueada; IC de Wilson 95% nas tabelas |

## Simulador
- Reduz o **tempo de transporte por corredor** até o piso físico do corredor; postagem tem piso próprio. Sliders são *pedidos* de ganho; o *realizado* sai menor onde o piso corta.
- **Aceleração seletiva:** só uma fração dos pedidos (slider, padrão 20%) recebe expresso/postagem acelerada. A triagem escolhe os mais atrasados com um acerto configurável (padrão 70%; o resto é sorteado). Acerto 100% é um teto otimista, porque o risco só é conhecido em trânsito.
- **Custo da promessa:** "folga extra" não custa operação, mas custa conversão (premissa acima), e esse custo entra no resultado.
- Base: **operação normal** (meses sem evento), **período inteiro** ou **só eventos**. Escopo: todos os corredores ou **só os críticos**.
- Saída: atraso projetado, evitados, custo operacional, custo da promessa, **custo por atraso evitado** (= custo de atraso de equilíbrio), benefício, líquido e SLA por região. O botão **"Achar o melhor cenário"** varre a grade (ganho × % de pedidos) e diz se algo se paga. Na simulação entregue, o melhor cenário só empata (custo mínimo ≈ R$ 19 por atraso evitado contra R$ 20 de atraso): acelerar só compensa se um atraso custar mais que isso.

## Atraso estrutural × evento
O mês é o **mês da compra**, não da entrega. Um evento (greve, chuvas, Black Friday) afeta pedidos em trânsito, então o efeito aparece no mês das compras que cruzaram a janela do evento (a janela é mostrada no marcador). Atraso estrutural = taxa nos meses sem evento; excesso = atrasos do mês de evento acima do estrutural. Se o excesso não for positivo, a Mesa informa que o evento não aparece nos dados.

## Distâncias
Vêm dos dados (`sumKm`), × `CIRC`. No `sim.py`, entre estados usa o centróide das UFs e, dentro do estado, uma estimativa por área. No `etl_olist.py`, usa `olist_geolocation_dataset.csv` (centróides por prefixo de CEP). A regressão distância × prazo usa **tempo de transporte**, sem a postagem do vendedor, e o gráfico mostra o piso físico.

## Mesa de análise (`Ctrl/⌘ K`)
Consultas em português sobre os dados do painel, 100% no navegador, sem API e sem custo. **Não é um servidor MCP**: é um interpretador de intenção por regras que chama **ferramentas tipadas** (funções com argumentos validados), e cada resposta mostra a chamada usada, por exemplo `ranking(metrica=atraso escopo=Brasil periodo=jan/17–ago/18)`. As ferramentas já têm assinatura estável, então expô-las num servidor MCP real é uma camada fina por cima (não incluída).

- **Ferramentas:** `consultar`, `ranking`, `serie`, `comparar`, `explicar`, `corredores`, `categorias`, `pagamento`, `etapas`, `distribuicao`, `nota_vs_atraso`, `anomalias`, `evento`, `simular`, `catalogo`, `exportar`.
- **Métricas de receita/custo:** `gmv`, `receita_frete`, `custo_frete`, `margem_frete` (as duas últimas são modelo). "Faturamento" virou "Valor movimentado (GMV + frete)", porque não é receita da transportadora.
- **Rigor:** compara com período anterior de mesmo tamanho, sinaliza variação estatisticamente ruidosa (teste z), não afirma causalidade, exige 100 pedidos para ranquear.
- **Copiar contexto:** resumo em markdown (inclui as premissas) para colar em qualquer chat de IA.
- **Gancho opcional de LLM:** `window.TRECHO_ASK = async (pergunta, contextoMarkdown) => "texto"` (n8n webhook, Claude API, Ollama).

Filtros globais ficam na URL: `?de=2017-11&ate=2017-11&uf=BA#rotas`.

## Dados
Dataset público **Brazilian E-Commerce by Olist** (Kaggle, CC BY-NC-SA 4.0). A licença citada (uso não comercial, atribuição, compartilhamento pela mesma licença) vem do próprio código e **não foi conferida na página do Kaggle**; confira antes de usar dados reais em material comercial. A versão simulada não republica nenhuma linha do dataset.

```bash
# 1) baixe e descompacte o dataset em uma pasta (inclui olist_geolocation_dataset.csv)
python etl_olist.py caminho/para/os_csvs   # gera data.json (dados reais)
python build.py                            # embute tudo em index.html
# sem o dataset: python sim.py && python build.py
```

Schema do `data.json`: cubo `[mês][UF][29 campos]` (inclui `sumKm`, `sumKg`, `sumKW` = Σ kg^wk·km^dk), `corr` com 15 colunas por corredor, `diffHist[mês][UF][bin −45..30]`, `revCurve`, `cat`, `events` (com `janela`), `sel`/`selr` (80 maiores vendedores por mês: pedidos, entregues, atrasados, postagem, transporte, dias), `weeks`/`wk` (semana da compra × UF destino: pedidos, entregues, atrasados) e `meta.custo`.

**Teste do ETL sem o dataset:** `python tests/make_fake_olist.py /tmp/csv 6000` gera CSVs aleatórios no schema exato do Olist; `etl_olist.py` roda sobre eles e o painel abre com a saída. Isso valida colunas, joins e schema, **não** os números reais: a primeira rodada com o dataset do Kaggle deve ser conferida (achados de greve, Black Friday e Nordeste podem não se sustentar).

**Fora do escopo do dataset:** o Olist não tem transportadora nem "in full". OTIF e atraso por parceiro de transporte não são calculáveis com ele; exigem dado do TMS/ERP.

## Publicar
1. Gere o HTML com a URL pública para as tags de compartilhamento: `python build.py --url https://trecho-logistica.vercel.app/` (o `index.html` entregue já foi gerado com essa URL; se mudar o endereço, refaça o build). `og:image` e `og:url` precisam ser absolutos, senão o LinkedIn não mostra a imagem.
2. Suba para um repositório **todos** os arquivos (`index.html`, `og.png`, `sim.py`, `etl_olist.py`, `geo.py`, `build.py`, `template.html`, `app.js`, `mesa_*.js`, `data.json`, `tests/`, `README.md`). O selo e a Mesa mandam rodar `etl_olist.py`; ele precisa estar no repositório.
3. Importe o repositório na Vercel (projeto sem build; pasta raiz) e use o domínio `trecho-logistica.vercel.app`. Depois de publicar, use o LinkedIn Post Inspector para limpar o cache da prévia.

## Arquivos
- `template.html`: layout e CSS · `app.js`: lógica, gráficos SVG, mapa em canvas, simulador
- `mesa_core.js`, `mesa_tools.js`, `mesa_ui.js`: Mesa de análise, injetada por `build.py`
- `geo.py`: contorno do Brasil, centróides, áreas e eventos · `sim.py`: base simulada · `etl_olist.py`: ETL real · `build.py`: gera `index.html` (`--url` para o link público) · `og.png`: imagem de compartilhamento · `tests/make_fake_olist.py`: CSVs falsos para testar o ETL
