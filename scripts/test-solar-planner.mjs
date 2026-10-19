import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
async function importTS(path) {
  const source=await readFile(new URL(path,import.meta.url),'utf8')
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
}
const {DEFAULTS,DEFAULT_GEOMETRY,POWERWALL,simulate,monthlyComparison,storageOf,chargeLimitOf,withStorage,costOf,withoutSolar,isOffPeak}=await importTS('../lib/solar-planner/model.ts')
const {normalizeHourly}=await importTS('../lib/solar-planner/pvgis.ts')
const weather=JSON.parse(await readFile(new URL('../data/solar-planner/pvgis-2023.json',import.meta.url),'utf8'))
const near=(a,b,msg)=>assert.ok(Math.abs(a-b)<1e-7,`${msg}: ${a} != ${b}`)
function checkBalance(r,s) {
  let previous=0
  for(const h of r.hours) {
    near(h.potential+h.imports,h.demand-h.unserved+h.exports+h.curtailed+h.clipped+h.losses+h.soc-previous,`energy conservation hour ${h.index}`)
    near(h.demand,h.household+h.heating+h.hotWater+h.ev,'electrical demand excludes thermal output')
    assert.ok(h.soc>=-1e-9&&h.soc<=s.battery+1e-9,'capacity bounds')
    assert.ok(h.imports<=s.importLimit+1e-9&&h.exports<=s.exportLimit+1e-9,'connection limits')
    assert.ok(h.solarCharge+h.gridCharge<=s.chargePower+1e-9,'charge limit')
    assert.ok(h.discharge<=s.dischargePower+1e-9,'discharge limit')
    assert.ok(h.direct+h.exports+h.discharge<=s.inverter+1e-9,'shared AC output limit')
    if(h.discharge>1e-9)assert.ok(h.soc>=s.battery*s.reserve/100-1e-9,'reserve respected')
    assert.ok(!(h.discharge>1e-9&&(h.solarCharge+h.gridCharge)>1e-9),'no simultaneous cycling')
    previous=h.soc
  }
  near(r.totals.potential+r.totals.imports,r.totals.demand-r.totals.unserved+r.totals.exports+r.totals.curtailed+r.totals.clipped+r.totals.losses+r.finalStored,'annual balance')
  near(r.totals.ev+r.evUncharged,r.evRequired,'EV queue conservation')
}
test('complete cached PVGIS years and honest source metadata',async()=>{
  for(const year of [2021,2022,2023]) {
    const w=JSON.parse(await readFile(new URL(`../data/solar-planner/pvgis-${year}.json`,import.meta.url),'utf8'))
    assert.equal(w.hours.length,8760);assert.equal(w.year,year)
    assert.ok(w.source.includes('mountingplace=building'))
    assert.ok(w.hours.every(h=>h.length===2&&h.every(Number.isFinite)&&h[0]>=0))
  }
})
test('hourly and annual energy conserved for both arrays, all storage options and grid strategies',()=>{
  const storage=[withStorage(DEFAULTS,false,0),...[0,1,2,3].map(n=>withStorage(DEFAULTS,true,n))]
  for(const option of storage)for(const gridCharge of [false,true])for(const panels of [20,30]) {
    const s={...option,gridCharge,panels}
    checkBalance(simulate(weather,s),s)
  }
})
test('Powerwall 3 Expansion units follow the UK datasheet',()=>{
  assert.deepEqual([0,1,2,3].map(n=>storageOf(true,n)),[13.5,27,40.5,54])
  assert.equal(storageOf(false,2),0);assert.equal(storageOf(true,9),54,'at most 3 Expansion units')
  assert.equal(chargeLimitOf(0),POWERWALL.chargeAlone);assert.equal(chargeLimitOf(3),POWERWALL.chargeExpanded)
  assert.equal(DEFAULTS.battery,27);assert.equal(DEFAULTS.expansions,1);assert.equal(DEFAULTS.chargePower,8,'default is a Powerwall 3 with one Expansion unit')
  const alone=withStorage(DEFAULTS,true,0);assert.equal(alone.chargePower,5,'a Powerwall 3 alone charges at 5 kW')
  const one=withStorage(alone,true,1)
  assert.equal(one.battery,27);assert.equal(one.chargePower,8,'first Expansion raises a 5 kW rate to 8 kW')
  assert.equal(one.inverter,DEFAULTS.inverter,'Expansion adds no inverter output')
  assert.equal(withStorage({...one,chargePower:6},true,2).chargePower,6,'a custom rate carries over')
  assert.equal(withStorage(one,true,0).chargePower,5,'removing Expansion clamps to 5 kW')
  const none=withStorage(one,false,3);assert.equal(none.battery,0);assert.equal(none.expansions,0)
})
test('each Expansion unit adds storage that never increases imports',()=>{
  const runs=[0,1,2,3].map(n=>simulate(weather,withStorage(DEFAULTS,true,n)))
  for(let i=1;i<runs.length;i++){
    assert.ok(runs[i].totals.imports<=runs[i-1].totals.imports+1e-6,`imports with ${i} Expansion units`)
    assert.ok(runs[i].solarShare>=runs[i-1].solarShare-1e-9,`solar share with ${i} Expansion units`)
  }
  assert.ok(Math.max(...runs[3].hours.map(h=>h.soc))>27,'a full expanded system stores more than two units')
})
test('annual cost prices each hour of import at its tariff',()=>{
  const s=DEFAULTS,r=simulate(weather,s),c=costOf(r,s)
  let off=0,day=0
  for(const h of r.hours)(h.hour<6?(off+=h.imports):(day+=h.imports))
  near(c.offPeakKWh,off,'off-peak kWh');near(c.dayKWh,day,'day kWh')
  near(c.offPeakKWh+c.dayKWh,r.totals.imports,'every import is priced once')
  near(c.net,(off*s.offPeakRate+day*s.dayRate)/100,'net cost with no standing charge or export payment')
  assert.ok(isOffPeak(0)&&isOffPeak(5)&&!isOffPeak(6)&&!isOffPeak(23),'off-peak is 00:00 to 06:00')
  const paid=costOf(r,{...s,exportRate:15,standingCharge:50})
  near(paid.net,c.net+365*0.5-r.totals.exports*0.15,'standing charge and export payment')
})
test('solar and storage never cost more than buying everything from the grid',()=>{
  const base=simulate(weather,withoutSolar(DEFAULTS),0),plan=simulate(weather,DEFAULTS,20),more=simulate(weather,DEFAULTS,30)
  near(base.totals.imports,base.totals.demand,'baseline buys all demand')
  const [b,a,m]=[base,plan,more].map(r=>costOf(r,DEFAULTS).net)
  assert.ok(a<b,'the plan is cheaper than no solar');assert.ok(m<=a+1e-9,'a third row is no dearer')
})
test('zero solar starts empty, never contributes solar or free battery energy',()=>{
  const s={...DEFAULTS,panels:0}
  const r=simulate(weather,s);checkBalance(r,s)
  near(r.totals.solar,0,'no solar');near(r.totals.discharge,0,'no free discharge')
  near(r.totals.imports,r.totals.demand,'grid supplies all');near(r.solarShare,0,'zero solar share')
})
test('grid charged battery is not solar independence',()=>{
  const s={...DEFAULTS,panels:0,gridCharge:true}
  const r=simulate(weather,s);checkBalance(r,s)
  assert.ok(r.totals.gridDischarge>0);near(r.totals.solarDischarge,0,'no solar discharge');near(r.solarShare,0,'no solar credit')
})
test('zero battery has no charge, discharge or storage loss',()=>{
  const r=simulate(weather,{...DEFAULTS,battery:0})
  near(r.totals.discharge+r.totals.solarCharge+r.totals.gridCharge+r.totals.losses+r.finalStored,0,'no battery flows')
})
test('30 panels changes generation, not demand; imports do not increase',()=>{
  const a=simulate(weather,DEFAULTS,20),b=simulate(weather,DEFAULTS,30)
  near(a.totals.demand,b.totals.demand,'identical demand')
  assert.ok(b.totals.solar>a.totals.solar);assert.ok(b.totals.imports<=a.totals.imports)
  assert.ok(b.solarShare>=a.solarShare)
})
test('daylight EV charging honours availability, carries queue, and off removes load',()=>{
  const s={...DEFAULTS,charging:'daylight',homeDays:2,miles:30000,chargerPower:1}
  const r=simulate(weather,s);checkBalance(r,s);assert.ok(r.evUncharged>0)
  for(const h of r.hours)if(h.ev>0){assert.ok(h.hour>=10&&h.hour<16);assert.ok([0,6].includes(new Date(Date.UTC(weather.year,0,1)+h.index*3600000).getUTCDay()))}
  const off=simulate(weather,{...DEFAULTS,ev:false});near(off.totals.ev,0,'EV disabled')
  const away=simulate(weather,{...s,homeDays:0});near(away.totals.ev,0,'car always away');near(away.evUncharged,away.evRequired,'all charging outstanding')
})
test('cold weather reduces COP and increases heat intensity within the yearly allocation',()=>{
  const r=simulate(weather,DEFAULTS)
  const cold=r.hours.find(h=>h.temperature<0),warm=r.hours.find(h=>h.temperature>18)
  assert.ok(cold.cop<warm.cop);assert.ok(cold.spaceHeat>warm.spaceHeat)
  near(r.hours.reduce((sum,h)=>sum+h.spaceHeat,0),DEFAULTS.area*DEFAULTS.heatIntensity,'thermal target')
})
test('binding power limits flag unmet demand instead of creating energy',()=>{
  const s={...DEFAULTS,importLimit:0.2,exportLimit:0,inverter:2,chargePower:1,dischargePower:1}
  const r=simulate(weather,s);checkBalance(r,s);assert.ok(r.totals.unserved>0);near(r.totals.exports,0,'zero export')
})
test('100% reserve never discharges; zero demand never divides by zero',()=>{
  const r=simulate(weather,{...DEFAULTS,reserve:100});near(r.totals.discharge,0,'reserve')
  const z=simulate(weather,{...DEFAULTS,household:0,heatIntensity:0,hotWater:0,ev:false});near(z.solarShare,0,'empty demand');near(z.totals.demand,0,'empty demand')
})
test('PVGIS parser rejects incomplete or non-contiguous data',()=>{
  assert.throws(()=>normalizeHourly({outputs:{hourly:[]}},2023,DEFAULT_GEOMETRY,'test','test'),/Incomplete/)
  const rows=Array.from({length:8760},()=>({time:'20230101:0010',P:0,T2m:7}))
  assert.throws(()=>normalizeHourly({outputs:{hourly:rows}},2023,DEFAULT_GEOMETRY,'test','test'),/non-contiguous/)
})
test('monthly fallback reports only energy totals, no simulated dispatch',()=>{
  const rows=monthlyComparison({mode:'monthly',monthly:Array(12).fill(100)},DEFAULTS,20)
  assert.equal(rows.length,12);assert.ok(rows.every(r=>Number.isFinite(r.demand)&&r.solar===960&&!('imports' in r)&&!('soc' in r)))
})
console.log('Expansion units (20 panels):',[0,1,2,3].map(n=>{const r=simulate(weather,withStorage(DEFAULTS,true,n));return {expansions:n,kWh:13.5*(n+1),imports:Math.round(r.totals.imports),solarShare:Math.round(r.solarShare*100)}}))
console.log('Annual cost (£):',{none:Math.round(costOf(simulate(weather,withoutSolar(DEFAULTS),0),DEFAULTS).net),plan20:Math.round(costOf(simulate(weather,DEFAULTS,20),DEFAULTS).net),panels30:Math.round(costOf(simulate(weather,DEFAULTS,30),DEFAULTS).net)})
console.log('Default comparison:',[20,30].map(p=>{const r=simulate(weather,DEFAULTS,p);return {panels:p,generation:Math.round(r.totals.solar),demand:Math.round(r.totals.demand),imports:Math.round(r.totals.imports),solarShare:Math.round(r.solarShare*100)}}))
