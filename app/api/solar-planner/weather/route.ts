import { NextRequest, NextResponse } from "next/server"
import { pvgisUrl, normalizeHourly } from "@/lib/solar-planner/pvgis"
import type { Geometry, MonthlyWeather, Weather } from "@/lib/solar-planner/model"
import cached2021 from "@/data/solar-planner/pvgis-2021.json"
import cached2022 from "@/data/solar-planner/pvgis-2022.json"
import cached2023 from "@/data/solar-planner/pvgis-2023.json"

export const maxDuration = 60
const cached = { 2021: cached2021, 2022: cached2022, 2023: cached2023 }
// Fixed upstream and a finite, validated parameter space. No arbitrary URL proxy.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  const year = Number(q.get("year"))
  const geometry: Geometry = {pitch:Number(q.get("pitch")),aspect:Number(q.get("aspect")),loss:Number(q.get("loss")),mounting:q.get("mounting") as Geometry["mounting"]}
  if (![2021,2022,2023].includes(year) || ![0,10,20,30,35,40,45,50,60].includes(geometry.pitch)
    || ![-90,-45,0,45,90,180].includes(geometry.aspect) || ![5,10,14,20,25].includes(geometry.loss)
    || !["building","free"].includes(geometry.mounting)) {
    return NextResponse.json({error:"Unsupported weather settings"},{status:400})
  }
  const headers = {"Cache-Control":"public, max-age=86400, s-maxage=2592000"}
  if (geometry.pitch===35 && geometry.aspect===0 && geometry.loss===14 && geometry.mounting==="building") {
    return NextResponse.json(cached[year as keyof typeof cached] as Weather, {headers})
  }
  try {
    const source = pvgisUrl(geometry,year)
    const response = await fetch(source,{next:{revalidate:2592000},signal:AbortSignal.timeout(22000)})
    if (!response.ok) throw new Error(`PVGIS ${response.status}`)
    const data = normalizeHourly(await response.json(),year,geometry,source,new Date().toISOString())
    return NextResponse.json(data,{headers})
  } catch {
    // Monthly fallback is real PVGIS climatology; never manufacture hourly dispatch.
    try {
      const source = pvgisUrl(geometry,year,"PVcalc")
      const response = await fetch(source,{next:{revalidate:2592000},signal:AbortSignal.timeout(18000)})
      if (!response.ok) throw new Error(`PVGIS ${response.status}`)
      const raw = await response.json()
      const rows = raw?.outputs?.monthly?.fixed
      if (!Array.isArray(rows) || rows.length!==12 || rows.some((r,i)=>r.month!==i+1 || !Number.isFinite(r.E_m) || r.E_m<0)) throw new Error("Incomplete monthly data")
      const data: MonthlyWeather = {mode:"monthly",year,geometry,source,retrievedAt:new Date().toISOString(),monthly:rows.map(r=>r.E_m)}
      return NextResponse.json(data,{headers:{"Cache-Control":"public, max-age=300"}})
    } catch {
      return NextResponse.json({error:"PVGIS is unavailable for this roof configuration. Restore the cached south-facing 35° roof, or retry later."},{status:503})
    }
  }
}
