import type { Geometry, Weather } from "./model"
export const PVGIS_URL = "https://re.jrc.ec.europa.eu/api/v5_3/"
export function pvgisUrl(geometry: Geometry, year: number, tool = "seriescalc") {
  const params = new URLSearchParams({
    lat:"51.10", lon:"0.64", raddatabase:"PVGIS-SARAH3", peakpower:"1", pvtechchoice:"crystSi",
    mountingplace:geometry.mounting, loss:String(geometry.loss), angle:String(geometry.pitch),
    aspect:String(geometry.aspect), usehorizon:"1", outputformat:"json",
  })
  if (tool === "seriescalc") {
    params.set("startyear",String(year)); params.set("endyear",String(year)); params.set("pvcalculation","1")
  }
  return `${PVGIS_URL}${tool}?${params}`
}
export function normalizeHourly(raw: unknown, year: number, geometry: Geometry, source: string, retrievedAt: string): Weather {
  const hourly = (raw as { outputs?: { hourly?: {time:string;P:number;T2m:number}[] } })?.outputs?.hourly
  const expected = (Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/3600000
  if (!Array.isArray(hourly) || hourly.length !== expected) throw new Error("Incomplete PVGIS weather year")
  const hours: [number,number][] = hourly.map((r,i) => {
    const date = new Date(Date.UTC(year,0,1)+i*3600000)
    const prefix = date.toISOString().slice(0,10).replaceAll("-","") + ":" + String(date.getUTCHours()).padStart(2,"0")
    if (!r.time?.startsWith(prefix) || !Number.isFinite(r.P) || r.P < 0 || !Number.isFinite(r.T2m)) throw new Error("Invalid or non-contiguous PVGIS hours")
    return [r.P / 1000, r.T2m]
  })
  return {mode:"hourly",year,geometry,source,retrievedAt,hours}
}
