"use client"
import { Sun, BatteryCharging, UtilityPole, Gauge, House, ThermometerSun, Car, Waves } from "lucide-react"
import type { Hour, Settings } from "@/lib/solar-planner/model"
import { PART_NAMES, type SystemPart } from "./controls"
const kw=(n:number)=>`${n.toFixed(2)} kW`
export function FlowDiagram({row,s,selected,onSelect}: {row:Hour;s:Settings;selected:SystemPart;onSelect:(part:SystemPart)=>void}) {
  const batteryNet=row.solarCharge+row.gridCharge-row.discharge
  const inverterNet=row.solar-row.solarCharge+row.discharge-row.gridCharge
  const gridNet=row.imports-row.exports
  const nodes = [
    {part:"solar" as const,x:15,y:15,Icon:Sun,value:kw(row.solar),sub:`${s.panels} × ${s.watts} W · AC equivalent`},
    {part:"battery" as const,x:50,y:15,Icon:BatteryCharging,value:`${row.soc.toFixed(1)} / ${s.battery} kWh`,sub:`${batteryNet>=0?"Charging":"Discharging"} ${kw(Math.abs(batteryNet))}`},
    {part:"grid" as const,x:85,y:15,Icon:UtilityPole,value:kw(Math.abs(gridNet)),sub:gridNet>=0?"Importing from grid":"Exporting to grid"},
    {part:"home" as const,x:15,y:70,Icon:House,value:kw(row.household),sub:"Appliances & background"},
    {part:"heat" as const,x:50,y:70,Icon:ThermometerSun,value:kw(row.heating+row.hotWater),sub:`Electrical input · COP ${row.cop.toFixed(1)}`},
    {part:"ev" as const,x:85,y:70,Icon:Car,value:kw(row.ev),sub:s.ev?"I-Pace · charging load":"EV excluded"},
  ]
  const flow=(d:string,power:number,colour:string)=> <path d={d} className={Math.abs(power)>0.005?`sp-flow ${power<0?"sp-flow-reverse":""}`:"sp-flow-idle"} style={{stroke:colour}}/>
  return <div className="sp-diagram-scroll" tabIndex={0} role="region" aria-label="Interactive energy flow diagram. Scroll horizontally on a small screen.">
    <div className="sp-diagram">
      <svg viewBox="0 0 800 520" aria-hidden="true">
        {flow("M 220 78 H 300",row.solar,"#e65a21")}
        {flow("M 400 128 V 224",inverterNet,"#54846e")}
        {flow("M 680 128 V 248 H 495",gridNet,"#53759d")}
        {flow("M 305 248 H 120 V 314",row.household,"#787b7b")}
        {flow("M 400 273 V 314",row.heating+row.hotWater,"#787b7b")}
        {flow("M 495 248 H 680 V 314",row.ev,"#787b7b")}
        {flow("M 400 414 V 465",row.spaceHeat+row.waterHeat,"#c48a4b")}
      </svg>
      <span className="sp-wire-label" style={{left:"30%",top:"6%"}}>DC →</span>
      <span className="sp-wire-label" style={{left:"51%",top:"33%"}}>{kw(Math.abs(inverterNet))} AC</span>
      {nodes.map(({part,x,y,Icon,value,sub})=><button type="button" key={part} className={`sp-node ${selected===part?"sp-node-selected":""} sp-node-${part}`} style={{left:`${x}%`,top:`${y}%`}} aria-pressed={selected===part} onClick={()=>onSelect(part)}>
        <span className="sp-node-title"><Icon size={17}/>{PART_NAMES[part]}</span><strong>{value}</strong><small>{sub}</small>{part==="battery"?<em>Integrated inverter + storage</em>:null}
      </button>)}
      <button type="button" className={`sp-gateway ${selected==="grid"?"sp-node-selected":""}`} onClick={()=>onSelect("grid")} style={{left:"50%",top:"47.7%"}}><Gauge size={17}/><span>Gateway / meter<small>House AC distribution</small></span></button>
      <button type="button" className="sp-heat-output" onClick={()=>onSelect("heat")}><Waves size={18}/><span>Underfloor heating <b>{kw(row.spaceHeat)} heat</b></span><span>Hot-water cylinder <b>{kw(row.waterHeat)} heat</b></span></button>
    </div>
  </div>
}
