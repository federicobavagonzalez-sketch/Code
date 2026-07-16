# CAGE — Documento de Diseño (v1, para aprobación)

> Simulación de carrera de peleador de MMA para móvil. El jugador **es** el peleador.
> Amateur sin nombre en gym de barrio → campeón mundial, antes de que el cuerpo se termine.
> No es juego de pelea con controles. Las peleas se resuelven round por round; la tensión está en las decisiones.

Este documento cierra el **Paso 1** del método de construcción. **Nada de código hasta que se apruebe.**
Todas las constantes numéricas viven en un único bloque `TUNING` (§16) para que el engine las lea; ningún valor está hardcodeado en dos lugares.

---

## 0. Índice

1. Pilares de diseño y anti-objetivos
2. Arquitectura de módulos y flujo de datos
3. Modelo de datos del peleador
4. Sistema de atributos, rangos cualitativos y caps ocultos
5. Arquetipos
6. Edad, crecimiento y declive (curvas exactas)
7. Progresión, entrenamiento y fatiga (fórmulas exactas)
8. Lesiones y daño cerebral acumulado
9. Ciclo semanal y slots de actividad
10. Camp y corte de peso
11. Motor de pelea (el corazón) — diseñado para simular rápido
12. Jueces, scoring y finales
13. El mundo simulado (400 peleadores, promotoras, ranking)
14. Economía
15. Fin de carrera y pantalla de resumen
16. Bloque `TUNING` (todas las constantes)
17. RNG determinista con semilla
18. Análisis anti-exploit
19. Plan de testing headless (criterios de aprobación)
20. Presupuesto de rendimiento
21. Interfaz (esbozo, se detalla en Paso 5)
22. Preguntas abiertas para el aprobador

---

## 1. Pilares de diseño y anti-objetivos

**Pilares**

- **Decisión sobre reflejo.** El jugador nunca controla un golpe. Elige intención; el engine resuelve.
- **Información imperfecta deliberada.** El jugador jamás ve un número. Ve rangos ("pegada pesada", "cardio dudoso"). El número real vive en el engine. Esto impide optimizar con calculadora.
- **Techos ocultos = rejugabilidad.** Cada atributo tiene un cap generado al crear al peleador. El jugador lo descubre cuando el progreso se frena, nunca por un número.
- **El cuerpo es un reloj.** Los técnicos suben toda la vida; los físicos declinan. El arco de carrera es ese trade-off.
- **El mundo existe sin el jugador.** 400 peleadores con carreras propias que avanzan cada semana.
- **Crudo, no heroico.** La mayoría de las carreras terminan sin título. El sistema lo respeta estadísticamente.

**Anti-objetivos (el juego falla si)**

- Se siente una planilla de cálculo con skin.
- Ganar es inevitable si entrenás bien.
- El random decide más que las decisiones.
- La primera carrera es la mejor.

**Contenido / cumplimiento** (mayores de 12): sin sangre gráfica, sin gore, sin apuestas con dinero real, sin IAP en v1. Los cortes se describen en texto neutro ("corte sobre el ojo", "sangre le tapa la visión"), nunca visual explícito.

---

## 2. Arquitectura de módulos y flujo de datos

Engine puro en JS, **cero referencia al DOM**. Módulos ES separados. Funciones puras donde se pueda; el estado mutable vive en objetos "world"/"career" que se pasan explícitamente.

```
www/js/engine/
  rng.js            PRNG con semilla (mulberry32). Sin Math.random en ningún lado del engine.
  tuning.js         Bloque TUNING. Única fuente de constantes.
  attributes.js     Definición de atributos, tiers cualitativos, mapeo valor→texto.
  fighter.js        Creación de peleador, caps ocultos, effective-attrs (con edad/fatiga/lesión/corte).
  progression.js    Entrenamiento, fatiga, ganancia por actividad, declive por edad.
  injury.js         Lesiones agudas, recuperación, daño cerebral acumulado.
  fight-engine.js   Simulación round-por-round. Modo verbose (log) y modo silent (mundo).
  judges.js         Scoring 10-9, tres jueces con sesgos ocultos, tipos de decisión.
  calendar.js       Semana/fecha real, avance de tiempo, agenda.
  world.js          400 peleadores, divisiones, matchmaking, ranking, promotoras, envejecimiento.
  economy.js        Bolsas, bonus, costos, balance de plata.
  career.js         Estado de la carrera del jugador; orquesta el ciclo semanal.
  save.js           Serialización. (La capa de persistencia Capacitor vive fuera del engine.)
www/js/ui/          Se escribe en el Paso 5, encima del engine ya probado.
test/               Node headless. Ver §19.
```

**Regla de dependencias:** `ui/*` puede importar `engine/*`. `engine/*` **nunca** importa `ui/*` ni toca `window`, `document`, `localStorage`, `fetch`. Esto permite el testing headless en Node sin mocks del DOM.

**Flujo del ciclo semanal** (§9): `career.advanceWeek(decisions)` →
progresión/fatiga/lesiones del jugador → `world.tick()` (avanza a los 400) → resolver peleas agendadas → recomputar ranking → generar ofertas → devolver `WeekReport` (datos puros que la UI renderiza).

---

## 3. Modelo de datos del peleador

Un `Fighter` es el mismo objeto para el jugador y para los 400 de la IA. La IA no es un tipo distinto; solo tiene un `controller: 'ai'` y una política de decisiones automática.

```
Fighter {
  id, name, isPlayer, controller

  // Identidad física
  birthWeekIndex          // edad se deriva del calendario, no se guarda un número que se desincronice
  archetype               // 'striker' | 'wrestler' | 'grappler' | 'complete'
  naturalWeightKg         // peso al que camina; define qué corte puede hacer
  divisionId              // categoría en la que pelea actualmente

  // Atributos base (0..100 float). Lo que "sabe hacer" sin modificadores de estado.
  phys { power, speed, cardio, strength, chin, recovery }
  tech { boxing, kickboxing, muayThai, wrestling, bjj, tdd, clinch, gnp, subs, subDefense }
  ment { fightIQ, grit, confidence, discipline }

  // Techos ocultos (0..100). Nunca se muestran. Uno por cada atributo de phys y tech.
  caps { ...mismos keys que phys y tech }

  // Estado dinámico
  fatigue                 // 0..100
  injuries[]              // lista de lesiones activas (ver §8)
  careerDamage            // contador oculto, sube y nunca baja (§8)
  chinCapPenalty          // reducción permanente del cap de chin por daño cerebral

  // Carrera
  record { wins, losses, draws, koWins, subWins, decWins, koLosses, ... }
  ratingElo               // rating interno para matchmaking y ranking (§13)
  promotionTier           // 0 amateur, 1 regional, 2 nacional, 3 liga grande
  contractPromoterId
  bankroll                // solo el jugador maneja plata detallada; la IA usa un proxy simple
  lossStreak              // para el corte de contrato
  weeksSinceLastOffer     // para "nadie te ofrece peleas"
  retired, retiredReason
}
```

**Atributos efectivos vs base.** El engine nunca usa `phys.cardio` crudo en una pelea. Usa `effective(fighter)` que aplica, en orden: penalización por edad (ya incorporada al base vía declive semanal, ver §6), fatiga residual, lesiones activas, y penalización del corte de peso del día de la pelea. `effective()` es función pura: `(fighter, context) → {phys, tech, ment}`.

---

## 4. Atributos, rangos cualitativos y caps ocultos

### 4.1 Las tres capas

- **FÍSICOS** (declinan con la edad, se entrenan lento): `power, speed, cardio, strength, chin (resistencia al daño), recovery`.
- **TÉCNICOS** (no declinan nunca, se entrenan toda la carrera): `boxing, kickboxing, muayThai, wrestling, bjj (jiu-jitsu), tdd (defensa de derribo), clinch, gnp (ground and pound), subs (sumisiones), subDefense (escape de sumisión)`.
- **MENTALES** (se mueven por eventos, no por entrenamiento directo): `fightIQ, grit (aguante mental), confidence, discipline`.

Todos 0..100. **El jugador nunca ve el número.**

### 4.2 Rangos cualitativos (lo único que ve el jugador)

Seis tiers. El texto del tier depende del atributo (vocabulario, no números). Para que ni siquiera el tier filtre el valor exacto, el borde entre tiers se difumina ±2 puntos con un jitter **estable por peleador** (derivado del id, no re-rolado cada vez que se abre la pantalla — si no, el jugador binarizaría el valor mirando parpadear el tier).

| Tier | Rango base | Ejemplo `power` | Ejemplo `cardio` | Ejemplo `boxing` |
|------|-----------|-----------------|------------------|------------------|
| 0 | 0–24 | sin pegada | se ahoga enseguida | manos torpes |
| 1 | 25–39 | pegada liviana | cardio dudoso | boxeo básico |
| 2 | 40–54 | pega correcto | aguanta un poco | boxeo correcto |
| 3 | 55–69 | pega fuerte | buen motor | buen boxeo |
| 4 | 70–84 | pegada pesada | motor de sobra | boxeo fino |
| 5 | 85–100 | poder de KO | cardio inagotable | boxeo de élite |

(Tablas completas de vocabulario por atributo en `attributes.js`; el patrón es siempre 6 tiers, sin número.)

**Progreso del atributo, cómo se comunica:** en la pantalla de gym cada atributo muestra su tier y una flecha de tendencia de las últimas ~8 semanas: `▲ subiendo`, `▬ estancado`, `▼ bajando`. Cuando el jugador choca con un cap oculto, la flecha pasa a `▬` aunque siga entrenando. **Así se descubre el techo: por estancamiento, nunca por un número.**

### 4.3 Caps ocultos (techos de potencial)

Generados una vez, al crear al peleador. Fuente principal de rejugabilidad.

Algoritmo (`fighter.js`, determinista con la semilla de la carrera):

```
1. Talento global T = rollTalent()      // sesgado bajo, ver distribución abajo
2. Para cada atributo físico y técnico:
     bias   = ARCHETYPE_BIAS[archetype][attr]      // -/+ puntos, tabla §5
     spread = uniform(-CAP_SPREAD, +CAP_SPREAD)     // CAP_SPREAD = 12
     cap[attr] = clamp( round(T + bias + spread), CAP_FLOOR, CAP_HARD_MAX )
```

- `rollTalent()`: distribución triangular sesgada baja, moda ~58, mínimo 40, máximo 96. La mayoría de los peleadores del mundo son mediocres; los prospectos raros (T alto) existen pero son pocos. Para el **peleador del jugador**, el mínimo se eleva a `PLAYER_TALENT_FLOOR = 50` para que toda carrera sea jugable, pero el techo sigue siendo aleatorio: podés tocarte un cuerpo con techo bajo y esa carrera se trata de exprimir lo poco que hay. Eso es intencional y crudo.
- `CAP_FLOOR = 35`, `CAP_HARD_MAX = 99` (nadie es perfecto en nada).
- Consecuencia: dos carreras seguidas se sienten distintas porque los caps distribuyen fuerte y débil de manera diferente. Un jugador con `power` cap 88 pero `cardio` cap 61 juega una carrera completamente distinta a uno con el reparto invertido.

Los caps de los atributos **mentales** no existen como techo entrenable (los mentales no se entrenan); tienen rango natural 0..100 y se mueven por eventos (§7.5).

---

## 5. Arquetipos

Al crear, el jugador elige base. **Sesga los caps ocultos, no los valores iniciales.** Un `striker` no empieza pegando mejor; empieza con más *potencial* de pegar mejor, y lo tiene que construir.

Bias a los caps (puntos sumados antes del spread):

| Atributo | striker | wrestler | grappler | complete |
|----------|:------:|:-------:|:-------:|:-------:|
| power | +8 | 0 | −2 | +2 |
| speed | +6 | +2 | 0 | +3 |
| cardio | 0 | +6 | +4 | +3 |
| strength | 0 | +8 | +2 | +2 |
| chin | +2 | +2 | 0 | +3 |
| recovery | 0 | +2 | +2 | +2 |
| boxing | +10 | −4 | −4 | +2 |
| kickboxing | +8 | −4 | −4 | +2 |
| muayThai | +8 | −2 | −2 | +2 |
| wrestling | −4 | +12 | +2 | +2 |
| bjj | −6 | 0 | +12 | +2 |
| tdd | +4 | +8 | +2 | +3 |
| clinch | +2 | +6 | +4 | +3 |
| gnp | −2 | +8 | +4 | +2 |
| subs | −6 | +2 | +12 | +2 |
| subDefense | 0 | +6 | +8 | +3 |

`complete` reparte bonus chico y parejo: no sobresale en nada, no tiene hueco grave. Los otros tres tienen picos altos y huecos reales que el jugador tendrá que tapar entrenando lo que no es su base (más lento, porque el cap ahí es más bajo).

Valores **iniciales** (idénticos en distribución para todos los arquetipos, amateur de barrio):

- `phys`: `uniform(45, 60)` cada uno (cuerpo joven y crudo, físico decente sin pulir).
- `tech`: `uniform(6, 18)` cada uno (no sabe pelear todavía).
- `ment`: `fightIQ uniform(20,35)`, `grit uniform(30,50)`, `confidence uniform(35,50)`, `discipline uniform(30,55)`.
- Edad inicial: 18–20.

---

## 6. Edad, crecimiento y declive

La edad se deriva del calendario (`ageYears = (currentWeek - birthWeekIndex)/52`). Afecta **solo a los físicos**. Técnicos y mentales jamás bajan por edad.

Dos efectos separados: un **multiplicador de crecimiento** (cuánto rinde entrenar físicos) y un **decaimiento pasivo** (cuánto se pierde por semana, se aplique o no entrenamiento).

| Banda de edad | growthMult (físicos) | Decaimiento anual pasivo (puntos/año) |
|---------------|:--------------------:|----------------------------------------|
| 18–27 | 1.00 | 0 |
| 28–31 | 0.50 | 0 |
| 32–35 | 0.20 | speed −2.5, recovery −2.0, cardio −1.5, power −1.0, strength −1.0, chin −1.0 |
| 36+ | 0.05 | speed −5.0, recovery −4.0, cardio −3.0, power −2.5, strength −2.5, chin −2.5 |

- El decaimiento se aplica **semanalmente**: `perWeek = annual/52`, restado del atributo base cada `advanceWeek`. Suelo del decaimiento: los físicos no bajan de `AGE_PHYS_FLOOR = 20` (un profesional viejo sigue siendo un atleta comparado con el promedio, pero lento).
- Técnicos: `growthMult = 1.0` **a toda edad**, decaimiento 0. Un peleador de 36 sigue aprendiendo a pelear; simplemente su cuerpo no responde.
- **El trade-off del arco:** un peleador de 34 tiene `tech` y `fightIQ` altísimos pero `speed`/`recovery`/`cardio` cayendo. Pelea más inteligente y más lento. El jugador lo *siente* porque en la pelea sus intercambios de velocidad los pierde pero lee mejor (fightIQ mejora contras y selección de golpe, §11). **El juego nunca lo explica con texto.**

Esto, combinado con el daño cerebral (§8) y la sequía de ofertas (§13), es lo que fuerza el retiro.

---

## 7. Progresión, entrenamiento y fatiga

### 7.1 Fatiga (recurso central)

`fatigue ∈ [0,100]`. Cada actividad la sube; descanso y recuperación pasiva la bajan.

```
Aporte de fatiga por slot de actividad (por slot usado):
  train         +18
  sparring      +25
  conditioning  +20
  grindwork     +15
  personal      +5
  rest          −35   (además de recuperación pasiva)

Recuperación pasiva semanal (siempre, al cierre de la semana):
  passiveRecover = REST_BASE * (0.6 + 0.4 * recovery/100) * ageRecovMult
  REST_BASE = 8 ;  ageRecovMult = 1.0 (<32), 0.85 (32-35), 0.7 (36+)
```

Fatiga alta castiga todo. `fatigueFactor = clamp(1 − fatigue/100 * 0.8, 0.2, 1.0)`. Con fatiga 100, las ganancias caen al 20% y el riesgo de lesión se multiplica (§8). **Descansar es una decisión real:** no entrenar una semana para bajar fatiga y no lesionarte compite contra el tiempo que se te acaba por la edad.

### 7.2 Entrenar una disciplina (técnico) o acondicionamiento (físico)

Ganancia por **slot** de entrenamiento:

```
room = clamp( (cap[attr] - attr) / CAP_APPROACH , 0, 1 )   // CAP_APPROACH = 25
base = (attr es técnico) ? K_TECH : K_PHYS                   // K_TECH=2.4, K_PHYS=1.6
gMult = (attr es físico) ? ageGrowthMult(age) : 1.0
gain = base * room * fatigueFactor * gMult * coachMult * disciplineMult * uniform(0.85, 1.15)
attr = min(attr + gain, cap[attr])
```

- `room` hace que el progreso se **frene asintóticamente** cerca del cap: a 25 puntos del techo empieza a ralentizarse; a 5 puntos gatea. El jugador ve la flecha pasar a `▬` y deduce que llegó a su límite, **sin número**.
- `coachMult`: calidad del gym/coach pagado (0.8 gym de barrio → 1.3 coach de elite). Ver economía (§14).
- `disciplineMult = 0.9 + 0.2 * discipline/100`: la disciplina mental hace que cada sesión rinda un poco más (y evita "saltarse" entrenamientos en eventos, §7.5).
- **Acondicionamiento** entrena un físico rotativo o el más bajo respecto de su cap (config); sube `power/speed/cardio/strength/chin/recovery` según foco elegido en UI.

**Trayectoria esperada (sanity check, no es fórmula nueva):** un técnico que empieza en 12 con cap 71, coach 1.0, ~1.3 slots/semana promedio dedicados a esa disciplina, discipline media: alcanza tier "buen boxeo" (~60) en ~2.5–3 años de juego y se estanca perceptiblemente cerca de 68–71 hacia el año 5–6. Coincide con "entrenar diez años y no pasar de 71".

### 7.3 Sparring

Gana experiencia más rápido que el entrenamiento aislado porque entrena varias técnicas a la vez **en contexto**, pero arriesga lesión (§8) y suma bastante fatiga.

```
Por slot de sparring:
  - Elige 2–3 técnicas según arquetipo/gameplan y les aplica la fórmula de ganancia con base K_TECH * 1.3
  - Sube fightIQ levemente: fightIQ += 0.15 * fatigueFactor (aprender leyendo a un rival vivo)
  - Riesgo de lesión elevado (§8)
```

### 7.4 Acondicionamiento, descanso, trabajo de mierda, vida personal

- **conditioning**: entrena físicos (§7.2 con `K_PHYS`).
- **rest**: −35 fatiga, además acelera recuperación de lesiones menores esa semana (§8), 0 ganancia de atributos.
- **grindwork** (turno en bar, delivery): da plata (`GRIND_PAY` §14), +15 fatiga, 0 ganancia. Es el juego temprano: sin plata no comés, pero cada slot de laburo es un slot que no entrenás.
- **personal** (vida personal): +grit y +discipline por evento (§7.5), −un poco de "presión" acumulada; +5 fatiga. Descuidar la vida personal genera eventos negativos (baja confidence/discipline).

### 7.5 Mentales: se mueven por eventos, no por entrenamiento

Los cuatro mentales cambian por lo que **pasa**, no por un slot:

- `confidence`: sube con victorias (más si es finish o contra rival mejor rankeado), baja con derrotas (más si es KO). `Δ = ±CONF_STEP * factorRivalidad`.
- `grit`: sube al sobrevivir rounds difíciles, al ganar peleando lastimado, al aguantar un corte de peso duro. Baja rara vez. Es el atributo que un veterano acumula.
- `fightIQ`: sube lento con cada pelea disputada y con sparring; nunca baja. Es "experiencia de ring".
- `discipline`: sube con slots `personal` y con camps completados sin saltarse trabajo; baja con eventos de vida (fiesta, lesión mal manejada, problemas de plata).

Los mentales alimentan el motor de pelea (§11): `fightIQ` mejora selección/contras, `grit` sube el umbral de rendición y la recuperación entre rounds bajo presión, `confidence` afecta el output inicial y la tendencia a apostar, `discipline` afecta corte de peso y consistencia del camp.

---

## 8. Lesiones y daño cerebral acumulado

### 8.1 Lesiones agudas

Ocurren en actividades (sparring sobre todo) y en peleas. Tipos, recuperación y efecto:

| Lesión | Semanas recup. | Efecto mientras activa |
|--------|:--------------:|------------------------|
| Corte (facial) | 1–2 | Reabre fácil en la próxima pelea (más riesgo de TKO médico) |
| Mano rota | 4–8 | −40% eficacia de boxing/power de esa mano; entrenar striking la empeora |
| Rodilla | 6–14 | −30% speed, −20% wrestling/tdd; sparring prohibido sin agravar |
| Hombro | 5–10 | −25% subs/clinch/gnp; entrenar grappling la empeora |
| Conmoción | 3–6 | No podés sparrear ni pelear sin sumar daño cerebral fuerte |

**Probabilidad de lesión por slot de actividad:**

```
pInjury = BASE_RISK[activity]
        * (1 + fatigue/100 * INJ_FATIGUE_K)          // INJ_FATIGUE_K = 2.0
        * (1 + ageInjuryBump(age))                    // 0 (<32), 0.4 (32-35), 0.9 (36+)
        * (2 - chin/100)                              // chin también = durabilidad estructural
        * (1 + activeInjuries * 0.5)                  // lesionado se relesiona
BASE_RISK: train 0.005, sparring 0.045, conditioning 0.010, grindwork 0.003, rest 0, personal 0
Severidad: roll → 60% menor(1-2 wk), 30% moderada(3-8 wk), 10% mayor(8+ wk)
```

Pelear/entrenar lesionado es posible y a veces necesario (no perder la bolsa). Hacerlo agrava con probabilidad y suma semanas de recuperación.

### 8.2 Daño cerebral acumulado (contador oculto, permanente)

```
careerDamage += damageTakenEnLaPelea * (recibióKO ? DMG_KO_MULT : 1.0)   // DMG_KO_MULT = 2.5
// nunca baja
```

Al cruzar umbrales, **baja permanentemente el cap de `chin`**:

```
if careerDamage > DMG_THRESHOLD_1 (=600): chinCapPenalty = max(chinCapPenalty, 8)
if careerDamage > DMG_THRESHOLD_2 (=1000): chinCapPenalty = max(chinCapPenalty, 18)
if careerDamage > DMG_THRESHOLD_3 (=1500): chinCapPenalty = max(chinCapPenalty, 32)
capEfectivo(chin) = caps.chin - chinCapPenalty
attr.chin = min(attr.chin, capEfectivo(chin))   // el atributo también baja si ya estaba arriba
```

Un peleador con mucho daño se noquea con menos (chin bajo → umbral de KO más fácil, §11.6). Es irreversible. Es el temporizador biológico que, junto con la edad, hace que **retirarse a tiempo** sea una decisión con peso: seguir peleando por una bolsa más puede costarte el resto de la carrera (o la salud, narrado sin gore).

---

## 9. Ciclo semanal y slots de actividad

El tiempo avanza por **semanas**, con fecha de calendario real (empieza p. ej. lunes de la primera semana; la UI muestra "Semana del 14 de marzo, 2028").

**Semana normal (fuera de camp): 3 slots.** Cada slot es una de:

1. Entrenar disciplina específica (elegir cuál)
2. Sparring
3. Acondicionamiento físico (elegir foco)
4. Descanso
5. Trabajo de mierda
6. Vida personal

Se pueden repetir (p. ej. 2 entrenar boxing + 1 descanso). Al confirmar, `career.advanceWeek()`:

```
1. Aplica cada slot: ganancias, fatiga, tiradas de lesión, plata (grind), eventos (personal)
2. Decaimiento por edad (físicos)
3. Recuperación pasiva de fatiga y de lesiones
4. Cobra costos semanales (gym, coach, vida) y descuenta bankroll  → puede gatillar necesidad de grind
5. world.tick(): avanza a los 400, resuelve peleas IA, recomputa ranking, genera rookies/retiros
6. Genera/actualiza ofertas de pelea para el jugador
7. Devuelve WeekReport (puro) para la UI
```

Si hay una pelea aceptada, la semana entra en modo **camp** (§10) y los slots cambian.

---

## 10. Camp y corte de peso

### 10.1 Camp (8 semanas)

Aceptar una pelea abre un camp de 8 semanas hasta la fecha. Los slots cambian de foco:

- **Game plan específico**: entrenar la(s) disciplina(s) del plan contra el estilo del rival. Aporta un modificador directo al rendimiento en la pelea (`gamePlanFit`, §11.2) además de la ganancia normal (reducida: en camp se pule, no se construye — `K` × 0.7).
- **Sparring con compañeros que imitan al rival**: sube `gamePlanFit` y `fightIQ` específico contra ese estilo; riesgo de lesión de camp (perder la pelea por lesionarte entrenándola es un riesgo real).
- **Corte de peso** (ver 10.2): slots dedicados a bajar de peso acercándose a la fecha.
- Descanso/acondicionamiento siguen disponibles; **hay que llegar afilado y no quemado**: fatiga alta el día de la pelea es desastrosa.

Un camp bien gestionado deja: fatiga baja el día de la pelea, `gamePlanFit` alto, peso hecho sin castigo. Uno mal gestionado: quemado, o pasado de peso, o lesionado.

### 10.2 Corte de peso

El peleador tiene `naturalWeightKg` (peso al que camina). Elige `divisionId` para la pelea. El corte es la diferencia a bajar hasta el límite el día del pesaje.

```
cutKg      = naturalWeightKg - DIVISION_LIMIT[divisionId]
cutFrac    = cutKg / naturalWeightKg
// Zona segura vs peligrosa:
SAFE_FRAC  = 0.06   // hasta 6% del peso corporal = corte manejable
MAX_FRAC   = 0.11   // arriba de esto, casi seguro fallás o te matás el cardio

Penalización el DÍA DE LA PELEA (aplicada en effective() para esa pelea):
  overSafe   = max(0, cutFrac - SAFE_FRAC)
  cardioPen  = overSafe * CUT_CARDIO_K   * (2 - discipline/100)   // CUT_CARDIO_K = 320
  chinPen    = overSafe * CUT_CHIN_K     * (2 - discipline/100)   // CUT_CHIN_K   = 240
  // ejemplo: cortar 9% con disciplina media → overSafe 0.03 → ~ −14 cardio, −10 chin ese día

Ventaja por tamaño (si bajás de división respecto de tu peso natural):
  sizeEdge = cutFrac * SIZE_EDGE_K   // SIZE_EDGE_K = 60 → hasta ~+6 a strength/power efectivos
  // sos el más grande del octágono: pegás y controlás mejor

Riesgo de fallar el pesaje:
  pMiss = clamp( (cutFrac - SAFE_FRAC) / (MAX_FRAC - SAFE_FRAC) * (1.5 - discipline/100), 0, 0.9 )
  Si falla: perdés MISS_PURSE_PCT (=25%) de la bolsa, empezás la pelea con −MISS_FATIGUE (=15)
            de fatiga extra y el rival recibe un pequeño bonus moral.
```

**Diseño:** el corte agresivo es una **tentación real y peligrosa**, no un botón obvio. Bajar de división te hace el más grande (ventaja tangible) pero te seca el cardio y el mentón justo el día que los necesitás, y podés fallar el pesaje. La `discipline` alta mitiga (nutrición seria); la baja lo empeora. No hay corte "óptimo": depende de tu cuerpo, tu rival y tu disciplina.

---

## 11. Motor de pelea

El núcleo. Corre round por round. Cada round simula intercambios discretos internamente y produce un **log de texto** (modo verbose) o solo el resultado (modo silent, para el mundo). Entre rounds, el jugador decide una intención.

**Diseño para velocidad** (requisito explícito): turnos **fijos** por round, matemática barata (sumas, un `Math.exp` por intercambio resuelto vía sigmoide, sin allocations en el loop caliente), PRNG con semilla, y modo silent que **no** construye strings. Presupuesto en §20.

### 11.1 Estructura temporal

```
Pelea = R rounds (R=3 normal, R=5 título) × T_TURNS turnos/round (T_TURNS = 10)
Un turno ≈ 30 s de reloj de pelea. 3 rounds = 30 turnos. 5 rounds = 50 turnos.
```

`T_TURNS` es una constante de `TUNING`: subirla da más granularidad (logs más ricos) a costa de CPU; bajarla acelera el mundo. 10 es el default: suficiente textura, y 10k peleas ≈ 300k turnos (barato, §20).

### 11.2 Estado de la pelea

```
FightState {
  round, turn
  position   // 'STANDING' | 'CLINCH' | 'GROUND'
  controllerId    // en CLINCH/GROUND, quién controla (null en STANDING)
  controlQuality  // 0..1, qué tan dominante es el control (guardia vs montada, etc.)
  A, B: FighterInFight {
    ref al Fighter
    eff            // atributos efectivos (edad+fatiga+lesión+corte) precomputados una vez al inicio
    stamina        // 0..100, arranca en 100 - (corte/fatiga previa), baja por turno
    damage         // daño acumulado recibido en ESTA pelea, 0..∞ (umbral de TKO)
    cut            // severidad de corte facial 0..1 (afecta visión → accuracy/def)
    intent         // intención elegida para el round actual (§11.5)
    gamePlanFit    // 0..1, qué tan preparado vino para este rival (del camp)
    // acumuladores de scoring del round:
    rSig, rDamage, rControl, rTakedowns, rAggression, knockdowns
  }
}
```

`eff` se calcula **una vez** al empezar la pelea (no por turno): edad, fatiga previa, lesiones y corte son fijos durante la pelea. Dentro de la pelea solo cambian `stamina`, `damage`, `cut`. Esto mantiene el loop barato.

### 11.3 Loop de un turno

Cada turno hace, en orden, tres fases. Todas resuelven con la **sigmoide de diferencia de atributos** (§11.7), que mantiene toda probabilidad acotada en (0.02, 0.98): nunca hay certeza, siempre hay upset posible.

```
resolveTurn(state):
  A, B = state.A, state.B
  # 1) FASE DE POSICIÓN: ¿cambia dónde ocurre la pelea?
  transición según intents y atributos posicionales (§11.4). Puede pasar a CLINCH/GROUND/STANDING,
  cambiar controllerId y controlQuality, y contar takedowns/getups para scoring.

  # 2) FASE DE ACCIÓN: el "agresor" del turno tira UNA acción apropiada a la posición
  aggressor = elegirAgresor(state)      # según intents (presionar/apostar tira más), initiative
  action    = elegirAccion(aggressor, position, gameplan, fightIQ)   # golpe / GnP / intento de sub
  landP     = sigmoid( K_LAND * (offense(aggressor, action) - defense(defender, action)
                                  + intentMod + iqMod + gamePlanMod) )
  landP     = clamp(landP, P_MIN, P_MAX)   # (0.02, 0.98)
  if rng() < landP:
     registrarImpacto(action):
        - significantStrike++ ; rSig += weight(action)
        - dmg = damageOf(action, aggressor.eff.power, defender.eff.chinEff, controlQuality)
        - defender.damage += dmg ; rDamage += dmg
        - posible apertura de corte (prob ∝ acción a la cabeza)
        - # 3) CHEQUEO DE KO (§11.6)
        - si esKO(dmg, defender): fin por KO/TKO. return FINISH.
  else:
     # fallo: si defender venía contragolpeando y aggressor apostaba/presionaba → contra (§11.5)

  # 4) STAMINA: ambos gastan según intensidad de su intent y de la posición
  A.stamina -= drain(A.intent, position, A.eff.cardio)
  B.stamina -= drain(B.intent, position, B.eff.cardio)

  # 5) CHEQUEO DE TKO POR ACUMULACIÓN y de corte (§11.6)
```

`registrarImpacto` es la única parte que arma texto, y solo en modo verbose. En modo silent, incrementa contadores y nada más.

### 11.4 Transiciones de posición

Cada posición tiene un atributo ofensivo y uno defensivo relevante. Todas resuelven por sigmoide.

| De → A | Iniciada por (intent/gameplan) | Prob = sigmoid(K_POS × ( … )) |
|--------|-------------------------------|-------------------------------|
| STANDING → GROUND (derribo) | quien tira derribo | `wrestling + strength·0.3 − opp.tdd − opp.balance` |
| GROUND → STANDING (levantarse) | el que no controla | `getup(bjj,strength) − control(controllerId)` |
| STANDING ↔ CLINCH | quien busca clinch | `clinch − opp.clinch` |
| CLINCH → GROUND | quien tira desde clinch | `wrestling + clinch·0.5 − opp.tdd` |
| GROUND: mejorar control | el que controla | `bjj + wrestling − opp.subDefense − opp.getup` → sube `controlQuality` |

`controlQuality` alto habilita GnP efectivo y aumenta la probabilidad de intento de sumisión exitoso; para el que está abajo, sube el score defensivo y la chance de sub desde la guardia (si el grappler está abajo).

### 11.5 Intenciones entre rounds (la decisión del jugador)

Antes de cada round el jugador (o la IA) elige **una** intención. Modifica output, precisión, defensa, gasto de stamina y búsqueda de KO/derribo. **Diseño rock-paper-scissors suave:** ninguna gana sola; cada una tiene contra, y su eficacia depende de atributos, fatiga y marcador.

| Intención | Efecto mecánico | Fuerte contra | Débil contra |
|-----------|-----------------|---------------|--------------|
| **Presionar** | +output, +aggression score, −defensa leve, ++stamina drain | Sobrevivir (le robás rounds) | Contragolpear |
| **Contragolpear** | −output, +precisión y +damage cuando el rival presiona/apuesta, −−stamina drain | Presionar, Apostar | Sobrevivir (round aburrido, jueces no premian) |
| **Llevar al suelo** | prioriza derribos, +control score | Striker con `tdd` bajo | Mantener de pie |
| **Mantener de pie** | +tdd/sprawl, resiste ground | Llevar al suelo | Presionar (no hacés nada ofensivo propio) |
| **Sobrevivir** | ++defensa, −−output, +recuperación de stamina, cede puntos | (recupera cardio/daño) | Presionar (perdés el round) |
| **Apostar todo** | ++KO chance y power, ++aperturas (rival +precisión), ++stamina drain | Rival ya lastimado / stamina baja | Contragolpear (te comés la contra) |

- El costo de stamina impide **spamear** intenciones agresivas: presionar/apostar todo el tiempo te vacía y en rounds tardíos rendís al 20%. Sobrevivir recupera pero regala rounds a los jueces. La decisión correcta depende del estado — no hay una dominante (verificado en §18/§19).
- `fightIQ` alto mejora la eficacia de Contragolpear y la selección de golpe; por eso el veterano lento sigue siendo peligroso.
- `grit` alto sube el piso de rendimiento cuando estás lastimado/cansado y mejora la recuperación al elegir Sobrevivir.

### 11.6 Daño, KO, TKO, corte

```
damageOf(action, power, chinEff, controlQuality):
  base = ACTION_DMG[action]                        # jab bajo, cross/rodilla/codo alto, GnP escala con control
  return base * (0.5 + power/100) * (1 + controlQuality·CTRL_DMG_K) * (1.4 - chinEff/100) * uniform(0.8,1.2)

# KO instantáneo en un impacto (raro, probabilístico, nunca determinista):
esKO(dmg, defender):
  chinEff = defender.eff.chin - defender.chinCapPenalty
  pKO = KO_BASE
      * (dmg / KO_DMG_REF)                          # golpe pesado pesa más
      * (1 + defender.damage / KO_ACCUM_REF)         # daño acumulado en la pelea sube la chance
      * (1 + max(0, (50 - chinEff)) / 50 )           # mentón débil = más KO
      * (1 + (defender.stamina < 30 ? 0.5 : 0))      # cansado = más frágil
  pKO = clamp(pKO, 0, KO_PMAX)                       # KO_PMAX = 0.35 (nunca certeza en un solo golpe)
  return rng() < pKO

# TKO por acumulación: si defender.damage > TKO_DAMAGE_THRESHOLD, cada turno crece la prob de
# parada del árbitro: pStop = clamp((damage - TKO_DAMAGE_THRESHOLD)/TKO_STOP_RANGE, 0, 0.6) * (defender apostando? menos: más)
# TKO médico: si cut >= CUT_STOP y hay revisión del doctor entre rounds → parada.
# Sumisión: intento exitoso si (en GROUND con control) sigmoid(K_SUB*(subs+controlQuality·30 − opp.subDefense
#           − opp.grit·0.2 + (opp.stamina<30?bonus))) supera el umbral y el rng cae → tap.
```

El daño de la pelea (`damage` de cada uno) alimenta `careerDamage` al terminar (§8).

### 11.7 La sigmoide (única primitiva de resolución)

```
sigmoid(x) = 1 / (1 + exp(-x))
Resolución estándar de cualquier contienda:
  d = (atributoOfensivo - atributoDefensivo) + noise
  noise = uniform(-NOISE_SPAN, +NOISE_SPAN)          # NOISE_SPAN = 8 (ruido acotado)
  p = clamp( sigmoid(K * d), P_MIN, P_MAX )           # K≈0.09 según fase; P_MIN=0.02, P_MAX=0.98
```

- **Peleadores idénticos** → cada `d = 0 + noise` simétrico → `p ≈ 0.5` → cerca de 50/50 en 10k peleas (test §19.1). ✔
- El `clamp(P_MIN,P_MAX)` garantiza que **ninguna estrategia asegura victoria** ni evita del todo el upset: siempre hay 2% de que lo improbable pase (test §19.3). ✔
- El ruido está **acotado** (±8 puntos equivalentes): las decisiones y los atributos mandan; el random condimenta, no decide (anti-objetivo respetado, verificado midiendo correlación decisión→resultado en §19).

---

## 12. Jueces, scoring y finales

### 12.1 Scoring por round (10-9)

Al cerrar cada round, cada uno de **tres jueces** calcula un puntaje para A y B combinando los acumuladores del round con **pesos ocultos** distintos por juez:

```
scoreJuez(f, juez) = Wjuez.strikes    * f.rSig
                   + Wjuez.damage     * f.rDamage
                   + Wjuez.control    * f.rControl
                   + Wjuez.aggression * f.rAggression
                   + uniform(-JUDGE_NOISE, +JUDGE_NOISE)     # subjetividad / robos
```

Perfiles de juez (ocultos, se asignan aleatoriamente por pelea de un pool):

| Juez tipo | strikes | damage | control | aggression |
|-----------|:------:|:-----:|:------:|:---------:|
| "premia el control" | 0.8 | 0.9 | **1.6** | 0.4 |
| "premia el daño" | 1.0 | **1.7** | 0.5 | 0.6 |
| "premia la agresión" | 1.1 | 0.8 | 0.5 | **1.6** |

- Cada juez da 10 al que puntúa más alto ese round, 9 al otro. **10-8** si hubo knockdown o dominancia clara (`gap > DOM_GAP`). 10-10 solo si el gap es < `EVEN_GAP` (raro).
- Rounds **cerrados** → los tres jueces pueden diferir por sus pesos + ruido → **decisiones divididas** reales, y **robos ocasionales**. Duelen. Es intencional.

### 12.2 Tipos de final

- **KO**: `esKO` disparó (§11.6).
- **TKO por golpes**: parada del árbitro por acumulación.
- **TKO médico**: corte por encima del umbral en revisión entre rounds.
- **Sumisión**: tap.
- **Decisión** al agotar los rounds, sumando tarjetas: **unánime** (3-0), **dividida** (2-1), **mayoritaria** (2-0 con un empate), **empate** (tarjetas cruzadas). El campeón retiene en empate de título.
- Un **corte** puede abrirse en cualquier momento; reduce visión (`cut` → penaliza accuracy/def del afectado los turnos siguientes) y puede escalar a TKO médico.

---

## 13. El mundo simulado

El mundo existe sin el jugador. **400 peleadores** repartidos en **8 categorías de peso**.

### 13.1 Divisiones (8)

Límites (kg) inspirados en MMA real, editables en `TUNING`:

```
flyweight 57, bantamweight 61, featherweight 66, lightweight 70,
welterweight 77, middleweight 84, lightheavyweight 93, heavyweight 120
```

~50 peleadores por división, cada uno con atributos, arquetipo, edad, caps ocultos y `ratingElo`.

### 13.2 Tick semanal del mundo (`world.tick()`)

```
1. Envejecer a los 400 (decaimiento físico, técnicos suben poco por auto-entrenamiento IA)
2. Matchmaking: agendar peleas entre IA cercanas en rating/tier (y las del jugador aceptadas)
3. Resolver peleas IA con fight-engine en modo SILENT (sin log). Actualizar records, careerDamage, lesiones.
4. Actualizar ratingElo por resultado (Elo con K por tier; finish da un plus)
5. Recomputar ranking: top 15 por división = orden por ratingElo (con penalización por inactividad)
6. Gestionar promotoras (§13.4): ascensos por récord+rating, cortes por 3 derrotas seguidas
7. Retiros: por edad+declive, por careerDamage crítico, o por sequía de ofertas (IA)
8. Rookies: cada ~52 semanas inyectar una camada nueva (18-21 años) para reponer retiros y mantener ~400
9. Título: el campeón defiende contra el #1 cada cierto tiempo; puede perderlo sin el jugador cerca
```

**Auto-entrenamiento IA** (barato): cada semana, cada IA sube técnicos hacia su arquetipo con una versión simplificada de §7.2 (sin gestión de slots ni fatiga fina; un `Δ` agregado). Envejece con las mismas curvas que el jugador. Así "mejoran, se lesionan, ganan, pierden, se retiran" de forma coherente.

### 13.3 Ranking y título

- Ranking **top 15 por categoría**, recomputado **cada semana** según resultados reales del mundo simulado.
- El **campeón** de cada división defiende y **puede perder el cinturón** en una pelea IA-vs-IA que el jugador ni ve. Cuando el jugador entra al top, las defensas/retos lo involucran.
- Elo como columna vertebral del matchmaking y del ranking; las peleas se **simulan de verdad** (no es solo Elo), pero Elo evita tener que fijarse en 400 historiales para emparejar.

### 13.4 Promotoras (escalera)

| Tier | Nombre | Bolsa base | Exposición | Requisito para subir |
|:----:|--------|:----------:|-----------|----------------------|
| 0 | Circuito amateur | 0 (sin bolsa, sin ranking) | nula | ~5-6 victorias amateur |
| 1 | Regionales | chica | gimnasios de 300 | récord regional sólido + rating |
| 2 | Ligas nacionales | plata de verdad | algo de prensa | rating alto + récord vs nacionales |
| 3 | La liga grande | títulos, contratos | prensa, cinturones | invitación por rating/ranking |

- **Subir requiere un récord que lo justifique** (umbral de rating + victorias vs nivel). **Bajar pasa solo:** `lossStreak >= 3` → te cortan el contrato y caés de tier. **Volver es más difícil que llegar** (arrancás abajo en rating, con edad más alta y quizás daño acumulado).

### 13.5 Contratos y ofertas

- Llegan ofertas: **rival, fecha (8 semanas de camp), bolsa**. La calidad del rival escala con tu rating pero **el juego ofrece a veces peleas trampa** (rival muy por encima) **sin advertir**. Aceptarla demasiado pronto es la trampa clásica; el juego la permite. Es el jugador el que debe leer el tier del rival (por sus rangos cualitativos y su ranking) y decidir.
- **Rechazar mucho enfría la carrera**: cada rechazo sube `weeksSinceLastOffer` efectivo y baja tu prioridad de matchmaking; rechazar en exceso seca las ofertas (camino al retiro forzado por inactividad).

---

## 14. Economía

Solo el **jugador** lleva contabilidad detallada; la IA usa un proxy (no necesita bankroll real).

### 14.1 Ingresos

```
bolsa(tier, rating) = TIER_PURSE_BASE[tier] * (1 + rating_norm * PURSE_RATING_K)
winBonus            = bolsa * WIN_BONUS_PCT            # solo si ganás
finishBonus         = FINISH_BONUS[tier]              # KO/sub/TKO
performanceBonus    = si la pelea entra en el "highlight" del evento (subset aleatorio) → PERF_BONUS[tier]
grindPay            = GRIND_PAY  por slot de trabajo de mierda
```

`TIER_PURSE_BASE`: `[0, 400, 3.500, 40.000]` (tier 0 no paga). Números en la moneda del juego, calibrables en testing (§19.4).

### 14.2 Costos (semanales y por pelea)

```
Semanales:
  gymFee      según calidad (0.8→1.3 coachMult): [80, 150, 300, 600]
  nutricionista (opcional, mejora corte/discipline): 120/sem si contratado
  vida        LIVING_COST = 220/sem  (subsistencia)
Por pelea:
  managerCut  = bolsa * MANAGER_PCT   # MANAGER_PCT = 0.15 (si tenés manager; da mejores ofertas)
```

### 14.3 El arco económico

- **Juego temprano (amateur/regional):** la bolsa no alcanza para vivir. Hay que meter slots de **grindwork**, que roban tiempo de entrenamiento. **Esa presión ES el juego temprano.**
- **Juego medio (nacional):** la plata empieza a alcanzar; podés dejar el laburo y pagar mejor coach/nutricionista (mejores `coachMult` y corte).
- **Juego tardío (liga grande):** bolsas grandes, pero costos altos (manager, mejor gym) y el reloj biológico corriendo. La plata deja de ser el problema; el cuerpo lo es.

Restricciones verificadas en testing (§19.4): **nadie llega a plata infinita** (costos escalan, carrera finita) ni queda en **muerte por inanición inescapable** (grindwork siempre disponible como piso de ingreso; si bankroll < 0 hay deuda con penalización de moral, no game-over instantáneo).

---

## 15. Fin de carrera y pantalla de resumen

**Se termina por:**

- **Retiro voluntario** (el jugador decide colgar los guantes).
- **Retiro forzado**: edad + declive severo (rendimiento se desploma), `careerDamage` crítico (riesgo de salud, narrado sin gore), o **nadie te ofrece peleas** (`weeksSinceLastOffer > OFFER_DROUGHT`).

**Pantalla de resumen (cruda, honesta, sin heroísmo):**

```
- Récord final: W-L-D (desglosado KO/sub/dec)
- Títulos ganados y defensas (o "ninguno" — la mayoría de las carreras)
- Plata total ganada / con qué te quedaste
- Peleas totales, rounds peleados
- Daño acumulado (traducido a rango cualitativo: "salís entero" ... "vas a sentir esto a los 50")
- Una línea final honesta sobre el estado en que quedaste, generada según edad/daño/títulos.
```

**Retirarse a tiempo** debe pesar: seguir por una bolsa más puede sumar daño que baja tu chin para siempre y empeora el resumen. El juego no premia estirar la carrera; premia leer el momento.

---

## 16. Bloque `TUNING` (todas las constantes en un lugar)

Este es el **contrato de balance**. `tuning.js` exporta este objeto; ningún módulo hardcodea un número que aparezca acá. Valores iniciales (se ajustan en §19 con datos):

```
// Atributos / caps
CAP_SPREAD=12, CAP_FLOOR=35, CAP_HARD_MAX=99, PLAYER_TALENT_FLOOR=50, CAP_APPROACH=25
TALENT_TRI = { min:40, mode:58, max:96 }

// Progresión
K_TECH=2.4, K_PHYS=1.6, COACH_RANGE=[0.8,1.3]
FATIGUE_ADD = { train:18, sparring:25, conditioning:20, grindwork:15, personal:5, rest:-35 }
REST_BASE=8

// Edad
AGE_BANDS = [
  {maxAge:27, growth:1.00, decay:{}},
  {maxAge:31, growth:0.50, decay:{}},
  {maxAge:35, growth:0.20, decay:{speed:2.5,recovery:2.0,cardio:1.5,power:1.0,strength:1.0,chin:1.0}},
  {maxAge:99, growth:0.05, decay:{speed:5.0,recovery:4.0,cardio:3.0,power:2.5,strength:2.5,chin:2.5}},
]
AGE_PHYS_FLOOR=20

// Lesiones / daño
BASE_RISK={train:0.005,sparring:0.045,conditioning:0.010,grindwork:0.003,rest:0,personal:0}
INJ_FATIGUE_K=2.0, DMG_KO_MULT=2.5
DMG_THRESHOLDS=[{d:600,pen:8},{d:1000,pen:18},{d:1500,pen:32}]

// Corte de peso
SAFE_FRAC=0.06, MAX_FRAC=0.11, CUT_CARDIO_K=320, CUT_CHIN_K=240, SIZE_EDGE_K=60
MISS_PURSE_PCT=0.25, MISS_FATIGUE=15

// Motor de pelea
T_TURNS=10, ROUNDS_NORMAL=3, ROUNDS_TITLE=5
K_LAND=0.09, K_POS=0.08, K_SUB=0.08, NOISE_SPAN=8, P_MIN=0.02, P_MAX=0.98
KO_BASE=0.06, KO_DMG_REF=18, KO_ACCUM_REF=120, KO_PMAX=0.35
TKO_DAMAGE_THRESHOLD=200, TKO_STOP_RANGE=120
CUT_STOP=0.75, CTRL_DMG_K=0.8
ACTION_DMG = { jab:5, cross:12, hook:13, legkick:7, knee:14, elbow:13, gnp:9, ... }
DOM_GAP=2.5, EVEN_GAP=0.3, JUDGE_NOISE=0.6

// Mundo / economía
DIVISIONS=[...8 con límites §13.1], WORLD_SIZE=400, ROOKIES_PER_YEAR≈50
ELO_K_BY_TIER=[24,20,16,12], PROMOTE_RATING=[...], CUT_LOSS_STREAK=3, OFFER_DROUGHT=52
TIER_PURSE_BASE=[0,400,3500,40000], WIN_BONUS_PCT=1.0, PURSE_RATING_K=1.5
FINISH_BONUS=[0,200,2000,25000], MANAGER_PCT=0.15, LIVING_COST=220, GRIND_PAY=180
GYM_FEE=[80,150,300,600]
```

---

## 17. RNG determinista con semilla

- **Ningún `Math.random` en el engine.** Un solo PRNG `mulberry32(seed)` en `rng.js`, inyectado en el `world`/la pelea.
- Cada carrera guarda su `seed`. Cada pelea deriva una sub-semilla (`hash(seed, fightId)`) para ser **reproducible**: útil para debug ("re-simular esta pelea") y **obligatorio** para el testing (correr 10k peleas reproducibles).
- El ruido de la sigmoide y todas las tiradas salen de este PRNG. Esto hace el testing headless determinista y las regresiones detectables.

---

## 18. Análisis anti-exploit

Se busca activamente la *degenerate strategy*. Si existe, **se corrige el engine, no se parchea la UI.**

1. **¿Actividad óptima única que hace irrelevantes las demás?**
   Mitigación de diseño: fatiga con rendimientos decrecientes (entrenar con fatiga alta rinde 20%), lesiones que escalan con fatiga, `room` que frena cada atributo cerca de su cap (no podés verter todo en uno y romperlo), y físicos que decaen con la edad hagas lo que hagas. No hay un slot que domine; el mix óptimo cambia con edad/fatiga/cap. **Se verifica midiendo (§19.5) que ninguna política fija de asignación de slots gane sistemáticamente.**

2. **¿Spamear descanso y entrenar infinito?**
   Descanso baja fatiga pero **no** para el reloj: cada semana envejecés, los físicos decaen, los caps limitan, y las ofertas se enfrían por inactividad. "Entrenar infinito" choca contra los caps ocultos (progreso→0) y contra la edad. **Verificado (§19.6):** carreras que solo descansan/entrenan sin pelear no llegan a nada (sin ranking, sin plata, retiro por sequía).

3. **¿Rechazar peleas indefinidamente rompe algo?**
   No: `weeksSinceLastOffer` sube, el matchmaking te despriorabiliza, las ofertas se secan y el retiro forzado por inactividad llega. **Verificado (§19.6).**

4. **¿Una táctica de round que gana siempre?**
   El diseño rock-paper-scissors suave (§11.5) + costo de stamina + dependencia de atributos/estado evita la dominante. **Verificado (§19.3):** ninguna intención fija supera un umbral de winrate contra IA que adapta; y `clamp(P_MAX=0.98)` impide victoria garantizada aun con ventaja enorme.

Cualquier hallazgo se documenta y se ajusta en `TUNING` o en la lógica del engine, nunca ocultándolo en la UI.

---

## 19. Plan de testing headless (Node, obligatorio antes de tocar UI)

Todos deterministas (semilla fija) y reproducibles. Criterios de aprobación:

- **19.1 Simetría (10.000 peleas entre idénticos).**
  Dos peleadores con atributos idénticos, política de decisión idéntica. Resultado esperado: **48–52% cada uno** (descartando empates, que también deben aparecer). Falla si el sesgo supera ±2%.

- **19.2 Distribución realista de campeones (200 carreras de 15 años, IA al azar).**
  200 peleadores-jugador jugando con decisiones aleatorias, 15 años cada uno. Esperado: **la mayoría no llega a título** (objetivo: <8% gana un cinturón mundial), la mayoría se retira sin título, curva de récords con forma realista (muchos records mediocres, pocos elite). Falla si "ganar el título" es común.

- **19.3 Nada garantiza la victoria.**
  Contra un rival muy inferior, con las mejores decisiones posibles, el winrate **nunca llega a 100%** (upsets ≥2% por el `P_MAX`). Y ninguna táctica de round fija supera `DOMINANT_WINRATE_MAX` (p. ej. 65%) en un torneo contra IA adaptativa entre iguales.

- **19.4 Economía no se rompe.**
  Sobre 200 carreras: **nadie** alcanza plata "infinita" (crecimiento del bankroll acotado por costos y carrera finita) y **nadie** queda atrapado en inanición inescapable (grindwork como piso). Distribución de plata final con forma razonable.

- **19.5 El declive por edad fuerza el retiro.**
  En las 200 carreras, el retiro se concentra en **34–39 años**; casi nadie sigue competitivo a los 40. Los físicos a los 37 deben estar medibles y significativamente por debajo de su pico.

- **19.6 Anti-exploit (§18).**
  Scripts dedicados que ejecutan las estrategias degeneradas (solo-descanso, solo-una-actividad, rechazar-todo, una-sola-táctica) y verifican que **ninguna** produce una carrera dominante. Salida: tabla de winrate/logros por estrategia; todas deben quedar bajo el umbral.

- **19.7 Rejugabilidad (dos carreras se sienten distintas).**
  Métrica objetiva: dada la misma semilla base pero distinta semilla de caps, la **distribución de caps** y la trayectoria de atributos difieren por encima de un umbral (distancia L1 entre perfiles de cap > X). No prueba "diversión" pero sí que los techos varían de verdad.

Ninguna UI se escribe hasta que 19.1–19.6 pasan.

---

## 20. Presupuesto de rendimiento

Requisito explícito: **peleas rápidas** (10.000 en testing; 400 peleadores avanzando cada semana en el móvil).

- **Turnos acotados:** 30 turnos (3 rounds) por pelea normal. 10k peleas = ~300k turnos.
- **Sin allocations en el loop caliente:** `FightState` y los acumuladores se reusan; los objetos de log solo se crean en modo verbose.
- **Modo silent para el mundo:** las peleas IA no arman strings. Solo contadores.
- **Una `exp` por intercambio resuelto** (sigmoide). El resto son sumas/multiplicaciones.
- **Objetivo:** una pelea silent en el orden de decenas de microsegundos; 10k peleas en **< 2 s** en Node; el `world.tick()` semanal (decenas de peleas IA + envejecimiento de 400 + ranking) **imperceptible** en un iPhone SE. Se mide en §19 y se ajusta `T_TURNS` si hace falta.
- **Ranking:** Elo O(1) por resultado; ordenar 8 divisiones de ~50 es trivial semanalmente.

---

## 21. Interfaz (esbozo — se detalla en Paso 5)

Mobile-first, portrait, mayores de 12, estética cartel de boxeo.

- **Estética:** fondo `#0a0a0b`, acento ámbar quemado `#c2410c`, texto blanco roto. Títulos en tipografía condensada tipo cartel; datos en sans neutral. **Sin emoji en la UI.** Sin las palabras "sitio web", "página", "navegador".
- **Cumplimiento App Store desde el día uno:** `viewport-fit=cover`, `user-scalable=no`, `safe-area-inset` en los cuatro bordes (notch + home indicator), **ningún tap target < 44×44 pt**, haptics (Capacitor Haptics) en golpes conectados y en el KO, jugable **100% offline**.
- **Pantallas núcleo:** Semana (asignar 3 slots), Gym (atributos en tiers + flechas de tendencia), Ofertas, Camp, Pelea (log round por round + selector de intención entre rounds), Ranking, Perfil/Carrera, Resumen final.
- El jugador **nunca** ve un número de atributo, de cap, de probabilidad ni de daño acumulado. Solo rangos cualitativos y estados.

---

## 22. Preguntas abiertas para el aprobador

Antes de cerrar el documento y pasar al Paso 2 (engine), decidí sobre esto:

1. **Nombres del mundo:** ¿genero nombres procedurales neutros para los 400 (para evitar parecerse a personas reales) o preferís una lista curada por región? Recomiendo procedurales neutros por seguridad legal y offline.
2. **Longitud de carrera objetivo (2–4 h):** ¿confirmás que una pelea disputada por el jugador tome ~30–60 s de lectura de log (round por round con decisión entre rounds)? Eso, con ~25–40 peleas por carrera, da el rango. Si querés carreras más largas, subo peleas o camps.
3. **Categorías de peso:** ¿8 divisiones con esos límites, o querés nombres/límites propios del juego (para no calcar una promotora real)?
4. **Divisiones femeninas / masculinas:** el diseño es agnóstico de género y funciona igual. ¿Una sola parrilla, o dos ramas? (Recomiendo una sola en v1, ampliable.)
5. **Moneda del juego:** ¿dólares genéricos o una moneda ficticia? (Sin dinero real / sin IAP en cualquier caso.)
6. **`TUNING` inicial:** los números de §16 son un punto de partida razonado; se van a mover con los datos del §19. ¿Los aprobás como base o hay algún valor que ya querés fijar distinto?

---

**Estado:** Documento de diseño v1 completo y listo para revisión. **No se escribe código hasta la aprobación.** Una vez cerrado esto, el Paso 2 es `rng.js` + `tuning.js` + `fighter.js` + `fight-engine.js` puros, seguido inmediatamente del testing headless del Paso 3 antes de cualquier UI.
