"use client"

import { useId } from "react"
import { POWERWALL, chargeLimitOf, withStorage, type Settings, type Geometry } from "@/lib/solar-planner/model"
export type SystemPart = "solar" | "battery" | "grid" | "home" | "heat" | "ev"
export const PART_NAMES: Record<SystemPart,string> = {solar:"Solar array",battery:"Powerwall 3",grid:"Grid & gateway",home:"Household circuits",heat:"Heat pump",ev:"EV charger"}
const descriptions: Record<SystemPart,string> = {
  solar:"The panels produce DC electricity. Powerwall 3’s integrated inverter converts it for the home. Panel kWp is a laboratory rating, not continuous AC output.",
  battery:"Powerwall 3 includes the inverter and 13.5 kWh of storage. Each Expansion unit adds another 13.5 kWh but no inverter, so output stays the same. Reserve is held back from normal use; storage shifts energy between hours, not seasons.",
  grid:"The gateway and meter measure exchange with the single-phase grid and coordinate the system. Import and export limits below are planning assumptions, not a connection offer or a promise of whole-house backup.",
  home:"Appliances, cooking, lighting, IT and ventilation share an assumed daily profile. This demand excludes the heat pump and car, which are accounted for separately.",
  heat:"Electricity drives the heat pump, which transfers heat from outside air into underfloor heating and the hot-water cylinder. Heat outputs are not additional electrical loads.",
  ev:"The I-Pace charges only in the selected hours. Daylight charging assumes the car is home on the selected number of days, starting with weekends. Uncharged energy carries forward.",
}
export function NumberControl({label,value,min,max,step=1,unit,source,onChange}: {label:string;value:number;min:number;max:number;step?:number;unit:string;source:string;onChange:(v:number)=>void}) {
  const id=useId()
  return <label className="sp-control" htmlFor={id}>
    <span className="sp-control-label">{label}<small>{source}</small></span>
    <span className="sp-number"><input id={id} type="number" min={min} max={max} step={step} value={value} onChange={e=>{const n=e.currentTarget.valueAsNumber;if(Number.isFinite(n)) onChange(Math.min(max,Math.max(min,n)))}} /><span>{unit}</span></span>
  </label>
}
export function SelectControl({label,value,source,onChange,options}: {label:string;value:string|number;source:string;onChange:(v:string)=>void;options:[string|number,string][]}) {
  const id=useId()
  return <label className="sp-control" htmlFor={id}><span className="sp-control-label">{label}<small>{source}</small></span><select id={id} value={value} onChange={e=>onChange(e.target.value)}>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
}
/** What each storage option does with the same home, panels and weather. */
export type StorageImpact = { expansions: number; kWh: number; solarShare: number; imports: number }
const kWh=(n:number)=>`${Math.round(n).toLocaleString("en-GB")} kWh`
function ExpansionStepper({s,set}: {s:Settings;set:(patch:Partial<Settings>)=>void}) {
  const id=useId()
  const change=(n:number)=>{const next=withStorage(s,true,n);set({battery:next.battery,expansions:next.expansions,chargePower:next.chargePower})}
  return <div className="sp-control sp-stepper-control">
    <span className="sp-control-label" id={id}>Expansion units<small>Tesla · up to {POWERWALL.maxExpansions}, {POWERWALL.unitKWh} kWh each</small></span>
    <div className="sp-stepper" role="group" aria-labelledby={id}>
      <button type="button" aria-label="Remove an Expansion unit" disabled={s.expansions<=0} onClick={()=>change(s.expansions-1)}>−</button>
      <output aria-live="polite">{s.expansions}<small>{s.expansions===1?"unit":"units"}</small></output>
      <button type="button" aria-label="Add an Expansion unit" disabled={s.expansions>=POWERWALL.maxExpansions} onClick={()=>change(s.expansions+1)}>+</button>
    </div>
  </div>
}
function StorageSummary({s,impact}: {s:Settings;impact?:StorageImpact[]}) {
  const units=Array.from({length:POWERWALL.maxExpansions+1},(_,i)=>i)
  return <div className="sp-storage">
    <div className="sp-storage-stack" aria-hidden="true">{units.map(i=><span key={i} className={i===0?"sp-storage-pw":i<=s.expansions?"sp-storage-unit":"sp-storage-slot"}/>)}</div>
    <p className="sp-storage-total"><strong>{s.battery} kWh</strong> usable · charge up to {chargeLimitOf(s.expansions)} kW · output up to {POWERWALL.maxOutput} kW from the Powerwall 3’s inverter</p>
    {impact?.length?<div className="sp-storage-impact">
      <p className="sp-storage-heading">What each pack adds <small>{s.panels} panels, same home and weather</small></p>
      <ol>{impact.map((row,i)=>{const prev=impact[i-1];return <li key={row.expansions} className={row.expansions===s.expansions?"active":""}>
        <span>{row.expansions===0?"Powerwall 3":`+${row.expansions} Expansion`}<small>{row.kWh} kWh</small></span>
        <span>{Math.round(row.solarShare*100)}%<small>from solar</small></span>
        <span>{kWh(row.imports)}<small>{prev?`−${kWh(prev.imports-row.imports)} imports`:"imports"}</small></span>
      </li>})}</ol>
    </div>:null}
  </div>
}
export function PartControls({part,s,set,geometry,setGeometry,impact}: {part:SystemPart;s:Settings;set:(patch:Partial<Settings>)=>void;geometry:Geometry;setGeometry:(patch:Partial<Geometry>)=>void;impact?:StorageImpact[]}) {
  const number=(key:keyof Settings,label:string,min:number,max:number,step:number,unit:string,source="Assumption · adjustable")=><NumberControl key={key} label={label} value={s[key] as number} min={min} max={max} step={step} unit={unit} source={source} onChange={v=>set({[key]:v})}/>
  return <div className="sp-part-controls"><p className="sp-explainer">{descriptions[part]}</p>
    {part==="solar" ? <>
      {number("panels","Panels in the explorer",0,40,1,"panels","Plan · 20 now, 30 as a long-term option")}
      {number("watts","Panel rating",300,600,5,"W","Brief · AIKO NEOSTAR 3S+ 480 W")}
      <SelectControl label="Roof orientation" source="Brief · south, unverified" value={geometry.aspect} onChange={v=>setGeometry({aspect:Number(v)})} options={[[-90,"East"],[-45,"South-east"],[0,"South"],[45,"South-west"],[90,"West"],[180,"North"]]}/>
      <SelectControl label="Roof pitch" source="Assumption · no roof section available" value={geometry.pitch} onChange={v=>setGeometry({pitch:Number(v)})} options={[0,10,20,30,35,40,45,50,60].map(v=>[v,`${v}°`])}/>
      <details><summary>Mounting & losses</summary>
        <SelectControl label="PVGIS mounting model" source="Assumption · conservative close-mounted roof" value={geometry.mounting} onChange={v=>setGeometry({mounting:v as Geometry["mounting"]})} options={[["building","Building-integrated / close mounted"],["free","Ventilated roof rack (free-air model)"]]}/>
        <SelectControl label="System losses" source="PVGIS convention · assumed 14%" value={geometry.loss} onChange={v=>setGeometry({loss:Number(v)})} options={[5,10,14,20,25].map(v=>[v,`${v}%`])}/>
        <p className="sp-note">Terrain horizon included. Nearby trees, roof obstructions and shading between roof faces are not surveyed. No bifacial gain is assumed.</p>
      </details>
    </> : null}
    {part==="battery" ? <>
      <SelectControl label="Battery" source="Tesla capacity · purchase unconfirmed" value={s.battery>0?"pw3":"none"} onChange={v=>{const next=withStorage(s,v==="pw3",0);set({battery:next.battery,expansions:next.expansions,chargePower:next.chargePower})}} options={[["pw3",`Powerwall 3 · ${POWERWALL.unitKWh} kWh`],["none","No battery"]]}/>
      {s.battery>0?<ExpansionStepper s={s} set={set}/>:null}
      {s.battery>0?<StorageSummary s={s} impact={impact}/>:null}
      {number("reserve","Backup reserve",0,100,5,"%")}
      <label className="sp-check"><input type="checkbox" checked={s.gridCharge} onChange={e=>set({gridCharge:e.target.checked})}/><span>Also charge from grid, 00:00–05:00 GMT<small>Optional tariff strategy; never counted as solar.</small></span></label>
      {s.gridCharge ? number("gridTarget","Overnight charge target",0,100,5,"%") : null}
      <details><summary>Power & storage efficiency</summary>
        {number("inverter","Shared inverter output",0.5,11.04,0.1,"kW","Tesla · configurable up to 11.04 kW")}
        {number("chargePower","Battery charge limit",0,chargeLimitOf(s.expansions),0.1,"kW",`Tesla · ${POWERWALL.chargeAlone} kW alone / ${POWERWALL.chargeExpanded} kW with Expansion`)}
        {number("dischargePower","Battery discharge limit",0,11.04,0.1,"kW","Assumption · also capped by shared inverter")}
        {number("efficiency","Storage round-trip efficiency",70,100,1,"%","Assumption · additional to PVGIS PV losses")}
      </details>
    </> : null}
    {part==="grid" ? <>
      {number("importLimit","Maximum grid import",0,23,0.1,"kW","Assumption · 80 A × 230 V = 18.4 kW")}
      {number("exportLimit","Maximum grid export",0,11.04,0.1,"kW","Assumption · 3.68 kW, not DNO approval")}
      <details open><summary>Tariff</summary>
        {number("offPeakRate","Off-peak rate, 00:00–06:00",0,100,0.1,"p/kWh","Your tariff · 8.1p")}
        {number("dayRate","Day rate, 06:00–00:00",0,100,0.1,"p/kWh","Your tariff · around 30p")}
        {number("exportRate","Export payment",0,50,0.1,"p/kWh","Not set · add your export tariff")}
        {number("standingCharge","Standing charge",0,200,0.1,"p/day","Not set · excluded at 0")}
        <p className="sp-note">Imports are priced by the hour they happen in. Like the rest of the model the window runs on GMT all year, so in summer it sits an hour later than the clock.</p>
      </details>
      <p className="sp-note">The model caps imports and flags unmet load. Hourly averages cannot verify kettle, hob, heat-pump startup or other short peaks. Ask the installer to confirm supply capacity, G99/G100 requirements and backup circuit design.</p>
    </> : null}
    {part==="home" ? <>
      {number("household","Household electricity",0,12000,100,"kWh/yr")}
      <p className="sp-note">Two adults, with morning and evening peaks. The project specifies natural ventilation plus local extract; no MVHR load has been added. Background ventilation is included here.</p>
    </> : null}
    {part==="heat" ? <>
      {number("area","Heated floor area",50,350,1,"m²","Project · HOUSE_BRIEF.md, garage excluded")}
      {number("heatIntensity","Annual space heat",0,150,5,"kWh/m²","Assumption · useful thermal energy")}
      {number("cop","Space-heating COP at 7°C",1.5,5.5,0.1,"×","Assumption · falls in colder weather")}
      {number("hotWater","Hot-water heat per day",0,25,0.5,"kWh heat","Assumption · bath + shower + cylinder losses")}
      <details><summary>Hot-water efficiency</summary>{number("waterCop","Hot-water COP at 7°C",1.4,4,0.1,"×")}
        <p className="sp-note">Heat is distributed using PVGIS outdoor temperatures below a 15.5°C balance point. Annual useful heat stays fixed across weather years; the COP changes with temperature. No cooling or explicit immersion/defrost model.</p>
      </details>
    </> : null}
    {part==="ev" ? <>
      <label className="sp-check"><input type="checkbox" checked={s.ev} onChange={e=>set({ev:e.target.checked})}/><span>Include Jaguar I-Pace<small>Brief · optional in this comparison</small></span></label>
      {number("miles","Annual mileage",0,30000,500,"mi/yr")}
      {number("evConsumption","Driving consumption",0.15,0.6,0.01,"kWh/mi","Assumption · energy at car battery")}
      <SelectControl label="Charging window (GMT)" source="Assumption · fixed standard time all year" value={s.charging} onChange={v=>set({charging:v as Settings["charging"]})} options={[["overnight","00:00–06:00 · overnight"],["daylight","10:00–16:00 · daylight"]]}/>
      {s.charging==="daylight" ? number("homeDays","Days at home each week",0,7,1,"days","Assumption · Sat, Sun, then Fri → Mon") : null}
      <details><summary>Charger & charging losses</summary>
        {number("chargerPower","Charger limit",1,7.4,0.1,"kW","Assumption · single-phase charger")}
        {number("evEfficiency","Charging efficiency",70,100,1,"%")}
      </details>
    </> : null}
  </div>
}
