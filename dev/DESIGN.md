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
