// Refresh committed public weather data. Usage: node scripts/cache-solar-weather.mjs
// Or normalize an already downloaded multi-year PVGIS response: ... /path/to/response.json
import { readFile, writeFile } from 'node:fs/promises'
import ts from 'typescript'
// Import pure TS utilities without adding a runtime dependency.
const source = await readFile(new URL('../lib/solar-planner/pvgis.ts', import.meta.url),'utf8')
const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {normalizeHourly,pvgisUrl} = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
const geometry = {pitch:35,aspect:0,loss:14,mounting:'building'}
const raw = process.argv[2] ? JSON.parse(await readFile(process.argv[2],'utf8')) : null
for (const year of [2021,2022,2023]) {
  const url = pvgisUrl(geometry,year)
  const response = raw ? {outputs:{hourly:raw.outputs.hourly.filter(r=>r.time.startsWith(String(year)))}} : await fetch(url,{signal:AbortSignal.timeout(60000)}).then(r=>{if(!r.ok) throw new Error(`PVGIS ${r.status}`); return r.json()})
  const data = normalizeHourly(response,year,geometry,url,new Date().toISOString())
  await writeFile(new URL(`../data/solar-planner/pvgis-${year}.json`,import.meta.url),JSON.stringify(data)+'\n')
  console.log(`${year}: ${data.hours.length} hours, ${Math.round(data.hours.reduce((s,h)=>s+h[0],0))} kWh/kWp cached`)
}
