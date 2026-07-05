const fs=require('fs'); let s=fs.readFileSync('engine.js','utf8');
const a=s.indexOf('  function buildRegions() {');
const b=s.indexOf('}', s.indexOf('return [', a)); // closing of return array
const end=s.indexOf('}', b+1); // closing of function
const newFn=`  function buildRegions() {
    // 12 estados de EE.UU. con datos diferenciados (poblacion absoluta, gdp/wage/land relativos)
    const mk=(id,name,pop,gdp,wage,land,tax,aff)=>({id,name,population:pop,gdpPerCapita:gdp,wealthIndex:gdp,wageLevel:wage,landPrice:land,landPrice0:land,taxRate:tax,demandMod:aff,saturation:0.5});
    return [
      mk('CA','California',     39.0e6,1.40,1.35,2.20,0.13,{tech:1.4,software:1.5,lujo:1.2,gastro:1.2}),
      mk('TX','Texas',          30.0e6,1.05,0.95,0.80,0.00,{energia:1.5,automotriz:1.1,metal:1.2,gastro:1.1}),
      mk('FL','Florida',        22.0e6,0.92,0.92,1.00,0.00,{retail:1.2,lujo:1.15,gastro:1.2,alimentos:1.1}),
      mk('NY','Nueva York',     19.5e6,1.50,1.40,2.40,0.109,{finanzas:1.5,lujo:1.3,retail:1.15,software:1.1}),
      mk('IL','Illinois',       12.6e6,1.10,1.10,1.10,0.0495,{alimentos:1.2,metal:1.1,retail:1.1}),
      mk('PA','Pensilvania',    12.9e6,1.00,1.00,0.90,0.0307,{metal:1.2,quimica:1.2,alimentos:1.1}),
      mk('OH','Ohio',           11.8e6,0.92,0.88,0.60,0.04,{automotriz:1.2,metal:1.2,muebles:1.1}),
      mk('GA','Georgia',        11.0e6,0.95,0.90,0.75,0.0575,{textil:1.3,alimentos:1.1,retail:1.1}),
      mk('NC','Carolina N.',    10.7e6,0.95,0.90,0.80,0.045,{textil:1.3,muebles:1.3,tech:1.1}),
      mk('MI','Michigan',       10.0e6,0.90,0.95,0.60,0.0425,{automotriz:1.6,metal:1.3,electronica:1.1}),
      mk('WA','Washington',     7.8e6, 1.45,1.30,1.60,0.00,{tech:1.4,software:1.5,electronica:1.2}),
      mk('AZ','Arizona',        7.4e6, 0.92,0.92,0.85,0.025,{semis:1.3,electronica:1.2,energia:1.1}),
    ];
  }`;
s = s.slice(0,a) + newFn + s.slice(end+1);
fs.writeFileSync('engine.js', s);
console.log('buildRegions reemplazado');
