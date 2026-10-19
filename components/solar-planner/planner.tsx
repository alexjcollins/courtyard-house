"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowUpRight, ArrowRight, Sun, RotateCcw, SlidersHorizontal, ChevronDown, ChevronLeft, ChevronRight, Info, Download } from "lucide-react"
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ReferenceArea } from "recharts"
import { DEFAULTS, DEFAULT_GEOMETRY, DEFAULT_SCENARIO, SCENARIOS, MONTHS, POWERWALL, simulate, fraction, monthlyComparison, chargeLimitOf, withStorage, costOf, withoutSolar, type Cost, type Settings, type Geometry, type Weather, type WeatherData, type Simulation } from "@/lib/solar-planner/model"
import { FlowDiagram } from "./flow-diagram"
import { HouseFigure } from "./house-figure"
import { PartControls, PART_NAMES, type SystemPart, type StorageImpact } from "./controls"

const fmt=(n:number)=>Math.round(n).toLocaleString("en-GB")
const pct=(n:number)=>`${Math.round(n*100)}%`
const money=(n:number)=>`${Math.round(n)<0?"−":""}£${Math.abs(Math.round(n)).toLocaleString("en-GB")}`
const energy=(n:number)=>`${fmt(n)} kWh`
const yearDays=(year:number)=>(Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/86400000
const sameGeometry=(a:Geometry,b:Geometry)=>a.pitch===b.pitch&&a.aspect===b.aspect&&a.loss===b.loss&&a.mounting===b.mounting
const chartColours={solar:"#ee6b32",solar30:"#e4b074",demand:"#303a39",grid:"#587ba5",battery:"#43836a"}
const storageLabel=(s:Settings)=>s.battery>0?`a Powerwall 3${s.expansions?` with ${s.expansions} Expansion unit${s.expansions>1?"s":""}`:""} (${s.battery} kWh)`:"no battery"
// A month counts as fully off-grid when the hourly model imports nothing from the grid in it
// (under half a kWh across the month, which rounds to zero).
const OFF_GRID_KWH=0.5
const listMonths=(months:string[])=>months.length<=1?months.join(""):`${months.slice(0,-1).join(", ")} and ${months[months.length-1]}`
const seasons=[{name:"Winter",months:[11,0,1]},{name:"Summer",months:[5,6,7]},{name:"Shoulder",months:[2,3,4,8,9,10]}]

function ComparisonCard({result,watts,cost}: {result:Simulation;watts:number;cost:Cost}) {
  const t=result.totals
  return <article className={`sp-comparison ${result.panels===30?"sp-comparison-larger":"sp-comparison-plan"}`}>
    <div className="sp-comparison-top"><span className="sp-eyebrow">{result.panels===20?"THE PLAN · TWO ROWS":"LONG-TERM HORIZON · A THIRD ROW"}</span><Sun size={22}/></div>
    <h3>{result.panels} panels <span>{(result.panels*watts/1000).toFixed(1)} kWp</span></h3>
    <div className="sp-big-percent">{pct(result.solarShare)}<span>of electricity demand<br/>supplied by solar</span></div>
    <div className="sp-share-track"><span style={{width:pct(result.solarShare)}}/></div>
    <div className="sp-cost-line"><strong>{money(cost.net)}</strong><span>{cost.net<0?"a year in credit, after export payments":"a year on electricity"}<br/>{energy(cost.offPeakKWh)} off-peak · {energy(cost.dayKWh)} at the day rate</span></div>
    <dl className="sp-metrics">
      <div><dt>Annual generation¹</dt><dd>{energy(t.solar)}</dd></div>
      <div><dt>Annual demand</dt><dd>{energy(t.demand)}</dd></div>
      <div><dt>Grid imports</dt><dd>{energy(t.imports)}</dd></div>
      <div><dt>Grid exports</dt><dd>{energy(t.exports)}</dd></div>
      <div><dt>Solar used by the home²</dt><dd>{pct(result.selfConsumption)}</dd></div>
      <div><dt>Clipped / curtailed</dt><dd>{energy(t.clipped+t.curtailed)}</dd></div>
    </dl>
    <p className="sp-verdict">{t.solar>=t.demand?"Annual generation exceeds demand.":`Annual generation falls ${energy(t.demand-t.solar)} short.`} {t.imports>1?"Grid supply is still needed.":"Check winter and peak-load limits below."}</p>
  </article>
}
const SEASON_DAYS=[["01-15","Winter"],["04-15","Spring"],["06-21","Summer"],["10-15","Autumn"]] as const
/** The simulation day ("MM-DD" within the weather year), shared by the explorer and the hourly chart. */
function DayPicker({year,day,setDay,label="Simulation day"}: {year:number;day:string;setDay:(day:string)=>void;label?:string}) {
  const at=Date.parse(`${year}-${day}T00:00:00Z`)
  const shift=(days:number)=>{const next=new Date(at+days*86400000);if(next.getUTCFullYear()===year)setDay(next.toISOString().slice(5,10))}
  return <div className="sp-date-row">
    <div className="sp-date-pick">
      <label>{label} <input type="date" value={`${year}-${day}`} min={`${year}-01-01`} max={`${year}-12-31`} onChange={e=>{if(e.target.value)setDay(e.target.value.slice(5))}}/></label>
      <span className="sp-day-step">
        <button type="button" aria-label="Previous day" disabled={day==="01-01"} onClick={()=>shift(-1)}><ChevronLeft size={14}/></button>
        <button type="button" aria-label="Next day" disabled={day==="12-31"} onClick={()=>shift(1)}><ChevronRight size={14}/></button>
      </span>
    </div>
    <div className="sp-season-buttons">{SEASON_DAYS.map(([v,name])=><button type="button" key={v} onClick={()=>setDay(v)} className={day===v?"active":""}>{name}</button>)}</div>
  </div>
}
function SeasonalTable({a,b,year}: {a:Simulation;b:Simulation;year:number}) {
  return <div className="sp-table-wrap"><table className="sp-season-table"><caption>Seasonal averages · kWh per day</caption><thead><tr><th>Season</th><th>Demand</th><th>20 panels<br/><small>the plan</small></th><th>30 panels<br/><small>if needed later</small></th><th>Solar supplies demand<br/>20 / 30 panels</th></tr></thead><tbody>
    {seasons.map(season=>{
      const sum=(r:Simulation,key:"solar"|"demand"|"direct"|"solarDischarge")=>season.months.reduce((n,m)=>n+r.monthly[m][key],0)
      const days=season.months.reduce((n,m)=>n+new Date(Date.UTC(year,m+1,0)).getUTCDate(),0)
      return <tr key={season.name}><th>{season.name}</th><td>{(sum(a,"demand")/days).toFixed(1)}</td><td>{(sum(a,"solar")/days).toFixed(1)}<small>{sum(a,"solar")>=sum(a,"demand")?"Energy surplus":"Energy shortfall"}</small></td><td>{(sum(b,"solar")/days).toFixed(1)}<small>{sum(b,"solar")>=sum(b,"demand")?"Energy surplus":"Energy shortfall"}</small></td><td>{pct(fraction(sum(a,"direct")+sum(a,"solarDischarge"),sum(a,"demand")))} / {pct(fraction(sum(b,"direct")+sum(b,"solarDischarge"),sum(b,"demand")))}</td></tr>
    })}
  </tbody></table></div>
}
function Sources({data}: {data:WeatherData}) {
  return <details className="sp-sources" id="sources"><summary><span>Sources, assumptions & model boundaries</span><ChevronDown size={18}/></summary><div className="sp-source-grid">
    <section><h3>What the project tells us</h3><p><b>HOUSE_BRIEF.md:</b> 205 m² house, 45 m² garage and an external courtyard. <b>data/project.json:</b> three gabled volumes with flat links, ASHP + UFH, local mechanical extract, EV charging, and PV/battery planned for phase two.</p><p className="sp-source-warning"><b>Conflicting areas:</b> the older project JSON and supplied prompt use 210 m² house / 40 m² garage. The floor-plan image also has different room and courtyard areas (31.7 m² courtyard versus the brief’s 25 m²). We use the designated written brief’s 205 m², excluding garage and courtyard; confirm against the final drawings.</p><p>The floor plan does not verify roof pitch, compass direction, shading or usable panel area. South-facing, 35° and no local shading are provisional. Two occupants, daily bath/shower, I-Pace and single-phase supply come from your prompt.</p></section>
    <section><h3>Solar resource & equipment</h3><p><a href="https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5/api-non-interactive-service_en" target="_blank" rel="noreferrer">European Commission PVGIS 5.3 ↗</a> · SARAH3 solar / ERA5 temperature, approximate site 51.10° N, 0.64° E. {data.mode==="hourly"?`${data.year} weather year, ${fmt(data.hours.length)} continuous hourly bins.`:"Monthly climatology fallback; not the selected individual weather year."} Terrain horizon enabled; crystalline silicon, 1 kWp scaled to panel count. {data.geometry.pitch}° pitch, azimuth {data.geometry.aspect}° (0° = south), {data.geometry.loss}% system losses.</p><p>{data.geometry.mounting==="building"?"Building-integrated thermal model: conservative for close-mounted roof panels. A ventilated rack may perform differently.":"Free-air thermal model assumes a ventilated roof rack; confirm ventilation with the installer."} <a href={data.source} target="_blank" rel="noreferrer">Underlying PVGIS request ↗</a> · retrieved {data.retrievedAt.slice(0,10)}.</p><p><a href="https://aikosolar.com/en/products/neostar-pro-3splus54-dual-glass/" target="_blank" rel="noreferrer">AIKO NEOSTAR 3S+54 ↗</a>: 480 W is the brief’s chosen rating; verify the exact UK all-black SKU. Approximately 1.762 × 1.134 m each means about 40 / 60 m² of modules for 20 / 30 panels, before spacing, setbacks or roof obstructions. No bifacial gain is included.</p><p><a href="https://energylibrary.tesla.com/docs/Public/EnergyStorage/Powerwall/3/Datasheet/en-uk/Powerwall-3-Datasheet-EN.pdf" target="_blank" rel="noreferrer">Tesla UK Powerwall 3 datasheet ↗</a>: integrated inverter and 13.5 kWh usable per Powerwall 3; up to 3 Expansion units, each another 13.5 kWh (54 kWh in all); configurable output up to 11.04 kW, which Expansion units do not add to because they have no inverter; continuous charge 5 kW alone, configurable up to 8 kW with Expansion units. The “what each pack adds” comparison carries your charge rate across, clamped to each option’s limit and raised to 8 kW when Expansion is first added. The model’s 90% additional AC-equivalent storage round trip is an assumption, not Tesla’s DC solar-to-home efficiency metric.</p></section>
    <section><h3>How this calculation works</h3><p>Every hour: solar serves current demand, charges the battery, then exports up to the limit. Excess is curtailed. The battery covers deficits above its reserve; imports cover what remains within the connection limit. A shared inverter output cap applies to PV plus battery discharge. PV above that cap is clipped before storage: this conservative AC-equivalent model does not capture Powerwall’s possible DC charging of clipped PV.</p><p>The battery starts empty, including reserve. Charge and discharge each apply the square root of round-trip efficiency. Solar and grid energy are tracked separately in storage and withdrawn proportionally. End-of-year energy stays in the battery. Optional grid charging runs 00:00–05:00, never counts as solar, and suppresses discharge in that window.</p><p>Hours, charging windows and the 00:00–06:00 off-peak tariff window use GMT/UTC throughout, not summer clock time. Costs price each hour’s grid import at the rate for that hour; the comparison with no solar or battery uses the same home, weather and tariff, with the car still charging overnight. PVGIS :10 timestamps are assigned to their hourly bins. kW is hourly average power; one hour at 1 kW equals 1 kWh. Sub-hour peaks, detailed thermal mass, immersion cycles, degradation, outages, tariffs and financial payback are outside the model.</p><p>Heating follows degree-hours below 15.5°C, normalised to the chosen annual heat demand. COP changes by 0.06 per °C around 7°C, bounded 1.5–5.5; hot-water COP changes by 0.035 per °C, bounded 1.4–4. These are planning curves. Weather-year sensitivity changes solar timing and COP, not the chosen annual useful heat.</p></section>
    <section><h3>Before making the decision</h3><p>Low/base/high scenarios are assumptions, not measured predictions: household 2,500 / 3,500 / 5,000 kWh; space heat 25 / 45 / 75 kWh/m²; COP at 7°C 4 / 3.5 / 2.8; hot water 6 / 8 / 11 kWh heat/day; driving 5,000 / 8,000 / 12,000 miles.</p><p>EV consumption includes a separate charging-loss factor. Charging queues carry over when the car is away; an outstanding queue is reported rather than hidden. Import shortfalls are unmet electricity, not energy savings. The monthly fallback uses coarse seasonal heating and a fixed COP; it reports no storage or self-sufficiency estimates.</p><p><a href="https://www.ukpowernetworks.co.uk/new-electricity-connections/distributed-energy-resources-der-generation/helpful-resources-and-quick-links" target="_blank" rel="noreferrer">UK Power Networks connection guidance ↗</a>: have the installer confirm DNO requirements, permissible export, the main fuse, string voltage/current/MPPT layout, roof structure and fire/access setbacks. Backup scope requires an approved circuit design.</p><p><b>The most useful missing measurements:</b> final roof elevations and shading survey; room-by-room heat-loss/SAP results; actual annual mileage and times the car is home; and the installer’s confirmed inverter, connection and export settings.</p></section>
  </div></details>
}

export function SolarPlanner({initialWeather}: {initialWeather:Weather}) {
  const [s,setSettings]=useState<Settings>(DEFAULTS)
  const [geometry,setGeometryState]=useState<Geometry>(DEFAULT_GEOMETRY)
  const [year,setYear]=useState(2023)
  const [data,setData]=useState<WeatherData>(initialWeather)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState("")
  const [retry,setRetry]=useState(0)
  const [scenario,setScenario]=useState<string>(DEFAULT_SCENARIO)
  const [selected,setSelected]=useState<SystemPart>("solar")
  const [day,setDay]=useState("06-21")
  const [hour,setHour]=useState(12)
  const set=(patch:Partial<Settings>)=>{setSettings(prev=>({...prev,...patch}));setScenario("Custom")}
  const setGeometry=(patch:Partial<Geometry>)=>setGeometryState(prev=>({...prev,...patch}))
  useEffect(()=>{
    if(year===initialWeather.year&&sameGeometry(geometry,initialWeather.geometry)) {setData(initialWeather);setLoading(false);setError("");return}
    const controller=new AbortController()
    setLoading(true);setError("")
    const timer=setTimeout(()=>{
      const query=new URLSearchParams({year:String(year),pitch:String(geometry.pitch),aspect:String(geometry.aspect),loss:String(geometry.loss),mounting:geometry.mounting})
      fetch(`/api/solar-planner/weather?${query}`,{signal:controller.signal}).then(async response=>{
        const next=await response.json();if(!response.ok)throw new Error(next.error||"Weather request failed");return next as WeatherData
      }).then(next=>{if(!controller.signal.aborted){setData(next);setLoading(false)}}).catch((e:Error)=>{if(!controller.signal.aborted){setError(e.message);setLoading(false)}})
    },450)
    return ()=>{clearTimeout(timer);controller.abort()}
  },[year,geometry,initialWeather,retry])
  const ready=!loading&&!error&&data.year===year&&sameGeometry(geometry,data.geometry)
  const results=useMemo(()=>{
    if(data.mode!=="hourly")return null
    const a=simulate(data,s,20),b=simulate(data,s,30),base=simulate(data,withoutSolar(s),0)
    const cost={a:costOf(a,s),b:costOf(b,s),base:costOf(base,s)}
    return {a,b,cost,explorer:s.panels===20?a:s.panels===30?b:simulate(data,s)}
  },[data,s])
  const monthly=useMemo(()=>{
    if(results)return results.a.monthly.map((m,i)=>{const b=results.b.monthly[i];return {month:m.month,solar20:m.solar,solar30:b.solar,demand:m.demand,imports20:m.imports,imports30:b.imports,off20:m.imports<OFF_GRID_KWH,off30:b.imports<OFF_GRID_KWH}})
    if(data.mode==="monthly") {const a=monthlyComparison(data,s,20),b=monthlyComparison(data,s,30);return a.map((m,i)=>({month:m.month,solar20:m.solar,solar30:b[i].solar,demand:m.demand}))}
    return []
  },[results,data,s])
  const offGrid=useMemo(()=>{
    if(!results)return null
    const rows=monthly as {month:string;imports20?:number;off20?:boolean;off30?:boolean}[]
    const plan=rows.filter(m=>m.off20).map(m=>m.month), later=rows.filter(m=>m.off30&&!m.off20).map(m=>m.month)
    const closest=rows.reduce((best,m)=>(m.imports20??Infinity)<(best.imports20??Infinity)?m:best,rows[0])
    return {plan,later,closest}
  },[results,monthly])
  // What each storage option does for the same home, panels and weather: the "what each pack adds" list.
  const storageImpact=useMemo<StorageImpact[]|undefined>(()=>{
    if(selected!=="battery"||data.mode!=="hourly"||s.battery<=0)return undefined
    return Array.from({length:POWERWALL.maxExpansions+1},(_,n)=>{
      const option=withStorage(s,true,n),r=simulate(data,option)
      return {expansions:n,kWh:option.battery,solarShare:r.solarShare,imports:r.totals.imports}
    })
  },[selected,data,s])
  const dayIndex=Math.min(yearDays(data.year)-1,Math.max(0,Math.round((Date.parse(`${data.year}-${day}T00:00:00Z`)-Date.UTC(data.year,0,1))/86400000)))
  const daily=results?.explorer.hours.slice(dayIndex*24,dayIndex*24+24).map(r=>({...r,label:`${String(r.hour).padStart(2,"0")}:00`,charge:r.solarCharge+r.gridCharge}))??[]
  const row=results?.explorer.hours[dayIndex*24+hour]
  const reset=()=>{setSettings(DEFAULTS);setGeometryState(DEFAULT_GEOMETRY);setYear(2023);setScenario(DEFAULT_SCENARIO);setError("");setDay("06-21");setHour(12)}
  function download() {
    if(!results||!ready)return
    const heading="UTC hour,solar kWh,demand kWh,imports kWh,exports kWh,solar charge kWh,grid charge kWh,discharge kWh,battery stored kWh,curtailed kWh,clipped kWh,losses kWh,unserved kWh"
    const lines=results.explorer.hours.map(r=>[new Date(Date.UTC(data.year,0,1)+r.index*3600000).toISOString(),r.solar,r.demand,r.imports,r.exports,r.solarCharge,r.gridCharge,r.discharge,r.soc,r.curtailed,r.clipped,r.losses,r.unserved].join(","))
    const blob=new Blob([heading+"\n"+lines.join("\n")],{type:"text/csv"})
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`solar-planner-${s.panels}-panels-${data.year}.csv`;a.click();URL.revokeObjectURL(url)
  }
  return <div className="sp-shell">
    <header className="sp-header"><Link href="/" className="sp-brand">Courtyard House<span>PROJECT EXPLORATIONS</span></Link><div className="sp-header-links"><a href="#sources">Method & sources <ArrowUpRight size={14}/></a><span className="sp-public"><span/>Public planner</span></div></header>
    <main>
      <section className="sp-intro"><div><p className="sp-eyebrow"><span className="sp-orange-dot"/> ENERGY, THROUGH THE SEASONS</p><h1>A little more sun.<br/><span>How much more independence?</span></h1><p className="sp-lead">The plan is 20 panels on the long south pitch, with the roof left ready for 30 if the house ever needs more. Follow what they do for the house, the heat pump and the car, hour by hour.</p></div><div className="sp-site-note"><Sun size={29} strokeWidth={1.3}/><strong>Biddenden, Kent</strong><span>205 m² house · two adults</span><span>Heat pump · I-Pace · single phase</span><a href="#sources">Planning assumptions, not a system design <ArrowUpRight size={13}/></a></div></section>
      <div className="sp-toolbar"><div className="sp-scenario"><span>Demand scenario</span><div className="sp-segment">{Object.keys(SCENARIOS).map(name=><button type="button" key={name} aria-pressed={scenario===name} className={scenario===name?"active":""} onClick={()=>{setSettings(prev=>({...prev,...SCENARIOS[name as keyof typeof SCENARIOS]}));setScenario(name)}}>{name}</button>)}</div>{scenario==="Custom"?<small>Custom</small>:null}</div><label className="sp-weather-label">Weather year<select value={year} onChange={e=>setYear(Number(e.target.value))}><option>2021</option><option>2022</option><option>2023</option></select></label><button type="button" className="sp-text-button" onClick={reset}><RotateCcw size={14}/>Reset</button></div>
      <div className="sp-data-status" role="status"><span className={`sp-status-dot ${!ready?"sp-status-pending":""}`}/>{loading?"Fetching hourly PVGIS data for this roof…":error|| (data.mode==="hourly"?`PVGIS ${data.year} · ${fmt(data.hours.length)} real weather hours · modelled household use · GMT throughout`:"Monthly energy comparison only · hourly data unavailable · PVGIS climatological averages")}{error?<button type="button" onClick={()=>setRetry(n=>n+1)}>Retry</button>:null}</div>
      <section className="sp-explorer" aria-label="Energy flow explorer"><div className="sp-explorer-main"><div className="sp-section-heading"><div><p className="sp-eyebrow">01 / FOLLOW THE ENERGY</p><h2>Your home, connected.</h2></div><span className="sp-chip">{s.panels} panels · {(s.panels*s.watts/1000).toFixed(1)} kWp</span></div>
        {ready&&row?<FlowDiagram row={row} s={s} selected={selected} onSelect={setSelected}/>:<div className="sp-unavailable"><Sun size={36}/><h3>{loading?"Updating the solar resource…":"Hourly flows unavailable"}</h3><p>{data.mode==="monthly"&&!error?"Monthly data cannot tell us how the battery behaves. Energy totals are available below.":"Results will appear when hourly data matches the selected roof settings. The default south-facing 35° roof is cached."}</p><button type="button" className="sp-button" onClick={()=>{setGeometryState(DEFAULT_GEOMETRY);setYear(2023)}}>Use cached roof assumptions</button></div>}
        <div className="sp-time-controls"><DayPicker year={year} day={day} setDay={setDay}/><label className="sp-hour-slider"><span>Hour <strong>{String(hour).padStart(2,"0")}:00 GMT</strong></span><input type="range" min={0} max={23} value={hour} onChange={e=>setHour(Number(e.target.value))}/><span>23:00</span></label><p className="sp-note">Flows are hourly average power (kW). Battery state is stored energy (kWh). Select a component to adjust it.</p></div>
      </div><aside className="sp-settings"><div className="sp-settings-heading"><SlidersHorizontal size={17}/><h3>Make it your own</h3></div><div className="sp-part-tabs" role="group" aria-label="Component settings">{(Object.keys(PART_NAMES) as SystemPart[]).map(part=><button type="button" key={part} aria-pressed={part===selected} className={part===selected?"active":""} onClick={()=>setSelected(part)}>{PART_NAMES[part]}</button>)}</div><h3 className="sp-part-heading">{PART_NAMES[selected]}</h3><PartControls part={selected} s={s} set={set} geometry={geometry} setGeometry={setGeometry} impact={storageImpact}/></aside></section>
      <HouseFigure panels={s.panels} watts={s.watts} onPanels={panels=>set({panels})}/>
      {ready?<>
        {results?<>
          {results.explorer.totals.unserved>0.01||results.explorer.evUncharged>1||results.a.totals.unserved>0.01||results.a.evUncharged>1?<div className="sp-warning" role="status"><Info size={19}/><div><b>These settings leave some energy needs unmet.</b> Explorer: {energy(results.explorer.totals.unserved)} of scheduled load exceeds the import/output limits; {energy(results.explorer.evUncharged)} of EV charging remains queued. 20 / 30 panels: {energy(results.a.totals.unserved)} / {energy(results.b.totals.unserved)} unmet load. Widen EV availability or review connection limits before using the coverage figures.</div></div>:null}
          {s.chargePower>chargeLimitOf(s.expansions)&&s.battery>0?<div className="sp-warning"><Info size={19}/>Charge limit exceeds the published {chargeLimitOf(s.expansions)} kW for {s.expansions?"a Powerwall 3 with Expansion units":"a Powerwall 3 without Expansion units"}. Adjust it under Powerwall settings.</div>:null}
          <section className="sp-section"><div className="sp-section-heading"><div><p className="sp-eyebrow">02 / THE PLAN AND THE HORIZON</p><h2>Twenty panels now. Thirty if needed.</h2></div><p className="sp-heading-note">Same home, battery and weather.<br/>The third row is a long-term option, not the starting point.</p></div><div className="sp-comparison-grid"><ComparisonCard result={results.a} watts={s.watts} cost={results.cost.a}/><ComparisonCard result={results.b} watts={s.watts} cost={results.cost.b}/></div><p className="sp-footnote">¹ Generation after inverter clipping, before export curtailment. ² Share of generation delivered to loads, directly or through storage; excludes storage losses and energy still stored at year end. Solar demand coverage excludes all grid-charged energy.</p>
          <div className="sp-delta"><ArrowRight size={23}/><p>Adding the third row later would generate <b>{energy(results.b.totals.solar-results.a.totals.solar)} more</b> a year and cut grid imports by <b>{energy(results.a.totals.imports-results.b.totals.imports)}</b> in this scenario.</p><span>+{Math.round((results.b.solarShare-results.a.solarShare)*100)} percentage points<br/>of demand supplied by solar<br/>if the third row is added</span></div>
          <div className="sp-costs" aria-label="Annual electricity cost">
            <div><span>No solar or battery</span><strong>{money(results.cost.base.net)}</strong><small>Every kWh from the grid</small></div>
            <div className="sp-costs-plan"><span>The plan · 20 panels</span><strong>{money(results.cost.a.net)}</strong><small>Saves {money(results.cost.base.net-results.cost.a.net)} a year</small></div>
            <div><span>With a third row · 30 panels</span><strong>{money(results.cost.b.net)}</strong><small>Saves a further {money(results.cost.a.net-results.cost.b.net)} a year</small></div>
            <p>Annual electricity cost at {s.offPeakRate}p off-peak (00:00–06:00) and {s.dayRate}p by day{s.standingCharge>0?`, with a ${s.standingCharge}p daily standing charge`:", standing charge not included"}{s.exportRate>0?`, exports paid at ${s.exportRate}p`:", exports unpaid"}. Change the tariff under Grid &amp; gateway.</p>
          </div></section>
        </>:<section className="sp-section"><h2>Monthly energy comparison</h2><div className="sp-warning">Hourly PVGIS data is unavailable. These are long-term monthly generation estimates, not {year} hourly results. Battery operation, import/export, clipping and self-sufficiency are deliberately not estimated.</div><div className="sp-comparison-grid">{[20,30].map(n=><article className="sp-comparison" key={n}><h3>{n} panels <span>{n===20?"the plan":"long-term horizon"}</span></h3><p>Generation: {energy(monthly.reduce((sum,m)=>sum+(n===20?m.solar20:m.solar30),0))}/year</p><p>Estimated demand: {energy(monthly.reduce((sum,m)=>sum+m.demand,0))}/year</p></article>)}</div></section>}
        <section className="sp-section sp-chart-panel"><div className="sp-section-heading"><div><p className="sp-eyebrow">03 / A YEAR OF TWO HALVES</p><h2>Summer plenty. Winter pressure.</h2></div><p className="sp-heading-note">Monthly electrical energy · kWh<br/>{offGrid?offGrid.plan.length?<>Fully off-grid with the plan: <b>{listMonths(offGrid.plan)}</b>.</>:<>No month is fully off-grid with the plan; closest is {offGrid.closest.month} ({energy(offGrid.closest.imports20??0)} imported).</>:"An annual surplus is not year-round independence."}</p></div><div className="sp-chart" role="img" aria-label={`Monthly generation from 20 and 30 panels compared with household electricity demand.${offGrid?.plan.length?` Fully off-grid with 20 panels: ${listMonths(offGrid.plan)}.`:""}${offGrid?.later.length?` Off-grid only with 30 panels: ${listMonths(offGrid.later)}.`:""}`}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={monthly} margin={{top:15,right:10,left:0,bottom:5}} accessibilityLayer><CartesianGrid vertical={false} stroke="#e2e4df"/><XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12}/><YAxis tickLine={false} axisLine={false} fontSize={11} width={52}/><Tooltip formatter={(v:number,name:string)=>[energy(v),name]} contentStyle={{borderRadius:12,border:"1px solid #ddd"}}/><Legend iconType="circle" wrapperStyle={{fontSize:12,paddingTop:20}}/>{offGrid?(monthly as {month:string;off20?:boolean;off30?:boolean}[]).map(m=>m.off20||m.off30?<ReferenceArea key={m.month} x1={m.month} x2={m.month} fill={m.off20?chartColours.battery:chartColours.solar30} fillOpacity={m.off20?0.14:0.2} stroke="none" ifOverflow="extendDomain" label={{value:m.off20?"Off-grid":"With 30",position:"insideTop",fontSize:9,fill:m.off20?chartColours.battery:"#9a7a45"}}/>:null):null}<Bar dataKey="solar20" name="20 panels · the plan" fill={chartColours.solar} radius={[3,3,0,0]}/><Bar dataKey="solar30" name="30 panels · if needed later" fill={chartColours.solar30} radius={[3,3,0,0]}/><Line dataKey="demand" name="Demand" stroke={chartColours.demand} strokeWidth={2.5} dot={{r:3}}/></ComposedChart></ResponsiveContainer></div>{offGrid?<p className="sp-offgrid-key"><span><i className="sp-offgrid-plan"/>Fully off-grid with the plan · no grid imports that month</span>{offGrid.later.length?<span><i className="sp-offgrid-later"/>Off-grid only with 30 panels</span>:null}<span>Follows your battery, Expansion and demand settings.</span></p>:null}<details className="sp-data-table"><summary>View monthly numbers</summary><div className="sp-table-wrap"><table><thead><tr><th>Month</th><th>20 panels, the plan (kWh)</th><th>30 panels, later (kWh)</th><th>Demand (kWh)</th>{offGrid?<th>Grid imports, 20 / 30 (kWh)</th>:null}</tr></thead><tbody>{(monthly as {month:string;solar20:number;solar30:number;demand:number;imports20?:number;imports30?:number}[]).map(m=><tr key={m.month}><th>{m.month}</th><td>{fmt(m.solar20)}</td><td>{fmt(m.solar30)}</td><td>{fmt(m.demand)}</td>{offGrid?<td>{fmt(m.imports20??0)} / {fmt(m.imports30??0)}</td>:null}</tr>)}</tbody></table></div></details>{results?<SeasonalTable a={results.a} b={results.b} year={data.year}/>:null}</section>
        {results?<><section className="sp-section sp-daily-grid"><div className="sp-chart-panel"><div className="sp-section-heading"><div><p className="sp-eyebrow">04 / TIMING CHANGES EVERYTHING</p><h2>One day, hour by hour.</h2></div><span className="sp-chip">{day.slice(3)} {MONTHS[Number(day.slice(0,2))-1]} · {s.panels} panels</span></div><div className="sp-daily-controls"><DayPicker year={year} day={day} setDay={setDay} label="Day"/></div><p className="sp-note">kW on the left; stored kWh on the right. Click the chart to move the hour marker. The day and hour are shared with the energy explorer above.</p><div className="sp-chart" role="img" aria-label="Hourly solar, demand, imports, battery charging and stored energy"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={daily} margin={{top:15,right:0,left:-10,bottom:5}} accessibilityLayer onClick={(state,event)=>{const label=state?.activeLabel;if(typeof label==="string")setHour(Number(label.slice(0,2)));if((event as {detail?:number})?.detail)(document.activeElement as HTMLElement|null)?.blur()}} style={{cursor:"pointer"}}><CartesianGrid vertical={false} stroke="#e2e4df"/><XAxis dataKey="label" interval={5} tickLine={false} axisLine={false} fontSize={11}/><YAxis yAxisId="power" tickLine={false} axisLine={false} fontSize={11} width={44}/><YAxis yAxisId="storage" orientation="right" domain={[0,Math.max(1,s.battery)]} tickLine={false} axisLine={false} fontSize={11} width={40}/><Tooltip formatter={(v:number,name:string)=>[`${Number(v).toFixed(2)} ${name==="Stored energy"?"kWh":"kW"}`,name]}/><Legend iconType="plainline" wrapperStyle={{fontSize:11}}/><Line yAxisId="power" dataKey="solar" name="Solar" stroke={chartColours.solar} dot={false} strokeWidth={2}/><Line yAxisId="power" dataKey="demand" name="Demand" stroke={chartColours.demand} dot={false} strokeWidth={2}/><Line yAxisId="power" dataKey="imports" name="Grid import" stroke={chartColours.grid} dot={false} strokeWidth={1.5}/><Line yAxisId="power" dataKey="charge" name="Battery charge" stroke="#9579a6" dot={false} strokeDasharray="4 3"/><Line yAxisId="power" dataKey="discharge" name="Battery discharge" stroke="#a88558" dot={false} strokeDasharray="3 3"/><Line yAxisId="storage" dataKey="soc" name="Stored energy" stroke={chartColours.battery} dot={false} strokeWidth={2}/><ReferenceLine yAxisId="power" x={`${String(hour).padStart(2,"0")}:00`} stroke="#aaa" strokeDasharray="4 4"/></ComposedChart></ResponsiveContainer></div><button type="button" className="sp-text-button" onClick={download}><Download size={14}/>Download this array’s hourly year (CSV)</button></div>
          <div className="sp-demand-panel"><p className="sp-eyebrow">WHERE IT GOES</p><h3>{energy(results.explorer.totals.demand)}<small>annual electrical demand</small></h3>{([["household","Household"],["heating","Space heating"],["hotWater","Hot water"],["ev","I-Pace"]] as const).map(([key,label],i)=><div className="sp-demand-row" key={key}><div><span>{label}</span><strong>{energy(results.explorer.totals[key])}</strong></div><div className="sp-demand-track"><span style={{width:pct(fraction(results.explorer.totals[key],results.explorer.totals.demand)),background:["#727c75","#e58955","#d8b181","#8199ad"][i]}}/></div></div>)}<label className="sp-check"><input type="checkbox" checked={s.ev} onChange={e=>set({ev:e.target.checked})}/><span>Include the I-Pace</span></label><p className="sp-note">Heat pump electricity only. Useful space heat: {energy(s.area*s.heatIntensity)}; hot-water heat: {energy(s.hotWater*yearDays(data.year))}. These heat outputs are not added to electrical demand.</p>{s.gridCharge?<p className="sp-note">Grid energy sent into storage: {energy(results.explorer.totals.gridCharge)}. It is included in imports, not solar coverage.</p>:null}</div>
        </section><section className="sp-recommendation"><div><p className="sp-eyebrow">THE TAKEAWAY / YOUR CURRENT ASSUMPTIONS</p><h2>{results.a.totals.solar>=results.a.totals.demand?"Twenty panels cover the year’s total. Timing is the catch.":results.b.totals.solar>=results.b.totals.demand?"Twenty panels is the plan. A third row could close the annual gap later.":"Twenty panels is the plan. Keep the grid in it, with or without a third row."}</h2><p>With {storageLabel(s)}, the planned 20 panels supply {pct(results.a.solarShare)} of the modelled electrical demand from solar. Adding the third row later would take that to {pct(results.b.solarShare)}, avoiding {energy(results.a.totals.imports-results.b.totals.imports)} of imports and adding {energy(results.b.totals.exports-results.a.totals.exports)} of exports a year. At your tariff the plan’s electricity costs about {money(results.cost.a.net)} a year, against {money(results.cost.base.net)} with no solar or battery.</p><p>{results.a.totals.unserved>0.01||results.b.totals.unserved>0.01||results.a.evUncharged>1?"Resolve the unmet load or outstanding EV charging flagged above before judging whether the plan is sufficient. ":""}{results.b.solarShare-results.a.solarShare<0.05?"Under these settings a third row adds relatively little direct independence, so it stays a long-term option: revisit it if demand grows or tariffs change. ":"A third row would cut imports noticeably under these settings, so keep it open: ask the installer to leave room for it in the inverter input, cable route and roof fixings. "}A bigger battery moves energy into the evening; it cannot solve a winter energy shortage. Get a roof/shading survey, heat-loss calculation and real EV schedule before finalising the order.</p></div><a href="#sources" className="sp-recommendation-link">What still needs checking <ArrowUpRight size={20}/></a></section></>:null}
      </>:null}
      <Sources data={data}/>
      <footer className="sp-footer"><span>Courtyard House / Solar & home energy</span><span>Planning model · not a quote, SAP assessment or electrical design</span></footer>
    </main>
  </div>
}
