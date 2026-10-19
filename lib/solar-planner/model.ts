/** Hourly AC-equivalent planning model. No tariff or equipment-sizing promises. */
export type Geometry = { pitch: number; aspect: number; loss: number; mounting: "building" | "free" }
export type Weather = {
  mode: "hourly"; year: number; geometry: Geometry; source: string; retrievedAt: string;
  // Continuous hourly UTC bins, beginning 1 January 00:00. PVGIS :10 observations
  // represent the corresponding hourly bin; power is kW per installed kWp.
  hours: [number, number][];
}
export type MonthlyWeather = {
  mode: "monthly"; year: number; geometry: Geometry; source: string; retrievedAt: string;
  monthly: number[];
}
export type WeatherData = Weather | MonthlyWeather
export type Settings = {
  panels: number; watts: number; battery: number; expansions: number; reserve: number;
  household: number; area: number; heatIntensity: number; cop: number;
  hotWater: number; waterCop: number; ev: boolean; miles: number; evConsumption: number;
  evEfficiency: number; charging: "overnight" | "daylight"; homeDays: number; chargerPower: number;
  inverter: number; chargePower: number; dischargePower: number; efficiency: number;
  importLimit: number; exportLimit: number; gridCharge: boolean; gridTarget: number;
  // Tariff, pence: off-peak per kWh (00:00–06:00), day rate per kWh, export per kWh, standing charge per day.
  offPeakRate: number; dayRate: number; exportRate: number; standingCharge: number;
}
/**
 * Tesla UK Powerwall 3 datasheet: 13.5 kWh usable per Powerwall 3 and per Expansion unit; up to
 * 3 Expansion units per Powerwall 3; continuous charge 5 kW alone, configurable up to 8 kW with
 * Expansion units. Expansion units have no inverter, so AC output stays the Powerwall 3's own
 * (configurable up to 11.04 kW).
 */
export const POWERWALL = { unitKWh: 13.5, maxExpansions: 3, chargeAlone: 5, chargeExpanded: 8, maxOutput: 11.04 } as const
const wholeExpansions = (n: number) => Math.min(POWERWALL.maxExpansions, Math.max(0, Math.round(n)))
/** Usable storage for a Powerwall 3 with `expansions` Expansion units, or 0 with no Powerwall. */
export const storageOf = (powerwall: boolean, expansions: number) => powerwall ? POWERWALL.unitKWh * (1 + wholeExpansions(expansions)) : 0
/** Published maximum continuous charge power for that configuration. */
export const chargeLimitOf = (expansions: number) => wholeExpansions(expansions) > 0 ? POWERWALL.chargeExpanded : POWERWALL.chargeAlone
/** Settings for a storage configuration. The charge rate carries over, clamped to the new limit;
 *  adding the first Expansion unit raises a rate at the standalone limit to the expanded one. */
export function withStorage(s: Settings, powerwall: boolean, expansions: number): Settings {
  const n = powerwall ? wholeExpansions(expansions) : 0
  const atStandaloneLimit = s.expansions === 0 && s.chargePower >= POWERWALL.chargeAlone
  const chargePower = Math.min(chargeLimitOf(n), n > 0 && atStandaloneLimit ? POWERWALL.chargeExpanded : s.chargePower)
  return { ...s, battery: storageOf(powerwall, n), expansions: n, chargePower }
}
export const DEFAULT_GEOMETRY: Geometry = { pitch: 35, aspect: 0, loss: 14, mounting: "building" }
export const SCENARIOS = {
  Low: { household: 2500, heatIntensity: 25, cop: 4, hotWater: 6, miles: 5000, evConsumption: 0.30 },
  Base: { household: 3500, heatIntensity: 45, cop: 3.5, hotWater: 8, miles: 8000, evConsumption: 0.33 },
  High: { household: 5000, heatIntensity: 75, cop: 2.8, hotWater: 11, miles: 12000, evConsumption: 0.38 },
}
/** The planner opens on low usage. */
export const DEFAULT_SCENARIO: keyof typeof SCENARIOS = "Low"
// Default storage: a Powerwall 3 with one Expansion unit (27 kWh, charging up to 8 kW).
const DEFAULT_EXPANSIONS = 1
export const DEFAULTS: Settings = {
  panels: 20, watts: 480, battery: storageOf(true, DEFAULT_EXPANSIONS), expansions: DEFAULT_EXPANSIONS, reserve: 20,
  ...SCENARIOS[DEFAULT_SCENARIO], // household, heat, COP, hot water, mileage and EV consumption
  area: 205, waterCop: 2.7, ev: true,
  evEfficiency: 90, charging: "overnight", homeDays: 2, chargerPower: 7.2,
  inverter: 11.04, chargePower: chargeLimitOf(DEFAULT_EXPANSIONS), dischargePower: 11.04, efficiency: 90,
  importLimit: 18.4, exportLimit: 3.68, gridCharge: false, gridTarget: 80,
  offPeakRate: 8.1, dayRate: 30, exportRate: 0, standingCharge: 0,
}
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
export type Hour = {
  index: number; month: number; hour: number; temperature: number;
  solar: number; potential: number; clipped: number; demand: number;
  household: number; heating: number; hotWater: number; ev: number;
  spaceHeat: number; waterHeat: number; cop: number;
  direct: number; solarCharge: number; gridCharge: number; discharge: number;
  solarDischarge: number; gridDischarge: number; imports: number; exports: number;
  curtailed: number; losses: number; soc: number; unserved: number;
}
export type Totals = Pick<Hour, "solar" | "potential" | "clipped" | "demand" | "household" | "heating" | "hotWater" | "ev" | "direct" | "solarCharge" | "gridCharge" | "discharge" | "solarDischarge" | "gridDischarge" | "imports" | "exports" | "curtailed" | "losses" | "unserved">
const emptyTotals = (): Totals => ({ solar: 0, potential: 0, clipped: 0, demand: 0, household: 0, heating: 0, hotWater: 0, ev: 0, direct: 0, solarCharge: 0, gridCharge: 0, discharge: 0, solarDischarge: 0, gridDischarge: 0, imports: 0, exports: 0, curtailed: 0, losses: 0, unserved: 0 })
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
export const fraction = (part: number, whole: number) => whole > 0 ? part / whole : 0
const householdShape = [0.5,0.4,0.4,0.4,0.4,0.5,0.8,1.4,1.4,1,0.9,0.9,1.1,1,0.9,0.9,1.1,1.7,2,2,1.8,1.4,1,0.7]
const householdSum = householdShape.reduce((a,b) => a+b,0)
const waterShape = Array.from({length:24}, (_,h) => h === 6 || h === 7 ? 0.2 : h === 18 || h === 19 ? 0.25 : 0.1 / 20)
const dayOrder = [6,0,5,4,3,2,1] // Daylight at home: weekends first, then weekdays.
export function simulate(weather: Weather, s: Settings, panels = s.panels) {
  const days = weather.hours.length / 24
  const start = Date.UTC(weather.year, 0, 1)
  const degreeTotal = weather.hours.reduce((sum, [, t]) => sum + Math.max(0, 15.5 - t), 0)
  const capacity = Math.max(0, s.battery)
  const reserve = capacity * s.reserve / 100
  const eta = Math.sqrt(s.efficiency / 100)
  // Start completely empty. No free stored energy, including the reserve.
  let solarStored = 0, gridStored = 0, evQueue = 0
  const hours: Hour[] = []
  const totals = emptyTotals()
  const monthly = MONTHS.map((month) => ({ month, ...emptyTotals() }))
  const evRequired = s.ev ? s.miles * s.evConsumption / (s.evEfficiency / 100) : 0
  for (let i = 0; i < weather.hours.length; i++) {
    const [pv, temperature] = weather.hours[i]
    const date = new Date(start + i * 3600000)
    const hour = date.getUTCHours(), month = date.getUTCMonth()
    const cop = clamp(s.cop + (temperature - 7) * 0.06, 1.5, 5.5)
    const spaceHeat = degreeTotal ? s.area * s.heatIntensity * Math.max(0, 15.5 - temperature) / degreeTotal : 0
    const waterHeat = s.hotWater * waterShape[hour]
    const household = s.household / days * householdShape[hour] / householdSum
    const heating = spaceHeat / cop
    const hotWater = waterHeat / clamp(s.waterCop + (temperature - 7) * 0.035, 1.4, 4)
    if (hour === 0) evQueue += evRequired / days
    const canChargeEV = s.charging === "overnight" ? hour < 6 : hour >= 10 && hour < 16 && dayOrder.slice(0,s.homeDays).includes(date.getUTCDay())
    const ev = canChargeEV ? Math.min(evQueue, s.chargerPower) : 0
    evQueue = Math.max(0, evQueue - ev)
    const demand = household + heating + hotWater + ev
    const potential = Math.max(0, pv) * panels * s.watts / 1000
    const solar = Math.min(potential, s.inverter)
    const direct = Math.min(solar, demand)
    const surplus = solar - direct
    const deficit = demand - direct
    const solarCharge = Math.min(surplus, s.chargePower, Math.max(0, capacity - solarStored - gridStored) / eta)
    solarStored += solarCharge * eta
    const cheapHour = s.gridCharge && hour < 5
    const beforeDischarge = solarStored + gridStored
    const discharge = cheapHour ? 0 : Math.min(deficit, s.dischargePower, Math.max(0, s.inverter - direct), Math.max(0, beforeDischarge - reserve) * eta)
    const solarDischarge = discharge * fraction(solarStored, beforeDischarge)
    const gridDischarge = discharge - solarDischarge
    solarStored = Math.max(0, solarStored - solarDischarge / eta)
    gridStored = Math.max(0, gridStored - gridDischarge / eta)
    const gridToLoad = Math.min(Math.max(0, deficit - discharge), s.importLimit)
    const unserved = Math.max(0, deficit - discharge - gridToLoad)
    // Solar takes priority; grid charging never runs alongside exports.
    const gridCharge = cheapHour && surplus < 1e-9 ? Math.max(0, Math.min(
      s.chargePower - solarCharge, s.importLimit - gridToLoad,
      (capacity * s.gridTarget / 100 - solarStored - gridStored) / eta,
    )) : 0
    gridStored += gridCharge * eta
    const exports = Math.min(Math.max(0, surplus - solarCharge), s.exportLimit)
    const row: Hour = {
      index:i, month, hour, temperature, solar, potential, clipped: potential - solar, demand,
      household, heating, hotWater, ev, spaceHeat, waterHeat, cop, direct, solarCharge, gridCharge,
      discharge, solarDischarge, gridDischarge, imports: gridToLoad + gridCharge, exports,
      curtailed: Math.max(0, surplus - solarCharge - exports),
      losses: (solarCharge + gridCharge) * (1-eta) + discharge * (1/eta-1),
      soc: solarStored + gridStored, unserved,
    }
    hours.push(row)
    for (const key of Object.keys(totals) as (keyof Totals)[]) {
      totals[key] += row[key]
      monthly[month][key] += row[key]
    }
  }
  return {
    panels, hours, totals, monthly, evRequired, evUncharged: evQueue,
    finalStored: solarStored + gridStored,
    solarShare: fraction(totals.direct + totals.solarDischarge, totals.demand),
    // End-use definition: excludes storage losses and energy remaining in battery.
    selfConsumption: fraction(totals.direct + totals.solarDischarge, totals.solar),
  }
}
export type Simulation = ReturnType<typeof simulate>

/** Fallback: monthly energy only. No hourly profile, battery or independence claims. */
export function monthlyComparison(data: MonthlyWeather, s: Settings, panels: number) {
  const days = [31,28,31,30,31,30,31,31,30,31,30,31]
  const heatWeights = [0.18,0.15,0.13,0.08,0.03,0.005,0,0,0.015,0.08,0.14,0.19]
  return MONTHS.map((month, i) => ({
    month, solar: data.monthly[i] * panels * s.watts / 1000,
    demand: (s.household + (s.ev ? s.miles*s.evConsumption/(s.evEfficiency/100) : 0)) * days[i]/365
      + s.area*s.heatIntensity*heatWeights[i]/s.cop + s.hotWater*days[i]/s.waterCop,
  }))
}

/** Off-peak window, in the model's GMT hours: imports from 00:00 to 06:00 are charged at the off-peak rate. */
export const OFF_PEAK = { from: 0, to: 6 } as const
export const isOffPeak = (hour: number) => hour >= OFF_PEAK.from && hour < OFF_PEAK.to
/** Annual electricity bill for a simulated year, in pounds. Rates are in pence. */
export function costOf(r: Pick<Simulation, "hours">, s: Settings) {
  let offPeakKWh = 0, dayKWh = 0, exportKWh = 0
  for (const h of r.hours) {
    if (isOffPeak(h.hour)) offPeakKWh += h.imports
    else dayKWh += h.imports
    exportKWh += h.exports
  }
  const days = r.hours.length / 24
  const offPeak = offPeakKWh * s.offPeakRate / 100
  const day = dayKWh * s.dayRate / 100
  const standing = days * s.standingCharge / 100
  const exportCredit = exportKWh * s.exportRate / 100
  return { offPeakKWh, dayKWh, exportKWh, offPeak, day, standing, exportCredit, imports: offPeak + day, net: offPeak + day + standing - exportCredit }
}
export type Cost = ReturnType<typeof costOf>
/** The same home, weather and tariff with no panels and no battery: every kWh comes from the grid. */
export const withoutSolar = (s: Settings): Settings => ({ ...s, panels: 0, battery: 0, expansions: 0, gridCharge: false })
