# MAGNATE — DESIGN DOC (contrato del engine)

Simulador económico profundo, un solo archivo HTML al final. Este documento es
el contrato que implementa `engine.js`. El engine es JS puro, sin DOM, sin
timers, 100% serializable. La UI solo lee `state` y llama `applyAction`.

Convención de tiempo: **1 tick = 1 semana**, `TICKS_PER_YEAR = 52`.

---

## 1. VARIABLES DE ESTADO (objeto plano serializable)

```
state = {
  seed:int, rng:int,                 // PRNG LCG seedeado (state.rng = estado interno)
  tick:int, gameOver:false, won:false, bankrupt:false,
  stage:int,                          // 0..6 (ETAPA, derivada de netWorth)
  player: {
    cash, creditScore,                // creditScore 300..850, arranca 580
    scoreFactors: { payment, util, age, mix, inquiries },  // cada uno 0..1
    inquiries: [],                    // ticks en que pidió crédito (para recentInquiries)
    loans: [],                        // ver §4
    studentLoanId,                    // id del préstamo estudiantil inicial
    stocks: {},                       // ticker -> sharesOwned
    taxCarryForward, quarterProfitAccum, lastTaxTick,
    insolventStreak,                  // ticks consecutivos insolvente
    netWorth, realNetWorth,           // realNetWorth = netWorth / inflationIndex
  },
  companies: [],                      // ver §6
  products: {},                       // catálogo (estático) productId -> def
  markets: {},                        // productId -> { referencePrice, baseDemand, lastClearingPrice, lastTotalDemand }
  regions: [],                        // ver §9
  competitors: [],                    // empresas IA, ver §7
  stocks: {},                         // ticker -> stock (§8)
  realEstate: [],                     // propiedades del jugador (§9)
  macro: { inflationIndex, annualInflation, interestRate, cyclePhase, cycleLen, cycleAmp, stockIndex, reIndex },
  tech: { unlocked:[], projects:[] }, // I+D global del jugador (§10)
  event: { active:null, cooldown:int },  // evento pendiente (§11)
  milestones: {},                     // hitos logrados
  history: [],                        // serie temporal { tick, cash, netWorth, score, infl, rate }
  log: [],                            // mensajes recientes para la UI
}
```

Regla dura: `JSON.parse(JSON.stringify(state))` no pierde nada. Nada de
funciones, clases, Map/Set, ni NaN/Infinity en el state.

---

## 2. PRNG SEEDEABLE (obligatorio)

LCG: `s = (s*1664525 + 1013904223) >>> 0; return s/2^32`. El estado vive en
`state.rng`. Helper `rngNext(state)` muta `state.rng` y devuelve [0,1). Todo lo
aleatorio (eventos, ruido de mercado, IA, fluctuaciones) sale de acá →
reproducible por seed.

---

## 3. ORDEN DE TICK (FIJO — no se reordena)

`tick(state)` ejecuta, en este orden exacto:

1. **Macro**: avanzar ciclo, inflación, tasa de interés, índices. (Se hace
   primero para que demanda y finanzas usen el macro del tick actual.)
2. **Demanda**: por cada mercado, calcular atractividad de cada oferente
   (jugador + competidores), shares, demanda total con elasticidad, demanda por
   oferente.
3. **Ventas**: resolver ventas contra inventario; demanda no satisfecha se
   pierde (no hay backlog). Registrar ingresos.
4. **Producción y costos**: descontar costos de producción/operación, holding,
   salarios, marketing, I+D, mantenimiento; restock hasta target.
5. **IA de competidores**: observan el mercado ya resuelto y ajustan precio /
   capacidad / inversión de a pasos chicos (suavizado). Entrada/salida.
6. **Finanzas**: interés sobre deuda y sobre cash, dividendos cobrados, cuotas
   de préstamos (amortización), impuestos trimestrales, hipotecas, alquileres.
7. **I+D**: aplicar puntos de investigación a proyectos, completar nodos.
8. **Mercados de capital**: recalcular fundamentales y precios de acciones,
   índice bursátil; valores inmobiliarios y ocupación.
9. **Crédito**: recalcular targetScore y mover creditScore un paso (suavizado).
10. **Eventos**: con probabilidad seedeada, generar evento (pausa lógica:
    `state.event.active`). No se generan eventos mientras hay uno activo.
11. **Cierre**: recalcular netWorth/realNetWorth, etapa, hitos, chequear
    bancarrota/victoria, push a history.

Documentado y fijo. Reordenar cambia el balance en silencio.

---

## 4. FÓRMULAS NÚCLEO

### Demanda y elasticidad (por mercado)
Atractividad de oferente i: `A_i = (quality_i^a · brand_i^c · mkt_i) / price_i^b`
con `a=1.0, b=1.2, c=0.5`. (`mkt_i` = multiplicador de marketing.)
`share_i = A_i / Σ A_j`.
Índice de precio del mercado = `Σ share_i·price_i` (promedio ponderado).
`totalDemand = baseDemand · (indexPrice/refPrice)^(-elasticity) · avgQualMult ·
avgMktMult · macroMult`, clamp ≥ 0 y finito.
`demand_i = totalDemand · share_i`. Sin circularidad: A_i depende solo de
variables conocidas al inicio del tick.

Elasticidades por categoría: staples 0.4–0.7, retail 0.9–1.2, tech 1.3–1.8,
lujo 1.6–2.2.

### Marketing (rendimientos decrecientes)
`mktEffect = MAX_MKT · spend/(spend + HALF_SAT)`; `mktMult = 1 + mktEffect`.
`brandStrength += mktEffect·0.02 − brandDecay`; clamp [0,1]. Duplicar gasto
nunca duplica efecto.

### Calidad
`qualMult = 1 + QUAL_W·(qualityLevel/qualityCeiling)`. Subir calidad cuesta
insumos más caros + sube costo variable. qualityCeiling sube con I+D.

### Producción y costos
`unitsProduced = min(target, capacidad, insumosDisp, cashLimit)`.
`scaleFactor = clamp(1 − 5e-7·units, 0.75, 1.0)` (cap 25%).
`varCostEff = (baseVarCost + inputCost)·scaleFactor·inflationIndex·(1−effTech)`.
`totalCost = fixedCost·inflationIndex + varCostEff·units`.
`inputCost` = Σ insumos qty·precioMayorista; si integrado verticalmente, ×0.7.

### Inventario
`holdingCost = inventory · unitStorageCost · inflationIndex`. Restock hasta
target con lead time 2 ticks. Demanda no satisfecha por falta de stock se pierde.

### RRHH
`capacidadEfectiva = Σcapacity · (0.5 + 0.5·avgSkill) · (0.6 + 0.4·morale)`.
Salario < mercado → morale baja → productividad baja y rotación (pierde skill).

---

## 5. SISTEMA FINANCIERO Y SCORE CREDITICIO (el más sensible)

### Score (media móvil lenta, NUNCA salta)
`creditScore += (targetScore − creditScore)·SMOOTHING` con `SMOOTHING=0.04`.
Clamp [300,850], redondeado.
`targetScore = 300 + 550·(0.35·payment + 0.30·util + 0.15·age + 0.10·mix +
0.10·inquiries)`. Cada factor ∈ [0,1].

- `payment`: arranca 0.6. Pago puntual: `+0.012` (cap 1). Atraso: escalonado
  `−(0.05 + 0.02·missedConsecutivos)` acotado a `−0.12` por tick. UN atraso baja
  pocos puntos/semana, no destruye; pagar al día recupera. (Garantiza: una mala
  decisión nunca tira >15 pts de una; el suavizado 0.04 lo asegura.)
- `util` = `1 − deudaUsada/limiteCredito` (clamp 0..1). <30% uso ≈ óptimo.
- `age` = `clamp(tick/260, 0, 1)` (cap a 1 tras ~5 años).
- `mix` = variedad de tipos de crédito sanos (0.2 base + 0.2 por tipo distinto
  al día, cap 1).
- `inquiries` = `1 − 0.15·#consultas_ult_12_semanas` (clamp 0..1), se recupera
  sola al envejecer las consultas.

### Préstamos
```
loan = { id, principal, balance, annualRate, termTicks, ageTicks,
         paymentPerTick, missed, type }
```
`creditLimit = BASE_LIMIT + max(0,netWorth)·0.5 + scoreBonus(score)`.
No se permite préstamo que exceda el límite disponible.
`loanRate = macro.interestRate + riskPremium(score) + typeSpread(type)`, con
`riskPremium` ≈ 0.01 (score 800) … 0.18 (score 400). **Garantía no-arbitraje:
`loanRate > cashYield` siempre** (cashYield=0.01, riskPremium mínimo 0.01,
typeSpread≥0, interestRate≥0 ⇒ loanRate ≥ 0.02 > 0.01). Test lo verifica para
todo score.
`paymentPerTick = principal·r/(1−(1+r)^(−term))`, `r=annualRate/52`.
`interestPerTick = balance·r`.

Cada tick (paso 6): si cash ≥ cuota → pagar (baja balance, missed=0, payment
factor sube); si no → missed++, interés se capitaliza, payment factor baja
escalonado.
`cashInterest = max(cash,0)·cashYield/52`.

### Deuda estudiantil
Préstamo especial: principal ~45.000, 5% anual, plazo 260 ticks (5 años), cuota
desde tick 0. Refinanciable si mejora el score.

### Bancarrota (única derrota)
`insolvente = netWorth < −INSOLVENCY_THRESHOLD  &&  cash < 0`.
Si `insolvente` se mantiene **6 ticks consecutivos** → `bankrupt=true,
gameOver=true`. Antes, alertas en la UI. Nunca instantáneo.

### Impuestos
Cada 13 ticks (trimestre): `tax = max(0, quarterProfit − carryForward)·0.25`.
Pérdidas → carry-forward simple. Sumidero importante.

---

## 6. EMPRESAS (gestión operativa)

```
company = { id, name, industry, region, productId,
  price, qualityLevel, qualityCeiling, inventory, productionTarget,
  factories:[{tier,capacity,condition,fixedCostPerTick}],
  marketingBudget, rndBudget, brandStrength,
  employees:{count, avgSkill, avgWage, morale},
  vertical: bool,                 // produce sus insumos (×0.7 inputCost)
  cashContribution, lastUnitsSold, lastRevenue, marketShare,
  profitHistory:[], public:false, ticker:null, floatPct:0,
}
```
Valuación: `companyValue = max(activos,
gananciaAnualPromedio·earningsMultiple + activos + brand·brandValueFactor)`.
`earningsMultiple` por industria (tech>retail) × factor macro. Empresa que
pierde sostenido vale solo activos liquidables. Una empresa sola da ganancia
estable pero NO explosiva (sin loops): el crecimiento viene de diversificar y
reinvertir.

Sinergias multi-empresa capeadas: marca fuerte en un rubro → pequeño bonus al
entrar en rubros vecinos; logística propia abarata distribución; integración
vertical entre empresas propias. Todo capeado.

---

## 7. COMPETIDORES IA (reactivos, suavizados)

Cada competidor tiene empresas con mismos atributos. Cada tick (paso 5, tras
resolver ventas) ajustan de a pasos chicos (1–2% precio/tick), nunca saltan:
- `share<target` → bajar precio; `margin<min` → subir precio; clamp a [floor,ceil].
- Expandir capacidad si demanda > producción sostenido.
- Invertir calidad/marketing/I+D si pierde share (según perfil).
- Recortar/cerrar si pierde plata varios ticks; **límite de dolor** → se retira
  de una guerra de precios.
Perfiles: `aggressive` (undercut, márgenes finos), `premium` (precio/calidad
altos), `efficient` (costos bajos), `expansionist` (reinvierte y entra a más
mercados).
Entrada: nuevos competidores aparecen en mercados rentables y poco saturados.
Salida: los que se funden desaparecen y liberan share. Ningún competidor acumula
cash infinito ni quiebra en cadena por bug.

Empresas reales comprables: cada competidor tiene `companyValue` visible.
Adquisición amistosa: oferta ≥ valor + prima control (25%). Vía bolsa (hostil):
acumular acciones hasta >50%, con impacto de mercado que encarece.

---

## 8. MERCADO DE VALORES

```
stock = { ticker, companyId, sharesOutstanding, price, sharesOwnedByPlayer,
          dividendPerShareYear, beta, eps, bookValuePerShare }
```
`fundamental = eps·peMultiple + bookValuePerShare·assetWeight`.
`price += (fundamental − price)·0.1; price *= (1 + noise±1.5%); price = max(.01)`.
Sigue fundamentales, no es ruleta.
`dividendYear = annualEarnings·payoutRatio/sharesOutstanding`; cobro/tick =
`Σ shares·divYear/52`. **Yield dividendos < retorno de operar bien y <
loanRate** (no-arbitraje).
Impacto de mercado: `priceImpact = k·orderSize/sharesOutstanding`; comprar
empuja arriba, vender abajo (solo el 25% del impacto queda permanente — el resto
es temporal, así no se infla netWorth comprando lo propio). Comisión 0.5%.
Comprar y vender la misma acción en el mismo tick pierde (comisión+slippage).

FUSIONES (acción `mergeCompanies`): combinás dos empresas PROPIAS del MISMO
producto, ambas PRIVADAS (restricción de seguridad: el modelo es un producto por
empresa y evita acciones públicas huérfanas). Se suman capacidad, dotación,
inventario y presupuestos; sinergia de marca capeada (+0.05); costo de
integración temporal (`_integrationTicks=6` → −30% de productividad efectiva unas
semanas). El track record se revalúa desde cero. Cada empresa guarda
`shareHistory[]` para el gráfico de cuota de mercado en el tiempo.

SHORT-SELLING (`player.shorts[]`): vendés acciones prestadas (recibís proceeds,
creás un pasivo = shares·precio en netWorth → no imprime patrimonio al abrir).
Margen inicial 50%. Fee de préstamo `SHORT_BORROW=6%/año` por tick. **Margin
call**: si el precio sube ≥60% sobre la entrada, liquidación forzada (recompra a
mercado). Ganás si baja; pérdida potencialmente ilimitada si sube.
IPO: flotar 20–49% de empresa propia → recauda `floatPct·companyValue·(1−fees)`;
cede ese % de dividendos/control. Repetir IPO/recompra no imprime dinero.
Índice bursátil = promedio ponderado; sube en boom, baja en recesión (beta).

---

## 9. REGIONES, INMOBILIARIA, LOGÍSTICA

```
region = { id, name, population, wealthIndex, wageLevel, landPrice,
           demandMod:{industry->mult}, saturation, taxRate }
property = { id, region, type, purchasePrice, currentValue, rentPerTick,
             occupancy, maintenancePerTick, mortgageLoanId, developmentLevel }
```
Cada fábrica tiene su propia `region`. El costo unitario de la empresa usa el
perfil geográfico ponderado por capacidad: producir en regiones de salario bajo
abarata el costo variable `(0.85 + 0.15·avgWageLvl)`; producir lejos de la
región de venta suma logística `(0.02 + 0.06·avgDist)·fuelIndex`. La expansión
geográfica (construir fábricas en otras regiones) es una palanca real.

TIENDAS RETAIL (`company.outlets[]`): además de la región sede, una empresa
puede abrir tiendas en otras regiones para ampliar su ALCANCE de mercado
(reachMod = regionMod_sede · multiplicador, con rendimientos decrecientes y
CAP 2.4×). Cada tienda cuesta apertura (≈1 año de alquiler) + alquiler semanal
que escala con la población local. Modelo de alcance acotado (no sub-mercados
por región) para no reescribir la resolución de demanda; competidores no usan
tiendas, así que el balance base no cambia.

BONOS CORPORATIVOS (`issueBond`, loan.type='bond'): deuda garantizada por una
empresa puntual (no usa el límite de crédito personal). Capacidad =
`companyValue·0.6 − bonos vigentes`. Tasa `bondRateFor` mejor para empresas
grandes/rentables, piso 5% (> yield dividendos 4.5% → sin arbitraje). Reutiliza
la amortización de préstamos. Da a las corporaciones acceso a capital escalado
por su tamaño.

Demanda local = `baseDemand·(pop/refPop)·wealthIndex·demandMod[industry]`.
Inmueble: ingreso = `rentPerTick·occupancy`. Ocupación depende de oferta/demanda
regional de ese tipo (construir mucho del mismo tipo baja ocupación/renta).
`currentValue` sigue `landPrice` regional × macro (boom/crash). Hipotecas tipo
`mortgage`: tasa más baja (colateral), plazo largo, apalanca ganancias y
pérdidas. Logística: vender lejos cuesta `unitsShipped·distanceFactor·fuelIndex`;
logística propia baja `distanceFactor` (capeado).

---

## 10. I+D / TECH TREE

`researchPoints = MAX_RES·rndSpend/(rndSpend+HALF_SAT)` (rend. decrecientes).
Acumula en proyectos; cada nodo cuesta puntos crecientes por tier; prereqs.
Ramas: A) Productos (sube qualityCeiling, abre líneas), B) Eficiencia (baja
varCost, capeado, no llega a 0), C) Automatización (menos empleados, +fijos,
capital alto), D) Calidad/Marca, E) Logística/Cadena.
Obsolescencia: tech/software pierde demanda si no se renueva (obsolescenceRate);
staples = 0. Competidores también investigan. 100% I+D NO domina (descuida
operaciones).

---

## 11. MACRO Y EVENTOS

Ciclo: `cyclePhase = sin(2π·tick/cycleLen)` con ruido seedeado en len/amp.
`macroMult = 1 + amp·cyclePhase`.
Inflación: `annualInfl = baseInfl + cycleBonus(phase)`;
`inflationIndex *= 1+annualInfl/52`. Cash ocioso pierde poder adquisitivo
(realNetWorth cae).
Tasa (Taylor): `target = neutral + 1.5·(annualInfl−inflTarget) + 0.5·phase;
rate += (target−rate)·0.05`. Base de loanRate, cashYield, múltiplos.
Eventos (30 en catálogo): probabilidad/tick seedeada, condiciones, choices con
effects (algunos probabilísticos). Categorías: financieros, operativos,
competitivos, regulatorios (antimonopolio si concentra share), macro/shocks,
oportunidades. **Ningún evento es game-over instantáneo; todo evento negativo
tiene mitigación.** Reproducible por seed.

SEGUROS: `player.insured` (acción `setInsurance`). Prima semanal
`insuranceCostFor(state)` que escala con la exposición (empresas + inmuebles +
patrimonio). El helper `applyHit(state, amount)` aplica las pérdidas de cash de
los eventos y, si hay seguro, reduce el golpe un 60%. Tradeoff clásico: pagás
siempre por protección que quizá no necesites.

---

## 12. PROGRESIÓN Y BALANCE

Etapas por netWorth: 0 Endeudado (<0) · 1 Emprendedor (>0) · 2 PyME (>1M) ·
3 Empresario (>50M) · 4 Corporación (>1.000M) · 5 Magnate (>100.000M) ·
6 **Trillonario (>1.000.000M) = VICTORIA**.
Hitos guían sin obligar, beneficios chicos (nunca rompen balance).
6 estrategias viables: Manufactura/Integración, Retail/Volumen, Adquisiciones,
Financiero/Inversor, Inmobiliario, Tecnológico/I+D. Híbrido reduce riesgo pero
las puras siguen siendo viables.

---

## 13. FUENTES Y SUMIDEROS DE DINERO (balance crítico)

FUENTES: ventas (units·price), dividendos cobrados, alquileres, venta de
empresas/activos/acciones, préstamos recibidos (crea pasivo), interés sobre cash
(cashYield bajo), IPO (cede equity).
SUMIDEROS: costos producción (fijo+variable), holding de inventario, salarios,
marketing, I+D, intereses+cuotas de deuda, compra de empresas/inmuebles/acciones
+ comisiones, impuestos, mantenimiento, logística, erosión real por inflación
del cash ocioso.

**Diseño**: en juego pasivo la suma neta es negativa (fijos + interés neto +
inflación) → el netWorth real se erosiona lento, nunca crece gratis. El
crecimiento viene SOLO de decisiones activas buenas. No-arbitraje garantizado:
`loanRate > cashYield` y `loanRate > dividendYield` siempre.

---

## 14. CONDICIONES DE VICTORIA / DERROTA

- VICTORIA: `netWorth ≥ 1e12`. Sigue jugable en modo libre.
- DERROTA: SOLO bancarrota (6 ticks insolvente consecutivos). Ninguna otra causa.

---

## 15. RESULTADO DEL BALANCE (PASO 3/4, datos de Node)

Tests engine (`test.js`): **41/41 PASS**. Tests balance/exploit (`strat.js`): **20/20 PASS**.

Estabilidad macro (1000 ticks pasivos, seed 7): inflación ∈ [0.8%, 5.2%], tasa ∈
[0.6%, 12.3%], índice bursátil ∈ [1000, 6434]. Reproducible por seed.

Score: pagando al día 104 semanas sube 580→726 sin saltos >8 pts/tick. Un atraso
aislado nunca cae >15 pts y se recupera. Bancarrota requiere 6 ticks insolventes
consecutivos.

Balance de 6 estrategias puras (520 ticks, startCash 500k, seed 2024):
- Manufactura/Integración: ~141M (etapa 3)
- Retail/Volumen: ~11M (etapa 2)
- Tecnológico/I+D: ~56M (etapa 3)
- Adquisiciones (M&A): ~860M (etapa 3) — alto techo, intensivo en capital
- Financiero/Inversor: ~14M (etapa 2)
- Inmobiliario: ~2.9M (etapa 2)
- Híbrido: ~44M (etapa 2)
- Pasivo (sin decisiones): netWorth real cae 455k→299k (erosión, no crece).

Todas las puras alcanzan PyME+ sin quebrar; 3 llegan a Empresario+; ninguna se
acerca a trillonario en 10 años (no runaway); diversificar (híbrido) es
competitivo con menor riesgo. M&A tiene el techo más alto pero exige capital y
no es trivial desde cero.

Exploits cerrados (verificados en Node): tomar préstamo no cambia netWorth y el
interés lo erosiona (loanRate > cashYield siempre); dividend yield < loanRate
para todo score (sin arbitraje préstamo→dividendos, piso loanRate 5.5% > tope
yield 4.5%); comprar+vender la misma acción en el mismo tick pierde
(comisión+slippage); el impacto de mercado es 75% temporal (no se puede inflar
netWorth comprando las propias acciones); IPO→recompra no imprime dinero; flip
inmobiliario instantáneo pierde por costos de transacción; precio de reserva
hace que sobreprecar (>2× ref) colapse la demanda (no se puede vivir de vender
poquísimo a margen enorme); oscilar el precio no explota la IA (suavizada).

====================================================================
# v2 — EXPANSIÓN (Bloques 2–7): EE.UU., bolsa real, M&A, inmobiliaria, club, naciones
====================================================================

## V2.1 GEOGRAFÍA: ESTADOS DE EE.UU. (Bloque 2)
`state.regions[]` ahora contiene 12 ESTADOS de EE.UU. (la UI dice "estado"). Cada
uno: id, name, population (millones reales aprox), gdpPerCapita (relativo),
wageLevel, landPrice, taxRate, industryAffinity{industria→mult}, saturation.
Datos: CA 39M, TX 30M, FL 22M, NY 19.5M, IL 12.6M, PA 12.9M, OH 11.8M, GA 11M,
NC 10.7M, MI 10M, WA 7.8M, AZ 7.4M. TX/FL sin impuesto a la renta (taxRate bajo);
CA/NY/WA gdp y wage altos; afinidades: CA→tech, MI→automotriz, TX→energía,
NY→finanzas, WA→tech, etc.

## V2.2 MERCADO NACIONAL REALISTA (Bloque 2) — recalibración crítica
PROBLEMA previo: se ganaba ~$5M/sem con 30% del mercado automotriz (irreal).
SOLUCIÓN: separar TAMAÑO DE MERCADO (nacional) de TAMAÑO DE PLANTA (absoluto).

- `baseDemand` = demanda NACIONAL (unidades/semana), suma sobre estados:
  autos ~330.000/sem (17M/año), celulares ~2.900.000/sem (150M/año), pan y
  consumo masivo en decenas/cientos de millones/sem. Se reparte por estado según
  `population·gdpPerCapita·industryAffinity`.
- `plantCap` = capacidad de UNA fábrica (unidades/sem), ABSOLUTA por producto
  (una automotriz hace ~2.500 autos/sem por planta; una panadería ~40k panes).
  El share de un entrante = plantCap / baseDemand → DIMINUTO (<1%) en mercados
  nacionales grandes. Esto es lo correcto y deseado.
- `plantCost` = capital para construir una planta, ABSOLUTO y realista por
  industria → barrera de entrada. Heavy/tech (autos, chips, autos) piden capital
  masivo (gating por capital+score). Food/retail/indie son baratas y accesibles
  desde el arranque en un solo estado.
- MÁRGENES por industria (realistas): retail/consumo masivo 2–5%, autos 5–8%,
  electrónica 8–12%, lujo 25–40%, software/tech alto. Se modela vía
  `baseVarCost/refPrice` por producto.
- COMPETENCIA DENSA: 6–12 competidores por industria importante, capacidades
  dispares que SUMAN ~baseDemand: 1–2 gigantes (15–25% c/u), varios medianos
  (3–8%), muchos chicos (<2%). Un entrante "ni figura" hasta escalar mucho.

TABLA DE REFERENCIA (objetivo, se afina con tests): a nivel nacional, ganancia
semanal ≈ share · baseDemand · refPrice · margenNeto. Ej. autos: mercado
≈330k·$28k = $9.2B/sem; con 1% share y 6% margen ≈ $5.5M/sem (¡1% ya son
millones!); 20% share ≈ >$100M/sem (ser un coloso). Ganar $5M/sem en autos
corresponde a ~1% share, NO a 30%.

ESCALA DE ETAPAS revisada (netWorth): PyME >$1M, Empresario >$50M, Corporación
>$2.000M, Magnate >$200.000M, Trillonario >$1e12 (exige dominar VARIOS mercados).

## V2.3 BOLSA REALISTA Y CONTROL ACCIONARIO (Bloque 3)
- `sharesOutstanding` fijo por empresa cotizante; `ownershipPct = owned/SO`.
- Hitos: ≥25% accionista relevante (ve finanzas detalladas); **≥51% = DUEÑO** →
  la empresa se transfiere a `state.companies` (el jugador la gestiona) y se DEJA
  de contar como acciones en netWorth (evita doble conteo); el 49% restante paga
  dividendos a terceros (sumidero menor); 100% = sin dividendos a terceros, puede
  deslistar. No se pueden poseer más acciones que las existentes.
- Precio = fundamental (`EPS·peMultiple + bookValuePerShare·0.6`) con convergencia
  0.1 + ruido ±1–2%. peMultiple realista por industria, sube en boom/baja en
  recesión. Capitalización = price·SO (gigantes valen cientos de miles de M →
  comprar 51% cuesta miles de M).
- Slippage: `priceImpact = k·orderSize/SO` (75% temporal). Acumular hasta 51%
  encarece progresivamente.
- TENDER OFFER (`tenderOffer`): oferta formal por % objetivo a un precio/acción.
  Se acepta si precio ≥ mercado·(1+primaRequerida) (prima 20–40% según tamaño).
  Rápido y limpio pero pagás prima sobre todo el paquete. Muestra mercado, prima,
  costo total y si sería aceptada antes de confirmar.
- Dividendos: `annualEarnings·payoutRatio/SO`; yield 1–5%, SIEMPRE < retorno
  operativo y < costo de préstamos (no-arbitraje; piso loanRate 5.5% > yield).

## V2.4 ADQUISICIONES DE EMPRESAS ENTERAS Y MONOPOLIO (Bloque 4)
- Empresa PRIVADA: oferta en efectivo; se acepta si ≥ valuación·(1+prima 20–40%).
- Empresa COTIZANTE: vía 51% acumulado o tender offer (Bloque 3).
- Al adquirir, se transfiere TODO (fábricas, productos, share, marca, empleados,
  estados) a `state.companies`; integración con `_integrationTicks` (−productividad
  unas semanas). Fusión con empresa propia del mismo rubro: sinergias capeadas.
- PODER DE MERCADO: share nacional del rubro alto → puede subir precios con menos
  castigo de demanda (penalización de elasticidad reducida): a >50–60% share,
  `effElasticity = elasticity·(1 − 0.4·(share−0.5))` acotado; a >80% monopolio.
- FRICCIÓN: a mayor concentración (HHI/share propio) sube la prob. de eventos
  regulatorios (multa, desinversión, tope de precios) y la entrada de nuevos
  competidores en rubros rentables y concentrados. El monopolio es rentable pero
  disputado, no terminal.
- netWorth refleja activos+ganancias reales (sin crear valor por # de empresas).
  Comprar y revender al instante pierde (prima + fricción).

## V2.5 INMOBILIARIA AMPLIADA (Bloque 5)
Tipos de proyecto (cada uno: cost, buildTicks, rent, occupancy, riesgo): casa,
edificio, complejo, rascacielos de lujo; local, strip mall, shopping, torre de
oficinas; galpón, parque industrial, centro de distribución; hotel boutique,
resort; megaproyectos (uso mixto, urbanización, estadio/arena).
Ciclo: `phase` land → building (buildTicksRemaining: solo costos) → operating
(renta·occupancy − maintenance). Ocupación por oferta/demanda del estado.
Estrategias: renta, desarrollo+venta (valor por obra, no flip gratis),
apreciación, apalancamiento hipotecario (amplifica pérdidas; crash → patrimonio
negativo). landPrice sube con construcción, baja con sobreoferta (burbuja).
Megaproyectos elevan el valor de su zona. Flip instantáneo NO rentable.

## V2.6 CLUB DE FÚTBOL INGLÉS (Bloque 6) — industria estrella
Nombres ficticios. Pirámide de 5 divisiones (Nivel 5 semi-amateur → Nivel 1
elite). El club es una empresa más (`state.football` + entrada en companies para
netWorth). 1 temporada = 38 ticks; al cierre, posición según teamStrength vs
rivales + varianza seedeada; ascenso/descenso.
`teamStrength` = f(plantel(ability), DT, academia, instalaciones, moral).
PLANTEL: jugadores {ability, potential, value, wage, age, contract, morale};
ventanas de fichajes; comprar (fee + salario), vender (fee = ingreso), desarrollar
juveniles (comprar barato → vender caro), envejecen y pierden nivel.
ECONOMÍA (panel "de dónde sale y a dónde va"):
  FUENTES: derechos de TV/premios (ESCALAN MUCHÍSIMO por división — Nivel 1 paga
  un orden de magnitud más), entradas (capacidad·ocupación·precio), abonos,
  merchandising (marca), patrocinios, premios de copa, ventas de jugadores,
  aporte del dueño.
  GASTOS: salarios jugadores (mayor), staff/DT, fees, mantenimiento estadio,
  academia/instalaciones, operación, deuda.
Palancas del dueño: presupuesto de fichajes y techo salarial, comprar/vender,
contratar DT, invertir academia/instalaciones, ampliar estadio (megaproyecto),
precios de entradas, sponsors, inyectar/retirar capital, ambición.
Hinchada/marca crece con éxito; baja con malos resultados/precios abusivos.
Fair play financiero: no gastar infinito > ingresos sin sanción.
ANTI-EXPLOIT: salarios sin ingresos funden; vender todo desciende; la fuerza
deportiva viene de inversión sostenida, no de un botón; no domina el balance del
imperio (exige reinversión, como en la realidad).

## V2.7 NACIONES — FILANTROPÍA (Bloque 7)
`state.nations[]`: variedad de países (desarrollados/emergentes/bajos ingresos)
con gdp, gdpPerCapita, population, poverty%, healthIndex, educationIndex,
developmentLevel(0..100), totalReceived. Acción `donate(countryId, area, amount)`
(area: salud/educación/pobreza/general). Efecto GRADUAL con rendimientos
decrecientes (países pobres rinden más por dólar). Sin ayuda, derivan lento.
Donar es SUMIDERO real (no vuelve como ganancia) → objetivo de "legado"; da
reputación filantrópica (`player.philanthropy`) con beneficios suaves (marca).
Objetivo de legado paralelo a trillonario.

## V2.8 EVENTOS NO INTRUSIVOS (Bloque 7)
Los eventos ya NO abren modal a pantalla completa que pausa todo. `state.event`
pasa a `state.pendingEvents[]` (bandeja). Un indicador discreto en el header
(campana con contador). El jugador entra a "Decisiones" cuando quiere y resuelve.
El tiempo NO se fuerza a pausa; opcionalmente el jugador pausa. Se mantienen las
decisiones ramificadas y efectos; solo cambia la presentación.

## V2.9 FUENTES Y SUMIDEROS (actualizado)
FUENTES: ventas (share·demanda nacional·precio), dividendos de % <51%, alquileres
inmobiliarios, ventas de empresas/acciones/jugadores, IPO, préstamos/bonos,
TV/entradas/sponsors/merchandising del club, interés sobre cash.
SUMIDEROS: costos producción (fijo+variable+logística+overhead complejidad),
holding, salarios (empresas y club), marketing, I+D, intereses+cuotas+bonos,
compra de empresas/acciones/inmuebles (+prima+slippage+comisión), fees de
fichajes, mantenimiento (fábricas/estadio/academia/inmuebles), impuestos
(estatales), seguros, alquiler de tiendas, DONACIONES a naciones, inflación del
cash ocioso. Balance: juego pasivo erosiona; crecer exige decisiones activas.

## V2.10 SAVE VERSIONADO
SAVE_KEY → `magnate_save_v2`. Saves v1 (forma de state distinta) se descartan
limpio (aviso en UI), nueva partida. State sigue 100% serializable y determinista
por seed. Orden de tick fijo (se agregan pasos: club temporada, naciones,
inmobiliaria por fases — todos dentro del orden documentado).
