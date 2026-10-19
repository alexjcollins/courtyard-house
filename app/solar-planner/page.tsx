import type { Metadata } from "next"
import { SolarPlanner } from "@/components/solar-planner/planner"
import initialWeather from "@/data/solar-planner/pvgis-2023.json"
import type { Weather } from "@/lib/solar-planner/model"
import "./solar-planner.css"

export const metadata: Metadata = {
  title: "Solar & home energy — Courtyard House",
  description: "The plan for Courtyard House: 20 solar panels now, with room for 30 later. Battery storage, heat-pump demand and EV charging, hour by hour.",
}
// Intentionally public, outside the authenticated (app) layout. Only curated
// planning assumptions and public weather data cross this boundary.
export default function SolarPlannerPage() {
  return <SolarPlanner initialWeather={initialWeather as Weather} />
}
