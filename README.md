# CAGE

Simulación de carrera de peleador de MMA para móvil. Sos el peleador, no el manager.
Empezás como amateur sin nombre en un gym de barrio; el objetivo es llegar a campeón mundial
antes de que el cuerpo se te termine. La mayoría de las carreras terminan sin título. El juego
respeta eso.

No es un juego de pelea con controles. Las peleas se resuelven round por round y la tensión está
en las decisiones: a qué rival le decís que sí, cuándo bajás de peso, cuándo entrenás lesionado.

## Stack

- HTML + CSS + JavaScript vanilla en módulos ES. **Sin frameworks, sin build step, sin dependencias
  externas, sin CDN, sin red.** Todo local, jugable 100% offline.
- Estructura Capacitor: `www/index.html`, `www/css/`, `www/js/` (engine + ui + platform).
- Persistencia: Capacitor Preferences con fallback a `localStorage` (para testear en browser).
- Portrait, mobile-first, iPhone SE (375px) → Pro Max. Safe-area en los cuatro bordes,
  `viewport-fit=cover`, `user-scalable=no`, tap targets ≥ 44×44, haptics en golpes y KO.

## Estructura

```
www/
  index.html
  css/style.css
  js/
    engine/            # motor puro, SIN DOM (corre headless en Node)
      rng.js           # PRNG con semilla (mulberry32), serializable
      tuning.js        # BLOQUE TUNING — unica fuente de constantes de balance
      attributes.js    # atributos + mapeo valor→texto cualitativo (sin numeros)
      fighter.js       # creacion, caps ocultos, atributos efectivos
      progression.js   # entrenamiento, fatiga, declive por edad, eventos mentales
      injury.js        # lesiones agudas, dano cerebral acumulado permanente
      fight-engine.js  # simulacion round-por-round (verbose/silent) + controlador interactivo
      judges.js        # scoring 10-9, tres jueces con sesgos ocultos
      calendar.js      # semana / fecha real
      economy.js       # bolsas, bonus, costos
      world.js         # 400 peleadores, matchmaking, ranking, promotoras, envejecimiento
      career.js        # orquestacion del ciclo semanal del jugador
      save.js          # serializacion de la partida
      names.js         # nombres procedurales neutros
    platform/
      storage.js       # Capacitor Preferences + fallback localStorage
      haptics.js       # Capacitor Haptics + fallback vibrate/no-op
    ui/                # UI, escrita SOBRE el engine ya probado
      app.js           # router + render de pantallas
      view.js          # helpers de render cualitativo
docs/
  DESIGN.md            # documento de diseno completo (formulas, curvas, balance)
  screens/             # capturas
test/                  # testing headless en Node (criterios §19 del diseno)
tools/
  generate-assets.mjs  # genera icon.png / splash.png (sin dependencias)
capacitor.config.json
```

## Correr en el navegador (desarrollo)

No hay build step. Serví la carpeta `www/` con cualquier servidor estático:

```
npx serve www          # o: python3 -m http.server -d www 8080
```

En browser, la persistencia usa `localStorage` y los haptics usan `navigator.vibrate` (o no-op).

## Testing headless (engine)

El motor corre sin DOM. La suite valida los criterios del documento de diseño (§19):

```
npm test
```

Cubre: simetría (10.000 peleas idénticas ≈ 50/50), 350+ carreras completas de 15 años,
nada garantiza la victoria, ninguna táctica de round domina, anti-exploit de estrategias
degeneradas, economía acotada, y que el declive por edad fuerza el retiro.

## Empaquetar como app nativa (iOS / Android)

El runtime del juego no tiene build step; Capacitor sólo envuelve `www/` en un shell nativo.

```
npm install                      # instala los paquetes de Capacitor (dev/native)
npx cap add ios                  # y/o: npx cap add android
npm run cap:assets               # genera iconos/splash desde resources/ (requiere @capacitor/assets)
npx cap sync
npx cap open ios                 # abre Xcode  (open android para Android Studio)
```

`capacitor.config.json` ya fija `webDir: www`, el color de fondo `#0a0a0b` y el splash.
Los plugins nativos usados (Haptics, Preferences, SplashScreen) se detectan en runtime vía
`window.Capacitor`; en browser hay fallback, así que la misma base corre en los dos lados.

## Diseño

El documento de diseño completo (modelo del peleador, caps ocultos, fórmulas exactas de
progresión y declive, motor de pelea, jueces, mundo simulado, economía, y el bloque de balance)
está en [`docs/DESIGN.md`](docs/DESIGN.md).
