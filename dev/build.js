/* Construye el index.html autocontenido: shell + engine (testeado) + UI, todo inline. */
const fs = require('fs');
const path = require('path');
const here = __dirname;
const engine = fs.readFileSync(path.join(here, 'engine.js'), 'utf8');
const ui = fs.readFileSync(path.join(here, 'ui.js'), 'utf8');

const CSS = `
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;padding:0}
body{background:#0a0806;color:#e9e1d4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.4;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
.wrap{max-width:520px;margin:0 auto;min-height:100vh;position:relative;background:#0c0a07}
.tabular,.big,input,.kv span,.mini div,table{font-variant-numeric:tabular-nums}
.amber{color:#f59e0b}.good{color:#3ddc84}.bad{color:#ff5a52}.warn{color:#f5b942}.muted{color:#938a7a}
.sm{font-size:12.5px}.ctr{text-align:center}
/* header */
header{position:sticky;top:0;z-index:30;background:#100c08;border-bottom:1px solid #2a2014;padding:8px 12px}
.brand{display:flex;align-items:center;gap:8px}
.logo{font-weight:800;letter-spacing:1px;color:#f59e0b;font-size:18px}
.logo b{color:#e9e1d4;font-weight:800}
.hstg{margin-left:auto;font-size:11px;color:#cdbfa8;background:#1c1509;border:1px solid #3a2c14;padding:2px 8px;border-radius:20px;letter-spacing:.5px}
.hrow{display:flex;gap:6px;align-items:center;margin-top:7px;flex-wrap:wrap}
.chip{font-size:11px;background:#181206;border:1px solid #322512;color:#cdbfa8;padding:2px 7px;border-radius:6px}
.chip.good{color:#3ddc84;border-color:#1c4a30}.chip.bad{color:#ff5a52;border-color:#5a2020}.chip.warn{color:#f5b942;border-color:#5a4516}
.hdate{font-size:12px;color:#938a7a}
#speed{display:flex;gap:4px;margin-left:auto}
.sbtn{background:#181206;border:1px solid #322512;color:#cdbfa8;border-radius:7px;padding:4px 9px;font-size:13px;cursor:pointer;min-width:34px}
.sbtn.on{background:#f59e0b;color:#1a1206;border-color:#f59e0b;font-weight:700}
/* view */
#view{padding:12px 12px 90px}
.card{background:#13100b;border:1px solid #271e12;border-radius:12px;padding:12px;margin-bottom:10px}
.card.hero{background:linear-gradient(160deg,#1a1308,#13100b);border-color:#3a2c14}
.ttl{font-weight:700;margin-bottom:8px;font-size:14px;color:#f0e6d4}
.big{font-size:30px;font-weight:800;color:#f59e0b;margin:2px 0 6px;letter-spacing:-.5px}
.row{display:flex;gap:8px;align-items:center;justify-content:space-between;margin:6px 0}
.row3{display:flex;gap:6px;margin-top:6px}.row3 .btn{flex:1}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
.kv{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #1e1710}
.mini{background:#0e0b07;border:1px solid #241b10;border-radius:8px;padding:6px 8px}
.mini .muted{font-size:11px}
.bar{height:8px;background:#241b10;border-radius:20px;overflow:hidden;margin:5px 0}
.bar>div{height:100%;background:linear-gradient(90deg,#b45309,#f59e0b);border-radius:20px;transition:width .25s}
.mini-bar{flex:1;height:7px;margin:0 6px}
.alert{border-radius:10px;padding:9px 11px;margin-bottom:10px;font-size:13px;border:1px solid}
.alert.bad{background:#2a0f0c;border-color:#5a2020;color:#ff8a82}
.alert.warn{background:#241a06;border-color:#5a4516;color:#f5c970}
.alert.good{background:#0c2417;border-color:#1c4a30;color:#5fe39a}
.logl{padding:3px 0;border-bottom:1px solid #1a140d}
.btn{background:#1c1509;border:1px solid #3a2c14;color:#e9e1d4;border-radius:9px;padding:9px 12px;font-size:14px;cursor:pointer;min-height:40px}
.btn:active{transform:translateY(1px)}
.btn.pri{background:#f59e0b;color:#1a1206;border-color:#f59e0b;font-weight:700;width:100%}
.btn.ghost{background:transparent;color:#cdbfa8}
.btn.danger{color:#ff7a72;border-color:#5a2020}
.co{cursor:pointer}
canvas{max-width:100%;display:block}
.srow{display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid #1a140d}
.srow>span:first-child{min-width:96px}
.lrow{padding:8px 0;border-bottom:1px solid #1e1710}
.fb{margin:5px 0}
.lbl{min-width:88px;color:#938a7a;font-size:13px}
input,select,textarea{background:#0e0b07;border:1px solid #3a2c14;color:#f0e6d4;border-radius:8px;padding:9px;font-size:15px;flex:1;width:100%;font-family:inherit}
textarea{width:100%;resize:vertical}
.chk{display:flex;align-items:center;gap:8px;font-size:13px;color:#cdbfa8;margin:6px 0;cursor:pointer}
.chk input{flex:0;width:auto}
.tnode{background:#0e0b07;border:1px solid #241b10;border-radius:9px;padding:9px;margin-bottom:7px}
.tnode.done{border-color:#1c4a30}.tnode.lock{opacity:.55}
/* nav */
#nav{position:fixed;bottom:0;left:0;right:0;max-width:520px;margin:0 auto;display:flex;background:#100c08;border-top:1px solid #2a2014;z-index:30}
.navit{flex:1;flex-shrink:0;text-align:center;padding:8px 2px 7px;cursor:pointer;color:#7a7263;font-size:10px;border-top:2px solid transparent}
.navit .ic{font-size:18px;display:block;line-height:1.1}
.navit.on{color:#f59e0b;border-top-color:#f59e0b}
/* modal */
#modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:50;align-items:center;justify-content:center;padding:16px}
#modalBox{background:#15110b;border:1px solid #3a2c14;border-radius:14px;max-width:480px;width:100%;max-height:88vh;overflow:auto}
.mhead{font-weight:800;font-size:17px;padding:14px;border-bottom:1px solid #271e12}
.mhead.warn{color:#f5b942}.mhead.bad{color:#ff5a52}
.mbody{padding:14px}
.mdesc{font-size:14px;color:#cdbfa8;margin-bottom:12px;line-height:1.5}
.mfoot{padding:12px 14px;display:flex;gap:8px;border-top:1px solid #271e12}
.mfoot .btn{flex:1}
.evb{display:block;width:100%;text-align:left;margin-bottom:8px}
/* onboard */
#onboard{display:none;min-height:100vh;flex-direction:column;align-items:center;justify-content:center;padding:24px;max-width:520px;margin:0 auto;text-align:center}
#onboard .logo{font-size:40px;margin-bottom:4px}
.tag{color:#938a7a;font-size:14px;margin-bottom:20px;line-height:1.5}
.obcard{background:#13100b;border:1px solid #271e12;border-radius:12px;padding:16px;width:100%;text-align:left}
.tips{font-size:12.5px;color:#938a7a;margin-top:16px;line-height:1.6;text-align:left}
.toast{position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(20px);background:#2a2014;color:#f0e6d4;border:1px solid #5a4516;padding:10px 16px;border-radius:10px;font-size:13px;opacity:0;pointer-events:none;transition:.25s;z-index:60;max-width:90%}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.toolbar{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.toolbar .btn{flex:1;font-size:12px;padding:7px;min-height:0}
`;

const HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="theme-color" content="#100c08">
<title>MAGNATE · Simulador Económico</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">

  <!-- ONBOARDING -->
  <div id="onboard">
    <div class="logo">MAG<b>NATE</b></div>
    <div class="tag">Arrancás endeudado y sin nada.<br>Tu camino: deuda estudiantil → primer negocio → corporación → holding en bolsa → <span class="amber">trillonario</span>.</div>
    <div class="obcard">
      <div class="row"><span class="lbl">Dificultad</span>
        <select id="ob_diff">
          <option value="facil">Fácil (efectivo inicial $15K)</option>
          <option value="normal" selected>Normal (efectivo inicial $8K)</option>
          <option value="dificil">Difícil (efectivo inicial $4K)</option>
        </select>
      </div>
      <div class="row"><span class="lbl">Semilla</span><input type="number" id="ob_seed" placeholder="(aleatoria)"></div>
      <button class="btn pri" onclick="MG.startNew()">Comenzar partida</button>
      <div class="toolbar"><button class="btn ghost" onclick="MG.importSave()">Importar código</button></div>
    </div>
    <div class="tips">
      <b style="color:#cdbfa8">Primeras decisiones</b><br>
      • Pagá la deuda estudiantil al día: construye tu score crediticio.<br>
      • Abrí un negocio chico accesible (food truck, tienda de barrio o software indie).<br>
      • Elegí un estado grande (California, Texas) para más alcance de mercado.<br>
      • Fijá un precio con margen y subí marketing de a poco.<br>
      • El tiempo avanza con ▶ / ⏩. Pausá para decidir tranquilo.
    </div>
  </div>

  <!-- GAME -->
  <div id="game" style="display:none">
    <header>
      <div class="brand">
        <div class="logo">MAG<b>NATE</b></div>
        <div class="hstg" id="hStage">—</div>
      </div>
      <div class="hrow">
        <span class="hdate" id="hDate">—</span>
        <span class="chip warn" id="hPhase">—</span>
        <div id="speed">
          <button class="sbtn" data-sp="0" onclick="MG.setSpeed(0)">⏸</button>
          <button class="sbtn" data-sp="1" onclick="MG.setSpeed(1)">▶</button>
          <button class="sbtn" data-sp="10" onclick="MG.setSpeed(10)">⏩</button>
        </div>
      </div>
      <div class="hrow">
        <span class="chip">Infl <span id="hInfl" class="warn">—</span></span>
        <span class="chip">Tasa <span id="hRate" class="amber">—</span></span>
        <span class="chip">Bolsa <span id="hIdx">—</span></span>
      </div>
    </header>

    <div id="view"></div>

    <div id="nav">
      <div class="navit on" data-tab="dash" onclick="MG.go('dash')"><span class="ic">▦</span>Resumen</div>
      <div class="navit" data-tab="empresas" onclick="MG.go('empresas')"><span class="ic">🏭</span>Empresas</div>
      <div class="navit" data-tab="mercado" onclick="MG.go('mercado')"><span class="ic">⚔</span>Mercado</div>
      <div class="navit" data-tab="finanzas" onclick="MG.go('finanzas')"><span class="ic">🏦</span>Finanzas</div>
      <div class="navit" data-tab="inversiones" onclick="MG.go('inversiones')"><span class="ic">📈</span>Inversión</div>
      <div class="navit" data-tab="id" onclick="MG.go('id')"><span class="ic">⚗</span>I+D</div>
    </div>
  </div>

  <div id="modal"><div id="modalBox"></div></div>
  <div id="toast" class="toast"></div>
</div>

<script>${engine}</script>
<script>${ui}</script>
</body>
</html>
`;

fs.writeFileSync(path.join(here, '..', 'index.html'), HTML, 'utf8');
console.log('index.html escrito (' + HTML.length + ' bytes).');
