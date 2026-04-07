import { readFile } from "node:fs/promises"
import path from "node:path"
import pg from "pg"

const { Pool } = pg

async function loadEnvFile(fileName) {
  const filePath = path.join(process.cwd(), fileName)

  try {
    const content = await readFile(filePath, "utf8")
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith("#")) continue

      const separatorIndex = line.indexOf("=")
      if (separatorIndex === -1) continue

      const key = line.slice(0, separatorIndex).trim()
      if (!key || process.env[key]) continue

      let value = line.slice(separatorIndex + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }

      process.env[key] = value
    }
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return
    }

    throw error
  }
}

const ROOM_GROUP_ORDER = {
  "General / whole project": 10,
  Entranceway: 20,
  "Kitchen / dining / living": 30,
  Office: 40,
  "Laundry room": 50,
  "Hallways / stair / circulation": 60,
  "Master bedroom": 70,
  "His ensuite": 80,
  "Her ensuite": 90,
  "Guest bedroom 1": 100,
  "Guest bedroom 1 ensuite": 110,
  "Guest bedroom 2": 120,
  "Guest bedroom 2 ensuite": 130,
  "Powder room": 140,
  Garage: 150,
  "Courtyard / external interface": 160,
}

const TYPE_GROUP_ORDER = {
  "Site & substructure": 10,
  "Structural shell": 20,
  "Roofing & rainwater": 30,
  "Envelope & cladding": 40,
  "Glazing & external doors": 50,
  "Heating, plumbing & ventilation": 60,
  "Electrical, lighting & data": 70,
  "Kitchen & utility": 80,
  "Bathrooms & sanitaryware": 90,
  "Joinery, doors & stairs": 100,
  "Floors, walls & decorating": 110,
  "External works & courtyard": 120,
}

function createItemBuilder() {
  const items = []
  const roomSectionOrder = new Map()
  const typeSectionOrder = new Map()
  let itemOrder = 0

  function getSectionOrder(map, key) {
    if (!map.has(key)) {
      map.set(key, map.size + 1)
    }

    return map.get(key)
  }

  function addItem({
    id,
    title,
    categoryId,
    roomGroup,
    roomSection,
    roomName = roomGroup,
    typeGroup,
    typeSection,
    baselineSpec,
    baselineBudgetExVat = 0,
    quantity = null,
    unit = null,
    decisionStage = "now",
    priority = "medium",
    description = "",
    architectNote = "",
  }) {
    itemOrder += 1

    items.push({
      id,
      code: id.toUpperCase(),
      title,
      categoryId,
      roomGroup,
      roomSection,
      roomName,
      typeGroup,
      typeSection,
      roomGroupOrder: ROOM_GROUP_ORDER[roomGroup] || 999,
      roomSectionOrder: getSectionOrder(roomSectionOrder, `${roomGroup}:${roomSection}`),
      typeGroupOrder: TYPE_GROUP_ORDER[typeGroup] || 999,
      typeSectionOrder: getSectionOrder(typeSectionOrder, `${typeGroup}:${typeSection}`),
      itemOrder,
      baselineSpec,
      baselineBudgetExVat,
      quantity,
      unit,
      decisionStage,
      priority,
      description,
      architectNote,
    })
  }

  return { addItem, items }
}

function addBedroom({
  addItem,
  roomGroup,
  roomLabel,
  wardrobeBudget,
  floorBudget,
  wallBudget,
  socketCount,
  dataPoints,
  lightingPoints,
}) {
  const roomCode = roomGroup.toLowerCase().replace(/[^a-z0-9]+/g, "-")

  addItem({
    id: `${roomCode}-floor-finish`,
    title: "Floor finish",
    categoryId: "finishes",
    roomGroup,
    roomSection: "Finishes",
    roomName: roomLabel,
    typeGroup: "Floors, walls & decorating",
    typeSection: "Bedroom floors",
    baselineSpec: "Engineered oak floor within the control budget allowance.",
    baselineBudgetExVat: floorBudget,
    description: "Carry a restrained oak floor allowance rather than premium bespoke timber.",
  })

  addItem({
    id: `${roomCode}-wall-finish`,
    title: "Wall finish",
    categoryId: "finishes",
    roomGroup,
    roomSection: "Finishes",
    roomName: roomLabel,
    typeGroup: "Floors, walls & decorating",
    typeSection: "Bedroom walls",
    baselineSpec: "Paint-grade plaster finish with no specialist decorative treatment.",
    baselineBudgetExVat: wallBudget,
    description: "Budget is held only if this room is expected to carry upgraded decorative treatment.",
    decisionStage: "later",
  })

  addItem({
    id: `${roomCode}-wardrobes`,
    title: "Wardrobes and storage",
    categoryId: "joinery",
    roomGroup,
    roomSection: "Joinery & storage",
    roomName: roomLabel,
    typeGroup: "Joinery, doors & stairs",
    typeSection: "Bedroom wardrobes",
    baselineSpec: wardrobeBudget > 0
      ? "Controlled fitted wardrobe allowance."
      : "Freestanding storage only, with no bespoke wardrobe included.",
    baselineBudgetExVat: wardrobeBudget,
    description: "Use this to decide whether the room gets built-in storage or stays loose furnished.",
  })

  addItem({
    id: `${roomCode}-power-layout`,
    title: "Power layout and socket count",
    categoryId: "mech_elec",
    roomGroup,
    roomSection: "Electrical & lighting",
    roomName: roomLabel,
    typeGroup: "Electrical, lighting & data",
    typeSection: "Bedroom power & data",
    baselineSpec: `Allow ${socketCount} twin sockets and ${dataPoints} data point${dataPoints === 1 ? "" : "s"} within the main electrical budget.`,
    baselineBudgetExVat: 0,
    description: "Planning item only. Cost is already included in the main electrical package.",
    architectNote: "Lock bed position and desk / TV assumptions before first-fix electrical drawings are issued.",
  })

  addItem({
    id: `${roomCode}-lighting-layout`,
    title: "Lighting layout",
    categoryId: "mech_elec",
    roomGroup,
    roomSection: "Electrical & lighting",
    roomName: roomLabel,
    typeGroup: "Electrical, lighting & data",
    typeSection: "Bedroom lighting",
    baselineSpec: `Allow approximately ${lightingPoints} lighting points including 2 recessed ceiling spotlights, a main decorative fitting or bedside feature lights, and secondary lighting positions within the main electrical budget.`,
    baselineBudgetExVat: 0,
    description: "Planning item only. Use it to coordinate the 2 recessed ceiling spotlights, bedside switching, wall lights, and any wardrobe lighting.",
  })
}

function addBathroom({
  addItem,
  roomGroup,
  roomLabel,
  hasBath = false,
  wcBudget,
  basinBudget,
  tapBudget,
  showerBudget = 0,
  bathBudget = 0,
  tilingBudget,
  mirrorBudget,
  accessoryBudget,
  towelRailBudget,
  electricalNote,
}) {
  const roomCode = roomGroup.toLowerCase().replace(/[^a-z0-9]+/g, "-")

  addItem({
    id: `${roomCode}-wc`,
    title: "WC",
    categoryId: "bathrooms",
    roomGroup,
    roomSection: "Fixtures & fittings",
    roomName: roomLabel,
    typeGroup: "Bathrooms & sanitaryware",
    typeSection: "Sanitaryware",
    baselineSpec: "Good-quality WC within the control budget.",
    baselineBudgetExVat: wcBudget,
    description: "Carry a realistic mid-range WC allowance rather than a premium designer product.",
  })

  addItem({
    id: `${roomCode}-basin`,
    title: "Basin and vanity",
    categoryId: "bathrooms",
    roomGroup,
    roomSection: "Fixtures & fittings",
    roomName: roomLabel,
    typeGroup: "Bathrooms & sanitaryware",
    typeSection: "Sanitaryware",
    baselineSpec: "Basin or compact vanity within the control budget.",
    baselineBudgetExVat: basinBudget,
    description: "Use this to hold the basin and any integrated vanity component together.",
  })

  addItem({
    id: `${roomCode}-tapware`,
    title: "Tapware and brassware",
    categoryId: "bathrooms",
    roomGroup,
    roomSection: "Fixtures & fittings",
    roomName: roomLabel,
    typeGroup: "Bathrooms & sanitaryware",
    typeSection: "Tapware",
    baselineSpec: "Controlled mid-range basin tap / small brassware allowance.",
    baselineBudgetExVat: tapBudget,
    description: "Keep finish and brand discipline here, because brassware escalation is one of the easiest budget leaks in the project.",
  })

  if (showerBudget > 0) {
    addItem({
      id: `${roomCode}-shower`,
      title: "Shower set",
      categoryId: "bathrooms",
      roomGroup,
      roomSection: "Fixtures & fittings",
      roomName: roomLabel,
      typeGroup: "Bathrooms & sanitaryware",
      typeSection: "Shower fittings",
      baselineSpec: "Concealed thermostatic shower set within the control budget.",
      baselineBudgetExVat: showerBudget,
      description: "Includes valve, head, and handset allowance at a sensible quality level.",
    })
  }

  if (hasBath) {
    addItem({
      id: `${roomCode}-bath`,
      title: "Bath",
      categoryId: "bathrooms",
      roomGroup,
      roomSection: "Fixtures & fittings",
      roomName: roomLabel,
      typeGroup: "Bathrooms & sanitaryware",
      typeSection: "Baths",
      baselineSpec: "Straightforward built-in bath within the control budget.",
      baselineBudgetExVat: bathBudget,
      description: "This is a controlled bath allowance, not a statement freestanding stone bath budget.",
    })
  }

  addItem({
    id: `${roomCode}-tiling-and-walls`,
    title: "Tiling and wet-area wall finish",
    categoryId: "bathrooms",
    roomGroup,
    roomSection: "Finishes",
    roomName: roomLabel,
    typeGroup: "Floors, walls & decorating",
    typeSection: "Bathroom finishes",
    baselineSpec: "Porcelain tile finish to wet areas with paint-grade non-wet walls unless upgraded.",
    baselineBudgetExVat: tilingBudget,
    description: "Use this allowance to control tile format and extent. It should not quietly turn into full-height premium stone everywhere.",
  })

  addItem({
    id: `${roomCode}-mirror-and-storage`,
    title: "Mirror and storage",
    categoryId: "bathrooms",
    roomGroup,
    roomSection: "Fixtures & fittings",
    roomName: roomLabel,
    typeGroup: "Bathrooms & sanitaryware",
    typeSection: "Mirrors & storage",
    baselineSpec: "Mirror or mirrored storage cabinet within the control budget.",
    baselineBudgetExVat: mirrorBudget,
    description: "Use this to control whether the room stays simple or becomes more furniture-led.",
    decisionStage: "later",
  })

  addItem({
    id: `${roomCode}-accessories`,
    title: "Accessories and towel rail",
    categoryId: "bathrooms",
    roomGroup,
    roomSection: "Accessories",
    roomName: roomLabel,
    typeGroup: "Bathrooms & sanitaryware",
    typeSection: "Accessories & rails",
    baselineSpec: "Controlled accessories package including robe hook, paper holder, and small fittings.",
    baselineBudgetExVat: accessoryBudget + towelRailBudget,
    description: "These small items add up. Keep them visible in the budget instead of allowing them to arrive as late extras.",
    decisionStage: "later",
  })

  addItem({
    id: `${roomCode}-electrical-ventilation`,
    title: "Electrical, extract, and lighting layout",
    categoryId: "mech_elec",
    roomGroup,
    roomSection: "Electrical & ventilation",
    roomName: roomLabel,
    typeGroup: "Electrical, lighting & data",
    typeSection: "Bathroom lighting & ventilation",
    baselineSpec: electricalNote,
    baselineBudgetExVat: 0,
    description: "Planning item only. Cost is already carried inside the main electrical and ventilation packages.",
    architectNote: "Coordinate mirror positions, shaver points, extract, and any niche lighting before first-fix.",
  })
}

function buildSeedItems() {
  const { addItem, items } = createItemBuilder()

  addItem({
    id: "site-welfare-and-storage",
    title: "Site welfare and storage setup",
    categoryId: "prelims",
    roomGroup: "General / whole project",
    roomSection: "Site setup",
    typeGroup: "Site & substructure",
    typeSection: "Prelims",
    baselineSpec: "Baseline welfare cabin, secure storage, and working site setup.",
    baselineBudgetExVat: 10000,
    description: "Main prelims allowance for welfare, temporary storage, and general site enabling setup.",
  })
  addItem({
    id: "site-security-and-access-control",
    title: "Site security and access control",
    categoryId: "prelims",
    roomGroup: "General / whole project",
    roomSection: "Site setup",
    typeGroup: "Site & substructure",
    typeSection: "Prelims",
    baselineSpec: "Controlled temporary fencing, locking, and site security setup.",
    baselineBudgetExVat: 4000,
    description: "Hold security explicitly, especially given the glazing and steel value that will appear on site later.",
  })
  addItem({
    id: "temporary-power-water-and-logistics",
    title: "Temporary power, water, and logistics",
    categoryId: "prelims",
    roomGroup: "General / whole project",
    roomSection: "Site setup",
    typeGroup: "Site & substructure",
    typeSection: "Prelims",
    baselineSpec: "Temporary utility provision and basic logistics setup.",
    baselineBudgetExVat: 6000,
    description: "Includes temporary services and the practical running of the site before the permanent build systems exist.",
  })
  addItem({
    id: "temporary-access-and-hardstanding",
    title: "Temporary access and hardstanding",
    categoryId: "prelims",
    roomGroup: "General / whole project",
    roomSection: "Site setup",
    typeGroup: "Site & substructure",
    typeSection: "Prelims",
    baselineSpec: "Simple site access and contractor hardstanding within the prelims budget.",
    baselineBudgetExVat: 10000,
    description: "Use this to decide how robust the temporary access strategy needs to be before the groundworks contractor starts.",
  })

  addItem({
    id: "nissen-demolition",
    title: "Nissen hut demolition and old foundation removal",
    categoryId: "groundworks",
    roomGroup: "General / whole project",
    roomSection: "Groundworks & drainage",
    typeGroup: "Site & substructure",
    typeSection: "Demolition",
    baselineSpec: "Demolish the existing Nissen hut and remove the old foundations.",
    baselineBudgetExVat: 15000,
    description: "Budget-bearing early works item already acknowledged in the project budget.",
  })
  addItem({
    id: "reduced-levels-and-formation",
    title: "Reduced levels and slab formation",
    categoryId: "groundworks",
    roomGroup: "General / whole project",
    roomSection: "Groundworks & drainage",
    typeGroup: "Site & substructure",
    typeSection: "Ground formation",
    baselineSpec: "Excavate, trim, and form the site to receive the raft slab and drainage.",
    baselineBudgetExVat: 8000,
    description: "Keep levels, thresholds, and courtyard coordination explicit rather than hidden in one large slab number.",
  })
  addItem({
    id: "below-ground-drainage",
    title: "Below-ground drainage and courtyard drainage interfaces",
    categoryId: "groundworks",
    roomGroup: "General / whole project",
    roomSection: "Groundworks & drainage",
    typeGroup: "Site & substructure",
    typeSection: "Drainage",
    baselineSpec: "Standard below-ground foul and surface water drainage with courtyard threshold drainage coordination.",
    baselineBudgetExVat: 22000,
    description: "Critical to the courtyard and glazing threshold performance.",
    architectNote: "Drainage, courtyard levels, and glazing thresholds need to be drawn together rather than resolved separately.",
  })
  addItem({
    id: "incoming-services-and-sleeves",
    title: "Incoming services and below-ground sleeves",
    categoryId: "groundworks",
    roomGroup: "General / whole project",
    roomSection: "Groundworks & drainage",
    typeGroup: "Site & substructure",
    typeSection: "Service entries",
    baselineSpec: "Allow basic incoming service trenches and sleeves for future connections.",
    baselineBudgetExVat: 7000,
    description: "Budget-bearing item for service entry points and sleeves through the substructure.",
  })
  addItem({
    id: "raft-slab-system",
    title: "Raft slab system",
    categoryId: "groundworks",
    roomGroup: "General / whole project",
    roomSection: "Foundations",
    typeGroup: "Site & substructure",
    typeSection: "Foundations",
    baselineSpec: "Engineered raft slab with reinforcement and concrete pour within the control budget.",
    baselineBudgetExVat: 48000,
    description: "Main structural substructure cost item.",
  })
  addItem({
    id: "thresholds-plinth-and-terrace-interface",
    title: "Thresholds, plinth, and terrace interface",
    categoryId: "groundworks",
    roomGroup: "General / whole project",
    roomSection: "Foundations",
    typeGroup: "Site & substructure",
    typeSection: "Threshold and plinth details",
    baselineSpec: "Simple robust concrete threshold and plinth interface package.",
    baselineBudgetExVat: 10000,
    description: "Budget-bearing item that influences how refined the house lands on the ground.",
  })
  addItem({
    id: "foundation-service-penetrations",
    title: "Foundation service penetrations and coordination",
    categoryId: "groundworks",
    roomGroup: "General / whole project",
    roomSection: "Foundations",
    typeGroup: "Site & substructure",
    typeSection: "Foundations",
    baselineSpec: "Service penetrations coordinated through the slab within the foundation design.",
    baselineBudgetExVat: 0,
    description: "Planning item only. Cost is already held inside the foundation and service-entry allowances.",
    architectNote: "Service entry decisions must be frozen before reinforcement and pour drawings are issued.",
  })

  addItem({
    id: "steel-frame-package",
    title: "Steel frame package",
    categoryId: "structure",
    roomGroup: "General / whole project",
    roomSection: "Structure",
    typeGroup: "Structural shell",
    typeSection: "Primary structure",
    baselineSpec: "Portal-style steel frame within the control budget.",
    baselineBudgetExVat: 76000,
    description: "Main primary structure budget item.",
  })
  addItem({
    id: "secondary-structural-metalwork",
    title: "Secondary structural metalwork",
    categoryId: "structure",
    roomGroup: "General / whole project",
    roomSection: "Structure",
    typeGroup: "Structural shell",
    typeSection: "Secondary steel",
    baselineSpec: "Allowances for secondary steel, brackets, and local support metalwork.",
    baselineBudgetExVat: 5000,
    description: "Use this to contain local steel creep rather than letting it sit as undefined contractor extras.",
  })
  addItem({
    id: "timber-infill-and-structural-carpentry",
    title: "Timber infill and structural carpentry",
    categoryId: "structure",
    roomGroup: "General / whole project",
    roomSection: "Structure",
    typeGroup: "Structural shell",
    typeSection: "Secondary structure",
    baselineSpec: "Basic timber infill and structural carpentry around the steel frame.",
    baselineBudgetExVat: 7000,
    description: "Budget-bearing item for the non-steel structural elements that complete the shell.",
  })
  addItem({
    id: "visible-steel-finish-decision",
    title: "Visible steel finish decision",
    categoryId: "structure",
    roomGroup: "General / whole project",
    roomSection: "Structure",
    typeGroup: "Structural shell",
    typeSection: "Primary structure",
    baselineSpec: "Keep steel largely concealed or treated with standard protective finish only.",
    baselineBudgetExVat: 0,
    description: "Planning item only. Upgraded exposed steel treatment would be a conscious design uplift, not a baseline assumption.",
  })

  addItem({
    id: "pitched-roof-build-up",
    title: "Pitched roof build-up",
    categoryId: "roofs",
    roomGroup: "General / whole project",
    roomSection: "Roofing",
    typeGroup: "Roofing & rainwater",
    typeSection: "Pitched roofs",
    baselineSpec: "Controlled pitched roof covering and build-up.",
    baselineBudgetExVat: 20000,
    description: "Main pitched roof allowance.",
  })
  addItem({
    id: "flat-roof-links-build-up",
    title: "Flat roof link build-up",
    categoryId: "roofs",
    roomGroup: "General / whole project",
    roomSection: "Roofing",
    typeGroup: "Roofing & rainwater",
    typeSection: "Flat roofs",
    baselineSpec: "Warm roof link build-up with straightforward detailing.",
    baselineBudgetExVat: 8000,
    description: "Keep the link roofs technically disciplined; they are visually quiet but technically sensitive.",
  })
  addItem({
    id: "rainwater-goods-and-edge-trims",
    title: "Rainwater goods and roof edge trims",
    categoryId: "roofs",
    roomGroup: "General / whole project",
    roomSection: "Roofing",
    typeGroup: "Roofing & rainwater",
    typeSection: "Rainwater goods",
    baselineSpec: "Standard PPC gutters, outlets, and edge trims.",
    baselineBudgetExVat: 6000,
    description: "Budget-bearing roof drainage item.",
  })
  addItem({
    id: "rainwater-goods-visibility",
    title: "Rainwater goods visibility strategy",
    categoryId: "roofs",
    roomGroup: "General / whole project",
    roomSection: "Roofing",
    typeGroup: "Roofing & rainwater",
    typeSection: "Rainwater goods",
    baselineSpec: "Exposed practical rainwater goods unless a deliberate concealment upgrade is chosen.",
    baselineBudgetExVat: 0,
    description: "Planning item only. Concealed systems are a design-led cost uplift and coordination risk.",
  })

  addItem({
    id: "wall-build-up-and-insulation",
    title: "Wall build-up and insulation package",
    categoryId: "envelope",
    roomGroup: "General / whole project",
    roomSection: "Envelope",
    typeGroup: "Envelope & cladding",
    typeSection: "Wall build-up",
    baselineSpec: "Compliant wall build-up with disciplined insulation and membrane strategy.",
    baselineBudgetExVat: 18000,
    description: "Main thermal envelope allowance before cladding.",
  })
  addItem({
    id: "timber-cladding-package",
    title: "Timber cladding package",
    categoryId: "envelope",
    roomGroup: "General / whole project",
    roomSection: "Envelope",
    typeGroup: "Envelope & cladding",
    typeSection: "Cladding",
    baselineSpec: "Treated timber cladding with controlled hidden-fixing quality level.",
    baselineBudgetExVat: 48000,
    description: "Main visual envelope cost driver after glazing.",
  })
  addItem({
    id: "airtightness-membranes-and-testing",
    title: "Airtightness membranes and testing",
    categoryId: "envelope",
    roomGroup: "General / whole project",
    roomSection: "Envelope",
    typeGroup: "Envelope & cladding",
    typeSection: "Airtightness",
    baselineSpec: "Straightforward airtightness membranes, tapes, and testing within the build budget.",
    baselineBudgetExVat: 8000,
    description: "Keep this explicit, because performance depends on detailing discipline rather than only on product choice.",
  })
  addItem({
    id: "soffits-reveals-and-plinth",
    title: "Soffits, reveals, and plinth details",
    categoryId: "envelope",
    roomGroup: "General / whole project",
    roomSection: "Envelope",
    typeGroup: "Envelope & cladding",
    typeSection: "External details",
    baselineSpec: "Simple robust detail package to soffits, reveals, and plinth.",
    baselineBudgetExVat: 14000,
    description: "Budget-bearing detail package that controls how ‘resolved’ the house looks.",
  })
  addItem({
    id: "cladding-species-and-fixing-method",
    title: "Cladding species and fixing method",
    categoryId: "envelope",
    roomGroup: "General / whole project",
    roomSection: "Envelope",
    typeGroup: "Envelope & cladding",
    typeSection: "Cladding",
    baselineSpec: "Stay with the controlled larch / cedar style assumption and hidden-fixing intent already in budget.",
    baselineBudgetExVat: 0,
    description: "Planning item only. Use it to stop cladding quality drifting beyond the envelope budget.",
  })

  addItem({
    id: "main-slider-package",
    title: "Two 5m slider package",
    categoryId: "windows",
    roomGroup: "General / whole project",
    roomSection: "External openings",
    typeGroup: "Glazing & external doors",
    typeSection: "Large sliders",
    baselineSpec: "Two large minimal-frame aluminium sliders within the live glazing budget.",
    baselineBudgetExVat: 48000,
    quantity: 2,
    unit: "doors",
    description: "This is the main glazing cost driver in the house.",
  })
  addItem({
    id: "secondary-window-package",
    title: "Secondary window package",
    categoryId: "windows",
    roomGroup: "General / whole project",
    roomSection: "External openings",
    typeGroup: "Glazing & external doors",
    typeSection: "Windows",
    baselineSpec: "Remaining windows including the large guest-room window, corner window, master windows, utility window, and WC window.",
    baselineBudgetExVat: 18000,
    description: "Keep this grouped to avoid drifting through one-off bespoke frame requests.",
  })
  addItem({
    id: "front-door-assembly",
    title: "Front door and side-glazing assembly",
    categoryId: "windows",
    roomGroup: "General / whole project",
    roomSection: "External openings",
    typeGroup: "Glazing & external doors",
    typeSection: "Entrance doors",
    baselineSpec: "Architectural entrance assembly around 3m overall width, with one-sided glazing and controlled detailing.",
    baselineBudgetExVat: 8000,
    description: "Budget-bearing entrance composition item.",
  })
  addItem({
    id: "garage-door-package",
    title: "Garage door package",
    categoryId: "windows",
    roomGroup: "General / whole project",
    roomSection: "External openings",
    typeGroup: "Glazing & external doors",
    typeSection: "Garage doors",
    baselineSpec: "Insulated sectional garage door within the control budget.",
    baselineBudgetExVat: 6000,
    description: "Budget-bearing garage opening item.",
  })
  addItem({
    id: "glazing-opening-schedule",
    title: "Glazing opening schedule and ventilation strategy",
    categoryId: "windows",
    roomGroup: "General / whole project",
    roomSection: "External openings",
    typeGroup: "Glazing & external doors",
    typeSection: "Opening logic",
    baselineSpec: "Only openable windows where they are functionally needed; fixed panes elsewhere for cost and performance control.",
    baselineBudgetExVat: 0,
    description: "Planning item only. Use it to stop the glazing package becoming over-complicated.",
    architectNote: "Coordinate Part O overheating, purge ventilation, privacy, and furniture layout when deciding which panes open.",
  })

  addItem({
    id: "ashp-unit",
    title: "Air source heat pump",
    categoryId: "mech_elec",
    roomGroup: "General / whole project",
    roomSection: "Heating & plant",
    typeGroup: "Heating, plumbing & ventilation",
    typeSection: "Heating plant",
    baselineSpec: "Single ASHP sized for the house within the control budget.",
    baselineBudgetExVat: 14000,
    description: "Main heating plant cost item.",
  })
  addItem({
    id: "plant-room-fit-out",
    title: "Plant room fit-out",
    categoryId: "mech_elec",
    roomGroup: "General / whole project",
    roomSection: "Heating & plant",
    typeGroup: "Heating, plumbing & ventilation",
    typeSection: "Plant room",
    baselineSpec: "Controlled plant room with practical layout and acoustic discipline.",
    baselineBudgetExVat: 5000,
    description: "Keep plant-room coordination visible rather than treating it as contractor tidying-up.",
  })
  addItem({
    id: "underfloor-heating-system",
    title: "Underfloor heating system",
    categoryId: "mech_elec",
    roomGroup: "General / whole project",
    roomSection: "Heating & plant",
    typeGroup: "Heating, plumbing & ventilation",
    typeSection: "Heat emitters",
    baselineSpec: "Wet UFH through the main house within the control budget.",
    baselineBudgetExVat: 18000,
    description: "Main heat distribution item based on the all-electric servicing strategy.",
  })
  addItem({
    id: "mvhr-system",
    title: "MVHR system",
    categoryId: "mech_elec",
    roomGroup: "General / whole project",
    roomSection: "Heating & plant",
    typeGroup: "Heating, plumbing & ventilation",
    typeSection: "Ventilation",
    baselineSpec: "Whole-house MVHR system within the control budget.",
    baselineBudgetExVat: 12000,
    description: "Baseline assumption for ventilation and indoor air quality control.",
  })
  addItem({
    id: "hot-water-cylinder-and-buffer-tank",
    title: "Hot water cylinder and buffer tank",
    categoryId: "mech_elec",
    roomGroup: "General / whole project",
    roomSection: "Heating & plant",
    typeGroup: "Heating, plumbing & ventilation",
    typeSection: "Heating plant",
    baselineSpec: "Standard pressurised hot water cylinder and any small buffer requirement are assumed within the ASHP plant allowance.",
    baselineBudgetExVat: 0,
    description: "Planning item only. Keep it visible so plant-room space, access, and sizing are coordinated early.",
  })
  addItem({
    id: "plumbing-distribution",
    title: "Plumbing distribution and wastes",
    categoryId: "mech_elec",
    roomGroup: "General / whole project",
    roomSection: "Heating & plant",
    typeGroup: "Heating, plumbing & ventilation",
    typeSection: "Domestic plumbing",
    baselineSpec: "Standard hot, cold, and waste plumbing distribution within the control budget.",
    baselineBudgetExVat: 13000,
    description: "Main plumbing installation budget outside the bathroom and kitchen product allowances.",
  })
  addItem({
    id: "pressurised-water-system",
    title: "Pressurised water system",
    categoryId: "mech_elec",
    roomGroup: "General / whole project",
    roomSection: "Heating & plant",
    typeGroup: "Heating, plumbing & ventilation",
    typeSection: "Domestic plumbing",
    baselineSpec: "Pump, expansion vessel, and manifold arrangement are assumed within the current plumbing and plant allowances.",
    baselineBudgetExVat: 0,
    description: "Planning item only. Useful for locking in pressure strategy and cupboard / plant-room coordination.",
  })
  addItem({
    id: "electrical-first-and-second-fix",
    title: "Electrical first and second fix",
    categoryId: "mech_elec",
    roomGroup: "General / whole project",
    roomSection: "Electrical backbone",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Core electrical install",
    baselineSpec: "Full-house wiring, containment, and core first/second-fix electrical install excluding the separately tracked switch and dimmer plate package.",
    baselineBudgetExVat: 18000,
    description: "Main electrical labour and core installation allowance before the visible switch hardware selection.",
  })
  addItem({
    id: "physical-switches-and-dimmer-plates",
    title: "Physical switches and dimmer plates",
    categoryId: "mech_elec",
    roomGroup: "General / whole project",
    roomSection: "Electrical backbone",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Lighting controls",
    baselineSpec: "Controlled whole-house allowance for physical light switches, dimmers, and switch plate finish family.",
    baselineBudgetExVat: 2000,
    description: "Split out so plate finish, dimmer count, and hardware quality can be chosen deliberately without hiding inside the general electrical install.",
  })
  addItem({
    id: "consumer-unit-and-main-board",
    title: "Consumer unit and main board",
    categoryId: "mech_elec",
    roomGroup: "General / whole project",
    roomSection: "Electrical backbone",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Core electrical install",
    baselineSpec: "Consumer unit and main board arrangement are assumed within the core electrical install budget.",
    baselineBudgetExVat: 0,
    description: "Planning item only. Use it to confirm board count, three-phase strategy, and final location.",
  })
  addItem({
    id: "lighting-infrastructure",
    title: "Lighting infrastructure",
    categoryId: "mech_elec",
    roomGroup: "General / whole project",
    roomSection: "Electrical backbone",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Lighting infrastructure",
    baselineSpec: "Baseline lighting circuits, dimming allowances, and standard fitting infrastructure, including a dedicated recessed ceiling spotlight provision.",
    baselineBudgetExVat: 6000,
    description: "Covers the hidden side of lighting before decorative fixtures are chosen.",
  })
  addItem({
    id: "recessed-ceiling-spotlights",
    title: "Recessed ceiling spotlight provision",
    categoryId: "mech_elec",
    roomGroup: "General / whole project",
    roomSection: "Electrical backbone",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Lighting infrastructure",
    baselineSpec: "Allowance for 18 recessed LED ceiling spotlights: 8 across the main living volume, 2 per bedroom across 3 bedrooms, and 4 in the office.",
    baselineBudgetExVat: 2500,
    quantity: 18,
    unit: "spotlights",
    description: "Specific provision for the recessed downlight package so it is carried explicitly rather than assumed to disappear inside the core electrical figure.",
  })
  addItem({
    id: "decorative-light-fittings",
    title: "Decorative light fittings and feature pendants",
    categoryId: "mech_elec",
    roomGroup: "General / whole project",
    roomSection: "Electrical backbone",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Decorative lighting",
    baselineSpec: "Controlled whole-house decorative fitting allowance for pendants, wall lights, and selected feature fittings beyond the recessed spotlight package.",
    baselineBudgetExVat: 8000,
    description: "Separate this from electrical infrastructure so decorative lighting stays visible as a client choice budget.",
    decisionStage: "later",
  })
  addItem({
    id: "smart-lighting-control-system",
    title: "Smart lighting control system",
    categoryId: "mech_elec",
    roomGroup: "General / whole project",
    roomSection: "Electrical backbone",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Lighting controls",
    baselineSpec: "No dedicated smart lighting control system is included in the current baseline beyond standard dimming and switching.",
    baselineBudgetExVat: 0,
    description: "Later-stage upgrade item for scene control, app control, or systems like Lutron, KNX, or similar.",
    decisionStage: "later",
  })
  addItem({
    id: "data-alarm-and-entry-infrastructure",
    title: "Data, alarm, and entry infrastructure",
    categoryId: "mech_elec",
    roomGroup: "General / whole project",
    roomSection: "Electrical backbone",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Data & security",
    baselineSpec: "Basic data backbone, alarm routing, and front-door entry infrastructure.",
    baselineBudgetExVat: 4000,
    description: "Controlled low-voltage backbone allowance.",
  })
  addItem({
    id: "network-and-wifi-hardware",
    title: "Network and Wi-Fi hardware",
    categoryId: "mech_elec",
    roomGroup: "General / whole project",
    roomSection: "Electrical backbone",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Data & security",
    baselineSpec: "Router, switching, and Wi-Fi access points are assumed to sit within the low-voltage backbone allowance.",
    baselineBudgetExVat: 0,
    description: "Planning item only. Keep network hardware visible so coverage and cupboard space are considered deliberately.",
  })
  addItem({
    id: "intruder-alarm-system",
    title: "Intruder alarm system",
    categoryId: "mech_elec",
    roomGroup: "General / whole project",
    roomSection: "Electrical backbone",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Data & security",
    baselineSpec: "No dedicated monitored intruder alarm system is included beyond basic alarm routing and cabling.",
    baselineBudgetExVat: 0,
    description: "Later-stage security upgrade item if you want a full zoned alarm package.",
    decisionStage: "later",
  })
  addItem({
    id: "cctv-and-video-doorbell",
    title: "CCTV and video doorbell",
    categoryId: "mech_elec",
    roomGroup: "General / whole project",
    roomSection: "Electrical backbone",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Data & security",
    baselineSpec: "No dedicated CCTV or smart doorbell hardware is included in the baseline beyond cabling routes.",
    baselineBudgetExVat: 0,
    description: "Later-stage upgrade item for external cameras, NVR, and app-connected entry monitoring.",
    decisionStage: "later",
  })
  addItem({
    id: "smart-locks-and-access-control",
    title: "Smart locks and access control",
    categoryId: "mech_elec",
    roomGroup: "General / whole project",
    roomSection: "Electrical backbone",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Data & security",
    baselineSpec: "Standard locksets only are assumed in the current baseline, with no smart locking or wider access-control package included.",
    baselineBudgetExVat: 0,
    description: "Later-stage upgrade item for app-based locking, intercom-linked access, or integrated security control.",
    decisionStage: "later",
  })
  addItem({
    id: "fire-alarm-and-co-detection",
    title: "Fire alarm and CO detection",
    categoryId: "mech_elec",
    roomGroup: "General / whole project",
    roomSection: "Electrical backbone",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Data & security",
    baselineSpec: "Interlinked smoke and heat detection are assumed within the core electrical install, with no premium smart-system uplift carried.",
    baselineBudgetExVat: 0,
    description: "Planning item only. Keep detector strategy coordinated across open-plan, hall, and bedroom zones.",
  })
  addItem({
    id: "external-power-and-lighting-infrastructure",
    title: "External power and lighting infrastructure",
    categoryId: "mech_elec",
    roomGroup: "General / whole project",
    roomSection: "Electrical backbone",
    typeGroup: "Electrical, lighting & data",
    typeSection: "External power",
    baselineSpec: "Basic outside power and external lighting infrastructure.",
    baselineBudgetExVat: 4000,
    description: "Held separately so external electrical scope does not get forgotten until too late.",
  })
  addItem({
    id: "consumer-unit-and-comms-cupboard",
    title: "Consumer unit and communications cupboard location",
    categoryId: "mech_elec",
    roomGroup: "General / whole project",
    roomSection: "Electrical backbone",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Data & security",
    baselineSpec: "Keep a disciplined dedicated location for the consumer unit, router, and data hub.",
    baselineBudgetExVat: 0,
    description: "Planning item only. Cost is already within the electrical and data allowances.",
    architectNote: "Fix this now so it is not dumped into an inconvenient cupboard late in the design.",
  })

  addItem({
    id: "internal-doors-package",
    title: "Internal doors package",
    categoryId: "joinery",
    roomGroup: "General / whole project",
    roomSection: "Joinery & doors",
    typeGroup: "Joinery, doors & stairs",
    typeSection: "Internal doors",
    baselineSpec: "Paint-grade or controlled veneer internal doors within the joinery budget.",
    baselineBudgetExVat: 8000,
    description: "Main internal doors and frames allowance.",
  })
  addItem({
    id: "ironmongery-package",
    title: "Ironmongery package",
    categoryId: "joinery",
    roomGroup: "General / whole project",
    roomSection: "Joinery & doors",
    typeGroup: "Joinery, doors & stairs",
    typeSection: "Ironmongery",
    baselineSpec: "Single restrained ironmongery family across the house.",
    baselineBudgetExVat: 0,
    description: "Planning item only. Cost is assumed within the internal doors package unless a premium finish family is chosen.",
    decisionStage: "later",
  })
  addItem({
    id: "skirtings-and-architraves",
    title: "Skirtings and architraves",
    categoryId: "joinery",
    roomGroup: "General / whole project",
    roomSection: "Joinery & doors",
    typeGroup: "Joinery, doors & stairs",
    typeSection: "Trim carpentry",
    baselineSpec: "Simple controlled trim carpentry profile across the house.",
    baselineBudgetExVat: 0,
    description: "Planning item only. Cost is assumed inside the general joinery package.",
    decisionStage: "later",
  })
  addItem({
    id: "stair-structure",
    title: "Stair structure and substrate",
    categoryId: "internal_buildup",
    roomGroup: "General / whole project",
    roomSection: "Joinery & doors",
    typeGroup: "Joinery, doors & stairs",
    typeSection: "Stairs",
    baselineSpec: "Controlled stair structure and paint-grade substrate.",
    baselineBudgetExVat: 6000,
    description: "Budget-bearing stair structure allowance before any decorative balustrade uplift.",
  })
  addItem({
    id: "stair-balustrade-and-handrail",
    title: "Stair balustrade and handrail",
    categoryId: "joinery",
    roomGroup: "General / whole project",
    roomSection: "Joinery & doors",
    typeGroup: "Joinery, doors & stairs",
    typeSection: "Stairs",
    baselineSpec: "Straightforward balustrade and handrail package.",
    baselineBudgetExVat: 4000,
    description: "Budget-bearing finish item for the stair once the structure exists.",
  })

  addItem({
    id: "entrance-floor-finish",
    title: "Entrance floor finish",
    categoryId: "finishes",
    roomGroup: "Entranceway",
    roomSection: "Finishes",
    roomName: "Entranceway",
    typeGroup: "Floors, walls & decorating",
    typeSection: "Entrance floors",
    baselineSpec: "Controlled terrazzo floor within the entrance allowance.",
    baselineBudgetExVat: 3500,
    description: "This is one of the justified places for a strong, durable floor finish.",
  })
  addItem({
    id: "entrance-wall-finish",
    title: "Entrance wall finish",
    categoryId: "finishes",
    roomGroup: "Entranceway",
    roomSection: "Finishes",
    roomName: "Entranceway",
    typeGroup: "Floors, walls & decorating",
    typeSection: "Entrance walls",
    baselineSpec: "Paint-grade wall finish with no specialist decorative treatment.",
    baselineBudgetExVat: 0,
    description: "Planning item only. Keep decorative upgrades deliberate rather than accidental.",
    decisionStage: "later",
  })
  addItem({
    id: "entrance-storage-joinery",
    title: "Entrance storage joinery",
    categoryId: "joinery",
    roomGroup: "Entranceway",
    roomSection: "Joinery & storage",
    roomName: "Entranceway",
    typeGroup: "Joinery, doors & stairs",
    typeSection: "Entrance storage",
    baselineSpec: "Simple coat and shoe storage within the control budget.",
    baselineBudgetExVat: 2000,
    description: "Small but important discipline item; entry clutter is usually a design failure, not a styling issue.",
  })
  addItem({
    id: "entrance-power-layout",
    title: "Power layout and smart entry points",
    categoryId: "mech_elec",
    roomGroup: "Entranceway",
    roomSection: "Electrical & lighting",
    roomName: "Entranceway",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Entrance power",
    baselineSpec: "Allow 2 twin sockets, doorbell / intercom position, alarm routing, and smoke detection within the main electrical budget.",
    baselineBudgetExVat: 0,
    description: "Planning item only.",
  })
  addItem({
    id: "entrance-lighting-layout",
    title: "Lighting layout",
    categoryId: "mech_elec",
    roomGroup: "Entranceway",
    roomSection: "Electrical & lighting",
    roomName: "Entranceway",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Entrance lighting",
    baselineSpec: "Allow approximately 4 to 6 lighting points with a layered entry sequence.",
    baselineBudgetExVat: 0,
    description: "Planning item only. Coordinate arrival experience and glare from the glazed entrance composition.",
  })

  addItem({
    id: "kitchen-cabinetry-and-worktops",
    title: "Kitchen cabinetry and worktops",
    categoryId: "kitchen_utility",
    roomGroup: "Kitchen / dining / living",
    roomSection: "Kitchen",
    roomName: "Kitchen / dining / living",
    typeGroup: "Kitchen & utility",
    typeSection: "Kitchen joinery",
    baselineSpec: "Controlled kitchen cabinetry and worktop package aligned with the current allowance.",
    baselineBudgetExVat: 24000,
    description: "Main kitchen fit-out allowance.",
  })
  addItem({
    id: "kitchen-appliances",
    title: "Kitchen appliances",
    categoryId: "kitchen_utility",
    roomGroup: "Kitchen / dining / living",
    roomSection: "Kitchen",
    roomName: "Kitchen / dining / living",
    typeGroup: "Kitchen & utility",
    typeSection: "Appliances",
    baselineSpec: "Controlled appliance package aligned with the current appliance allowance.",
    baselineBudgetExVat: 15000,
    description: "Keep appliance inflation visible rather than hidden across multiple suppliers.",
  })
  addItem({
    id: "kitchen-sink-and-tap",
    title: "Kitchen sink and tap",
    categoryId: "kitchen_utility",
    roomGroup: "Kitchen / dining / living",
    roomSection: "Kitchen",
    roomName: "Kitchen / dining / living",
    typeGroup: "Kitchen & utility",
    typeSection: "Sinks & taps",
    baselineSpec: "Good-quality undermount sink and single mixer tap within the control budget.",
    baselineBudgetExVat: 1500,
    description: "This carries the working allowance for the kitchen sink zone, not the splashback or boiling tap uplift.",
  })
  addItem({
    id: "kitchen-island-layout",
    title: "Kitchen island layout",
    categoryId: "kitchen_utility",
    roomGroup: "Kitchen / dining / living",
    roomSection: "Kitchen",
    roomName: "Kitchen / dining / living",
    typeGroup: "Kitchen & utility",
    typeSection: "Kitchen planning",
    baselineSpec: "Single island within the existing kitchen budget and room layout.",
    baselineBudgetExVat: 0,
    description: "Planning item only. Island size has structural, lighting, and circulation consequences.",
    architectNote: "Freeze the island before power, lighting, and slider furniture layouts are finalized.",
  })
  addItem({
    id: "kitchen-splashback",
    title: "Kitchen splashback",
    categoryId: "kitchen_utility",
    roomGroup: "Kitchen / dining / living",
    roomSection: "Kitchen",
    roomName: "Kitchen / dining / living",
    typeGroup: "Kitchen & utility",
    typeSection: "Kitchen finishes",
    baselineSpec: "Simple durable splashback material within the controlled kitchen allowance.",
    baselineBudgetExVat: 0,
    description: "Planning item only unless a premium stone or specialist finish is chosen.",
    decisionStage: "later",
  })
  addItem({
    id: "living-kitchen-floor-finish",
    title: "Main living volume floor finish",
    categoryId: "finishes",
    roomGroup: "Kitchen / dining / living",
    roomSection: "Finishes",
    roomName: "Kitchen / dining / living",
    typeGroup: "Floors, walls & decorating",
    typeSection: "Living floors",
    baselineSpec: "Polished terrazzo across the principal living volume within the control budget.",
    baselineBudgetExVat: 14500,
    description: "Major finish item and one of the visible ‘good money’ decisions in the house.",
  })
  addItem({
    id: "living-walls-and-ceiling-finish",
    title: "Walls and ceiling finish",
    categoryId: "finishes",
    roomGroup: "Kitchen / dining / living",
    roomSection: "Finishes",
    roomName: "Kitchen / dining / living",
    typeGroup: "Floors, walls & decorating",
    typeSection: "Living walls",
    baselineSpec: "Paint-grade wall and ceiling finish with no specialist plaster or microcement baseline.",
    baselineBudgetExVat: 0,
    description: "Planning item only. Decorative upgrades here can destabilize the budget quickly.",
    decisionStage: "later",
  })
  addItem({
    id: "media-joinery",
    title: "Media and living-room joinery",
    categoryId: "joinery",
    roomGroup: "Kitchen / dining / living",
    roomSection: "Joinery & storage",
    roomName: "Kitchen / dining / living",
    typeGroup: "Joinery, doors & stairs",
    typeSection: "Media joinery",
    baselineSpec: "Minimal or no bespoke media joinery in the baseline budget.",
    baselineBudgetExVat: 2000,
    description: "Small allowance only; a more bespoke installation would need to be a conscious upgrade.",
  })
  addItem({
    id: "living-power-layout",
    title: "Power and appliance layout",
    categoryId: "mech_elec",
    roomGroup: "Kitchen / dining / living",
    roomSection: "Electrical & lighting",
    roomName: "Kitchen / dining / living",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Living power & data",
    baselineSpec: "Allow approximately 18 twin sockets, appliance feeds, and 2 to 3 data points within the main electrical budget.",
    baselineBudgetExVat: 0,
    description: "Planning item only. This is the room most likely to be under-specified if power is treated casually.",
  })
  addItem({
    id: "living-lighting-layout",
    title: "Lighting layout and scenes",
    categoryId: "mech_elec",
    roomGroup: "Kitchen / dining / living",
    roomSection: "Electrical & lighting",
    roomName: "Kitchen / dining / living",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Living lighting",
    baselineSpec: "Allow approximately 12 to 16 lighting points including 8 recessed ceiling spotlights across the main volume, task lighting, and feature pendants within the main electrical budget.",
    baselineBudgetExVat: 0,
    description: "Planning item only. The room needs layered lighting, with the 8 recessed spotlights treated as the ambient layer rather than the whole scheme.",
    architectNote: "Coordinate pendants, task lighting, island lighting, and glare control at the big sliders.",
  })

  addItem({
    id: "office-floor-finish",
    title: "Floor finish",
    categoryId: "finishes",
    roomGroup: "Office",
    roomSection: "Finishes",
    roomName: "Office",
    typeGroup: "Floors, walls & decorating",
    typeSection: "Study floors",
    baselineSpec: "Engineered oak floor within the control budget.",
    baselineBudgetExVat: 1400,
    description: "Keep the office durable and consistent with the bedroom-quality oak finish level.",
  })
  addItem({
    id: "office-wall-finish",
    title: "Wall finish",
    categoryId: "finishes",
    roomGroup: "Office",
    roomSection: "Finishes",
    roomName: "Office",
    typeGroup: "Floors, walls & decorating",
    typeSection: "Study walls",
    baselineSpec: "Paint-grade wall finish with no specialist treatment assumed.",
    baselineBudgetExVat: 0,
    description: "Planning item only.",
    decisionStage: "later",
  })
  addItem({
    id: "office-desk-and-storage-joinery",
    title: "Desk and storage joinery",
    categoryId: "joinery",
    roomGroup: "Office",
    roomSection: "Joinery & storage",
    roomName: "Office",
    typeGroup: "Joinery, doors & stairs",
    typeSection: "Study joinery",
    baselineSpec: "Loose furniture only unless a built-in desk is deliberately chosen.",
    baselineBudgetExVat: 0,
    description: "No bespoke office joinery is assumed in the baseline build budget.",
  })
  addItem({
    id: "office-power-layout",
    title: "Power and data layout",
    categoryId: "mech_elec",
    roomGroup: "Office",
    roomSection: "Electrical & lighting",
    roomName: "Office",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Study power & data",
    baselineSpec: "Allow 6 twin sockets and 2 data points within the main electrical budget.",
    baselineBudgetExVat: 0,
    description: "Planning item only.",
  })
  addItem({
    id: "office-lighting-layout",
    title: "Lighting layout",
    categoryId: "mech_elec",
    roomGroup: "Office",
    roomSection: "Electrical & lighting",
    roomName: "Office",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Study lighting",
    baselineSpec: "Allow approximately 4 to 5 lighting points including 4 recessed ceiling spotlights and desk-task support within the main electrical budget.",
    baselineBudgetExVat: 0,
    description: "Planning item only.",
  })

  addItem({
    id: "utility-cabinetry-and-worktop",
    title: "Utility cabinetry and worktop",
    categoryId: "kitchen_utility",
    roomGroup: "Laundry room",
    roomSection: "Utility",
    roomName: "Laundry room",
    typeGroup: "Kitchen & utility",
    typeSection: "Utility joinery",
    baselineSpec: "Controlled utility cabinetry and worktop package.",
    baselineBudgetExVat: 1500,
    description: "Keep utility fit-out serviceable and tidy without turning it into a second bespoke kitchen.",
  })
  addItem({
    id: "utility-wall-units-and-shelving",
    title: "Utility wall units and shelving",
    categoryId: "kitchen_utility",
    roomGroup: "Laundry room",
    roomSection: "Utility",
    roomName: "Laundry room",
    typeGroup: "Kitchen & utility",
    typeSection: "Utility joinery",
    baselineSpec: "Any modest wall units or shelving are assumed within the controlled utility cabinetry allowance rather than as a separate budget uplift.",
    baselineBudgetExVat: 0,
    description: "Planning item only. Use it to pin down whether the utility stays basic or becomes more fitted.",
  })
  addItem({
    id: "utility-sink-and-tap",
    title: "Utility sink and tap",
    categoryId: "kitchen_utility",
    roomGroup: "Laundry room",
    roomSection: "Utility",
    roomName: "Laundry room",
    typeGroup: "Kitchen & utility",
    typeSection: "Sinks & taps",
    baselineSpec: "Basic utility sink and mixer tap within the control budget.",
    baselineBudgetExVat: 500,
    description: "Small but explicit utility sink allowance so the room can be specified cleanly.",
  })
  addItem({
    id: "utility-washing-machine",
    title: "Washing machine",
    categoryId: "kitchen_utility",
    roomGroup: "Laundry room",
    roomSection: "Utility",
    roomName: "Laundry room",
    typeGroup: "Kitchen & utility",
    typeSection: "Utility appliances",
    baselineSpec: "No supply-only washing machine allowance is currently carried in the construction budget.",
    baselineBudgetExVat: 0,
    description: "Owner-supplied appliance placeholder so the utility room scope can still be decided here.",
    decisionStage: "later",
  })
  addItem({
    id: "utility-tumble-dryer",
    title: "Tumble dryer",
    categoryId: "kitchen_utility",
    roomGroup: "Laundry room",
    roomSection: "Utility",
    roomName: "Laundry room",
    typeGroup: "Kitchen & utility",
    typeSection: "Utility appliances",
    baselineSpec: "No supply-only tumble dryer allowance is currently carried in the construction budget.",
    baselineBudgetExVat: 0,
    description: "Owner-supplied appliance placeholder so ventilation, condensate, and stacking decisions are still tracked.",
    decisionStage: "later",
  })
  addItem({
    id: "utility-floor-finish",
    title: "Floor finish",
    categoryId: "finishes",
    roomGroup: "Laundry room",
    roomSection: "Finishes",
    roomName: "Laundry room",
    typeGroup: "Floors, walls & decorating",
    typeSection: "Utility floors",
    baselineSpec: "Durable serviceable hard floor within the control budget.",
    baselineBudgetExVat: 1500,
    description: "Use a practical floor that can deal with moisture and cleaning.",
  })
  addItem({
    id: "utility-wall-finish",
    title: "Wall finish",
    categoryId: "finishes",
    roomGroup: "Laundry room",
    roomSection: "Finishes",
    roomName: "Laundry room",
    typeGroup: "Floors, walls & decorating",
    typeSection: "Utility walls",
    baselineSpec: "Paint-grade or washable utility finish with no specialist material assumed.",
    baselineBudgetExVat: 0,
    description: "Planning item only.",
    decisionStage: "later",
  })
  addItem({
    id: "utility-appliance-layout",
    title: "Washer, dryer, and services layout",
    categoryId: "mech_elec",
    roomGroup: "Laundry room",
    roomSection: "Electrical & plumbing",
    roomName: "Laundry room",
    typeGroup: "Heating, plumbing & ventilation",
    typeSection: "Utility plumbing",
    baselineSpec: "Controlled washer / dryer layout within the main utility plumbing and electrical budget.",
    baselineBudgetExVat: 0,
    description: "Planning item only.",
  })
  addItem({
    id: "utility-power-and-lighting",
    title: "Power and lighting layout",
    categoryId: "mech_elec",
    roomGroup: "Laundry room",
    roomSection: "Electrical & plumbing",
    roomName: "Laundry room",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Utility power & lighting",
    baselineSpec: "Allow 4 twin sockets, dedicated appliance feeds, and 3 lighting points within the main electrical budget.",
    baselineBudgetExVat: 0,
    description: "Planning item only.",
  })

  addItem({
    id: "circulation-floor-finish",
    title: "Hall and stair circulation floor finish",
    categoryId: "finishes",
    roomGroup: "Hallways / stair / circulation",
    roomSection: "Finishes",
    roomName: "Hallways / stair / circulation",
    typeGroup: "Floors, walls & decorating",
    typeSection: "Circulation floors",
    baselineSpec: "Engineered oak or continuous controlled floor finish to circulation spaces.",
    baselineBudgetExVat: 1500,
    description: "Hold the circulation finish consistently so it does not get lost between room budgets.",
  })
  addItem({
    id: "circulation-wall-finish",
    title: "Hall and stair wall finish",
    categoryId: "finishes",
    roomGroup: "Hallways / stair / circulation",
    roomSection: "Finishes",
    roomName: "Hallways / stair / circulation",
    typeGroup: "Floors, walls & decorating",
    typeSection: "Circulation walls",
    baselineSpec: "Paint-grade wall finish to circulation spaces.",
    baselineBudgetExVat: 0,
    description: "Planning item only.",
    decisionStage: "later",
  })
  addItem({
    id: "understairs-or-circulation-storage",
    title: "Circulation storage",
    categoryId: "joinery",
    roomGroup: "Hallways / stair / circulation",
    roomSection: "Joinery & storage",
    roomName: "Hallways / stair / circulation",
    typeGroup: "Joinery, doors & stairs",
    typeSection: "Circulation storage",
    baselineSpec: "No major bespoke storage beyond practical basic joinery unless deliberately added.",
    baselineBudgetExVat: 0,
    description: "Keep this explicit because hallway and stair storage is often omitted from early drawings.",
  })
  addItem({
    id: "circulation-lighting",
    title: "Circulation lighting layout",
    categoryId: "mech_elec",
    roomGroup: "Hallways / stair / circulation",
    roomSection: "Electrical & lighting",
    roomName: "Hallways / stair / circulation",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Circulation lighting",
    baselineSpec: "Allow 6 to 8 lighting points across hall and stair circulation within the main electrical budget.",
    baselineBudgetExVat: 0,
    description: "Planning item only.",
  })
  addItem({
    id: "circulation-power",
    title: "Circulation power layout",
    categoryId: "mech_elec",
    roomGroup: "Hallways / stair / circulation",
    roomSection: "Electrical & lighting",
    roomName: "Hallways / stair / circulation",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Circulation power",
    baselineSpec: "Allow 2 twin sockets and smoke detection within the main electrical budget.",
    baselineBudgetExVat: 0,
    description: "Planning item only.",
  })

  addItem({
    id: "principal-bedroom-floor-finish",
    title: "Bedroom floor finish",
    categoryId: "finishes",
    roomGroup: "Master bedroom",
    roomSection: "Bedroom",
    roomName: "Master bedroom",
    typeGroup: "Floors, walls & decorating",
    typeSection: "Principal bedroom floors",
    baselineSpec: "Engineered oak floor within the principal bedroom allowance.",
    baselineBudgetExVat: 2500,
    description: "One of the bedroom finish upgrades that may justify slightly better quality than the guest rooms.",
  })
  addItem({
    id: "principal-bedroom-wall-finish",
    title: "Bedroom wall finish",
    categoryId: "finishes",
    roomGroup: "Master bedroom",
    roomSection: "Bedroom",
    roomName: "Master bedroom",
    typeGroup: "Floors, walls & decorating",
    typeSection: "Principal bedroom walls",
    baselineSpec: "Paint-grade principal bedroom wall finish with no specialist finish assumed.",
    baselineBudgetExVat: 0,
    description: "Planning item only.",
    decisionStage: "later",
  })
  addItem({
    id: "principal-wardrobes",
    title: "Wardrobes and dressing storage",
    categoryId: "joinery",
    roomGroup: "Master bedroom",
    roomSection: "Bedroom",
    roomName: "Master bedroom",
    typeGroup: "Joinery, doors & stairs",
    typeSection: "Bedroom wardrobes",
    baselineSpec: "Controlled fitted wardrobe allowance for the principal suite.",
    baselineBudgetExVat: 5000,
    description: "This is the main wardrobe spend in the house; keep it focused here rather than over-joining all bedrooms.",
  })
  addItem({
    id: "principal-bedside-joinery",
    title: "Bedside joinery and headboard integration",
    categoryId: "joinery",
    roomGroup: "Master bedroom",
    roomSection: "Bedroom",
    roomName: "Master bedroom",
    typeGroup: "Joinery, doors & stairs",
    typeSection: "Bedroom joinery",
    baselineSpec: "No bespoke bedside joinery assumed unless deliberately added.",
    baselineBudgetExVat: 0,
    description: "Planning item only.",
  })
  addItem({
    id: "principal-power-and-data",
    title: "Power and data layout",
    categoryId: "mech_elec",
    roomGroup: "Master bedroom",
    roomSection: "Electrical & lighting",
    roomName: "Master bedroom",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Bedroom power & data",
    baselineSpec: "Allow 8 twin sockets and 2 data points within the main electrical budget.",
    baselineBudgetExVat: 0,
    description: "Planning item only.",
  })
  addItem({
    id: "principal-lighting-layout",
    title: "Lighting layout",
    categoryId: "mech_elec",
    roomGroup: "Master bedroom",
    roomSection: "Electrical & lighting",
    roomName: "Master bedroom",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Bedroom lighting",
    baselineSpec: "Allow 6 to 8 lighting points, including 2 recessed ceiling spotlights, bedside control, and wardrobe lighting provision, within the main electrical budget.",
    baselineBudgetExVat: 0,
    description: "Planning item only.",
  })

  addBathroom({
    addItem,
    roomGroup: "His ensuite",
    roomLabel: "His ensuite",
    hasBath: false,
    wcBudget: 1000,
    basinBudget: 1800,
    tapBudget: 700,
    showerBudget: 2500,
    tilingBudget: 5000,
    mirrorBudget: 700,
    accessoryBudget: 600,
    towelRailBudget: 400,
    electricalNote:
      "Allow mirror feed, extract, towel rail connection, and approximately 3 lighting points within the main electrical budget.",
  })

  addBathroom({
    addItem,
    roomGroup: "Her ensuite",
    roomLabel: "Her ensuite",
    hasBath: true,
    wcBudget: 900,
    basinBudget: 1200,
    tapBudget: 500,
    showerBudget: 0,
    bathBudget: 1600,
    tilingBudget: 4500,
    mirrorBudget: 500,
    accessoryBudget: 300,
    towelRailBudget: 200,
    electricalNote:
      "Allow mirror feed, extract, towel rail connection, and approximately 2 lighting points within the main electrical budget.",
  })

  addItem({
    id: "bathroom-glass-and-screens",
    title: "Bathroom glass screens and shower enclosures",
    categoryId: "bathrooms",
    roomGroup: "General / whole project",
    roomSection: "Bathrooms",
    typeGroup: "Bathrooms & sanitaryware",
    typeSection: "Shower glass",
    baselineSpec: "Controlled allowance for shower glass and necessary bathroom screens across the house.",
    baselineBudgetExVat: 4000,
    description: "Separate this from the shower fittings so glass and enclosure creep stays visible.",
  })

  addBedroom({
    addItem,
    roomGroup: "Guest bedroom 1",
    roomLabel: "Guest bedroom 1",
    wardrobeBudget: 2500,
    floorBudget: 1200,
    wallBudget: 0,
    socketCount: 4,
    dataPoints: 1,
    lightingPoints: 4,
  })

  addBedroom({
    addItem,
    roomGroup: "Guest bedroom 2",
    roomLabel: "Guest bedroom 2",
    wardrobeBudget: 2500,
    floorBudget: 1300,
    wallBudget: 0,
    socketCount: 4,
    dataPoints: 1,
    lightingPoints: 4,
  })

  addBathroom({
    addItem,
    roomGroup: "Guest bedroom 1 ensuite",
    roomLabel: "Guest bedroom 1 ensuite",
    hasBath: false,
    wcBudget: 900,
    basinBudget: 1200,
    tapBudget: 500,
    showerBudget: 2200,
    tilingBudget: 4000,
    mirrorBudget: 500,
    accessoryBudget: 400,
    towelRailBudget: 300,
    electricalNote:
      "Allow mirror feed, extract, towel rail connection, and approximately 2 lighting points within the main electrical budget.",
  })

  addBathroom({
    addItem,
    roomGroup: "Guest bedroom 2 ensuite",
    roomLabel: "Guest bedroom 2 ensuite",
    hasBath: false,
    wcBudget: 900,
    basinBudget: 1200,
    tapBudget: 500,
    showerBudget: 2200,
    tilingBudget: 4000,
    mirrorBudget: 500,
    accessoryBudget: 400,
    towelRailBudget: 300,
    electricalNote:
      "Allow mirror feed, extract, towel rail connection, and approximately 2 lighting points within the main electrical budget.",
  })

  addBathroom({
    addItem,
    roomGroup: "Powder room",
    roomLabel: "Powder room",
    hasBath: false,
    wcBudget: 800,
    basinBudget: 1200,
    tapBudget: 300,
    showerBudget: 0,
    tilingBudget: 1200,
    mirrorBudget: 200,
    accessoryBudget: 250,
    towelRailBudget: 0,
    electricalNote:
      "Allow extractor, mirror light or mirrored cabinet feed, and approximately 2 lighting points within the main electrical budget.",
  })

  addItem({
    id: "garage-floor-finish",
    title: "Garage floor finish",
    categoryId: "finishes",
    roomGroup: "Garage",
    roomSection: "Finishes",
    roomName: "Garage",
    typeGroup: "Floors, walls & decorating",
    typeSection: "Garage finishes",
    baselineSpec: "Basic power-floated concrete garage floor within the control budget.",
    baselineBudgetExVat: 1500,
    description: "This is intentionally not a premium polished or resin system in the baseline budget.",
  })
  addItem({
    id: "garage-wall-finish",
    title: "Garage wall finish",
    categoryId: "finishes",
    roomGroup: "Garage",
    roomSection: "Finishes",
    roomName: "Garage",
    typeGroup: "Floors, walls & decorating",
    typeSection: "Garage finishes",
    baselineSpec: "Basic plastered / serviceable garage wall finish only.",
    baselineBudgetExVat: 0,
    description: "Planning item only.",
  })
  addItem({
    id: "garage-storage-and-workbench",
    title: "Garage storage and workbench",
    categoryId: "joinery",
    roomGroup: "Garage",
    roomSection: "Joinery & storage",
    roomName: "Garage",
    typeGroup: "Joinery, doors & stairs",
    typeSection: "Garage storage",
    baselineSpec: "No major bespoke garage fit-out is assumed in the baseline budget.",
    baselineBudgetExVat: 0,
    description: "Keep workshop ambitions separate from the main build if budget is tight.",
  })
  addItem({
    id: "garage-power-layout",
    title: "Garage power layout",
    categoryId: "mech_elec",
    roomGroup: "Garage",
    roomSection: "Electrical & lighting",
    roomName: "Garage",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Garage power",
    baselineSpec: "Allow 6 twin sockets, EV charger provision, and garage door power within the main electrical budget.",
    baselineBudgetExVat: 0,
    description: "Planning item only.",
  })
  addItem({
    id: "garage-lighting-layout",
    title: "Garage lighting layout",
    categoryId: "mech_elec",
    roomGroup: "Garage",
    roomSection: "Electrical & lighting",
    roomName: "Garage",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Garage lighting",
    baselineSpec: "Allow approximately 6 practical garage lighting points within the main electrical budget.",
    baselineBudgetExVat: 0,
    description: "Planning item only.",
  })
  addItem({
    id: "ev-charger",
    title: "EV charger",
    categoryId: "utilities",
    roomGroup: "Garage",
    roomSection: "Electrical & lighting",
    roomName: "Garage",
    typeGroup: "Electrical, lighting & data",
    typeSection: "Garage power",
    baselineSpec: "Single EV charger and wiring within the control budget.",
    baselineBudgetExVat: 1500,
    description: "Budget-bearing EV item already in the project assumptions.",
  })

  addItem({
    id: "courtyard-threshold-drainage",
    title: "Courtyard threshold drainage",
    categoryId: "groundworks",
    roomGroup: "Courtyard / external interface",
    roomSection: "Drainage & thresholds",
    roomName: "Courtyard / external interface",
    typeGroup: "External works & courtyard",
    typeSection: "Thresholds",
    baselineSpec: "Simple robust drainage and threshold handling to the courtyard edges.",
    baselineBudgetExVat: 0,
    description: "Planning item only. Cost is already within the groundworks drainage package.",
    architectNote: "Resolve this with slider thresholds and floor levels, not as a late technical patch.",
  })
  addItem({
    id: "whole-house-decorating",
    title: "Whole-house decorating package",
    categoryId: "finishes",
    roomGroup: "General / whole project",
    roomSection: "Finishes",
    typeGroup: "Floors, walls & decorating",
    typeSection: "Decorating",
    baselineSpec: "Controlled whole-house painting and decorating package with standard systems only.",
    baselineBudgetExVat: 18000,
    description: "Explicitly holds the decorating budget that otherwise disappears into general contractor numbers.",
    decisionStage: "later",
  })
  addItem({
    id: "specialist-clay-plaster-finish",
    title: "Specialist clay plaster finish",
    categoryId: "finishes",
    roomGroup: "General / whole project",
    roomSection: "Finishes",
    typeGroup: "Floors, walls & decorating",
    typeSection: "Specialist plaster",
    baselineSpec: "No whole-house clay plaster or similar specialist wall-and-ceiling finish is included in the current baseline.",
    baselineBudgetExVat: 0,
    description: "Later-stage upgrade item if you want to replace the standard decorated plaster finish with a specialist clay system.",
    decisionStage: "later",
  })
  addItem({
    id: "courtyard-external-lighting",
    title: "Courtyard external lighting",
    categoryId: "mech_elec",
    roomGroup: "Courtyard / external interface",
    roomSection: "Lighting & services",
    roomName: "Courtyard / external interface",
    typeGroup: "Electrical, lighting & data",
    typeSection: "External lighting",
    baselineSpec: "Restrained practical courtyard lighting within the main external electrical budget.",
    baselineBudgetExVat: 0,
    description: "Planning item only.",
  })
  addItem({
    id: "courtyard-external-power-and-tap",
    title: "Courtyard external power and water point",
    categoryId: "utilities",
    roomGroup: "Courtyard / external interface",
    roomSection: "Lighting & services",
    roomName: "Courtyard / external interface",
    typeGroup: "External works & courtyard",
    typeSection: "External utilities",
    baselineSpec: "Single external tap and practical external power point provision only.",
    baselineBudgetExVat: 0,
    description: "Planning item only. Cost is already assumed inside the wider utilities and external electrical allowances.",
  })
  addItem({
    id: "courtyard-finish-placeholder",
    title: "Courtyard finish placeholder",
    categoryId: "courtyard_finish_longterm",
    roomGroup: "Courtyard / external interface",
    roomSection: "Long-term items",
    roomName: "Courtyard / external interface",
    typeGroup: "External works & courtyard",
    typeSection: "Courtyard fit-out",
    baselineSpec: "No active courtyard fit-out budget in this phase beyond essential building interfaces.",
    baselineBudgetExVat: 0,
    description: "This remains outside the active build budget unless you consciously bring it forward.",
    decisionStage: "later",
  })
  addItem({
    id: "entrance-gate-and-access-automation",
    title: "Entrance gate and access automation",
    categoryId: "landscaping",
    roomGroup: "Courtyard / external interface",
    roomSection: "Long-term items",
    roomName: "Courtyard / external interface",
    typeGroup: "External works & courtyard",
    typeSection: "Access & boundaries",
    baselineSpec: "No entrance gate or gate automation is included in the active construction budget.",
    baselineBudgetExVat: 0,
    description: "Track this here if you decide to bring the entrance gate into the project scope later.",
    decisionStage: "later",
  })
  addItem({
    id: "driveway-and-approach-finish",
    title: "Driveway and approach finish",
    categoryId: "landscaping",
    roomGroup: "Courtyard / external interface",
    roomSection: "Long-term items",
    roomName: "Courtyard / external interface",
    typeGroup: "External works & courtyard",
    typeSection: "Access & boundaries",
    baselineSpec: "No full driveway package is included in the active construction budget beyond immediate functional access.",
    baselineBudgetExVat: 0,
    description: "Long-term external works placeholder for a no-dig driveway or upgraded approach finish.",
    decisionStage: "later",
  })
  addItem({
    id: "fencing-and-planting-package",
    title: "Fencing and planting package",
    categoryId: "landscaping",
    roomGroup: "Courtyard / external interface",
    roomSection: "Long-term items",
    roomName: "Courtyard / external interface",
    typeGroup: "External works & courtyard",
    typeSection: "Access & boundaries",
    baselineSpec: "Boundary fencing, planting, and soft landscaping remain outside the active build budget.",
    baselineBudgetExVat: 0,
    description: "Long-term external works placeholder for boundary treatment and planting once the core build is complete.",
    decisionStage: "later",
  })

  return items
}

function createSeedId(prefix, value) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return `${prefix}-${slug || prefix}`
}

function deriveRooms(items) {
  const rooms = []
  const seen = new Set()

  for (const item of items) {
    if (seen.has(item.roomGroup)) continue
    seen.add(item.roomGroup)
    rooms.push({
      id: createSeedId("room", item.roomGroup),
      name: item.roomGroup,
      sortOrder: Number(item.roomGroupOrder || 999),
    })
  }

  return rooms
}

function deriveDecisionCategories(items) {
  const categories = []
  const seen = new Set()

  for (const item of items) {
    if (seen.has(item.roomSection)) continue
    seen.add(item.roomSection)
    categories.push({
      id: createSeedId("dec-cat", item.roomSection),
      name: item.roomSection,
      sortOrder: categories.length * 10 + 10,
    })
  }

  return categories
}

async function tableHasColumn(client, tableName, columnName) {
  const result = await client.query(
    `
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
        and column_name = $2
      limit 1
    `,
    [tableName, columnName],
  )

  return result.rowCount > 0
}

async function getDecisionItemsShape(client) {
  const tableResult = await client.query(
    `select to_regclass('public.decision_items')::text as table_name`,
  )
  const tableName = tableResult.rows[0]?.table_name

  if (!tableName) {
    return "missing"
  }

  const hasLegacyRoomGroup = await tableHasColumn(client, "decision_items", "room_group")
  const hasNormalizedRoomId = await tableHasColumn(client, "decision_items", "room_id")

  if (hasLegacyRoomGroup && !hasNormalizedRoomId) {
    return "legacy"
  }

  return "normalized"
}

async function dropDecisionTables(client) {
  await client.query(`drop table if exists decision_selections`)
  await client.query(`drop table if exists decision_items`)
  await client.query(`drop table if exists decision_categories`)
  await client.query(`drop table if exists decision_rooms`)
}

async function ensureNormalizedSchema(client) {
  await client.query(`
    create table if not exists decision_rooms (
      id text primary key,
      name text not null unique,
      sort_order integer not null default 999,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `)

  await client.query(`
    create table if not exists decision_categories (
      id text primary key,
      name text not null unique,
      sort_order integer not null default 999,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `)

  await client.query(`
    create table if not exists decision_items (
      id text primary key,
      code text not null unique,
      title text not null,
      budget_category_id text not null,
      room_id text not null references decision_rooms(id),
      decision_category_id text not null references decision_categories(id),
      type_group text not null,
      type_section text not null,
      item_order integer not null default 0,
      baseline_spec text not null,
      baseline_budget_ex_vat numeric(12,2) not null default 0,
      quantity numeric(12,2),
      unit text,
      decision_stage text not null default 'now',
      priority text not null default 'medium',
      description text,
      architect_note text,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `)

  await client.query(`
    create table if not exists decision_selections (
      id text primary key,
      item_id text not null references decision_items(id) on delete cascade,
      status text not null,
      selected_name text,
      selected_source text,
      selected_source_url text,
      selected_cost_ex_vat numeric(12,2),
      selected_notes text,
      selected_images jsonb not null default '[]'::jsonb,
      is_current boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `)

  await client.query(`
    alter table decision_selections
    add column if not exists selected_images jsonb not null default '[]'::jsonb
  `)

  await client.query(`
    create index if not exists decision_items_room_idx
    on decision_items (room_id, decision_category_id, item_order)
  `)

  await client.query(`
    create index if not exists decision_items_type_idx
    on decision_items (type_group, type_section, item_order)
  `)

  await client.query(`
    create unique index if not exists decision_selections_current_idx
    on decision_selections (item_id)
    where is_current = true
  `)
}

async function insertNormalizedDecisionData(client, items) {
  const rooms = deriveRooms(items)
  const decisionCategories = deriveDecisionCategories(items)
  const roomIdByName = new Map(rooms.map((room) => [room.name, room.id]))
  const decisionCategoryIdByName = new Map(
    decisionCategories.map((category) => [category.name, category.id]),
  )

  for (const room of rooms) {
    await client.query(
      `
        insert into decision_rooms (id, name, sort_order, is_active)
        values ($1, $2, $3, true)
      `,
      [room.id, room.name, room.sortOrder],
    )
  }

  for (const category of decisionCategories) {
    await client.query(
      `
        insert into decision_categories (id, name, sort_order, is_active)
        values ($1, $2, $3, true)
      `,
      [category.id, category.name, category.sortOrder],
    )
  }

  for (const item of items) {
    await client.query(
      `
        insert into decision_items (
          id,
          code,
          title,
          budget_category_id,
          room_id,
          decision_category_id,
          type_group,
          type_section,
          item_order,
          baseline_spec,
          baseline_budget_ex_vat,
          quantity,
          unit,
          decision_stage,
          priority,
          description,
          architect_note,
          is_active
        )
        values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,true
        )
      `,
      [
        item.id,
        item.code,
        item.title,
        item.categoryId,
        roomIdByName.get(item.roomGroup),
        decisionCategoryIdByName.get(item.roomSection),
        item.typeGroup,
        item.typeSection,
        item.itemOrder,
        item.baselineSpec,
        item.baselineBudgetExVat,
        item.quantity,
        item.unit,
        item.decisionStage,
        item.priority,
        item.description,
        item.architectNote,
      ],
    )

    if (item.status && item.status !== "open") {
      await client.query(
        `
          insert into decision_selections (
            id,
            item_id,
            status,
            selected_name,
            selected_source,
            selected_source_url,
            selected_cost_ex_vat,
            selected_notes,
            selected_images,
            is_current
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
        `,
        [
          `sel-${item.id}`,
          item.id,
          item.status,
          item.selectedName || null,
          item.selectedSource || null,
          item.selectedSourceUrl || null,
          item.selectedCostExVat ?? null,
          item.selectedNotes || null,
          JSON.stringify(item.selectedImages || []),
        ],
      )
    }
  }

  return {
    roomCount: rooms.length,
    categoryCount: decisionCategories.length,
    itemCount: items.length,
    baselineBudgetExVat: items.reduce(
      (sum, item) => sum + Number(item.baselineBudgetExVat || 0),
      0,
    ),
  }
}

async function main() {
  await loadEnvFile(".env")
  await loadEnvFile(".env.local")

  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.")
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl:
      databaseUrl.includes("sslmode=require")
        ? { rejectUnauthorized: false }
        : undefined,
  })

  const client = await pool.connect()

  try {
    await client.query("begin")

    const forceReset = process.argv.includes("--force-reset")
    const shape = await getDecisionItemsShape(client)
    let insertSummary = null

    if (forceReset || shape === "legacy") {
      let itemsToInsert = []

      if (!forceReset && shape === "legacy") {
        const legacyResult = await client.query(`
          select
            id,
            code,
            title,
            category_id as "categoryId",
            room_group as "roomGroup",
            room_section as "roomSection",
            coalesce(room_name, room_group) as "roomName",
            type_group as "typeGroup",
            type_section as "typeSection",
            room_group_order as "roomGroupOrder",
            room_section_order as "roomSectionOrder",
            type_group_order as "typeGroupOrder",
            type_section_order as "typeSectionOrder",
            item_order as "itemOrder",
            baseline_spec as "baselineSpec",
            baseline_budget_ex_vat as "baselineBudgetExVat",
            quantity,
            unit,
            decision_stage as "decisionStage",
            priority,
            description,
            architect_note as "architectNote",
            status,
            selected_name as "selectedName",
            selected_source as "selectedSource",
            selected_source_url as "selectedSourceUrl",
            selected_cost_ex_vat as "selectedCostExVat",
            selected_notes as "selectedNotes"
          from decision_items
          where is_active = true
          order by room_group_order, room_section_order, item_order, title
        `)

        itemsToInsert = legacyResult.rows
      } else {
        itemsToInsert = buildSeedItems()
      }

      await dropDecisionTables(client)
      await ensureNormalizedSchema(client)
      insertSummary = await insertNormalizedDecisionData(client, itemsToInsert)
    } else {
      await ensureNormalizedSchema(client)

      const existing = await client.query(`select count(*)::int as count from decision_items`)
      const existingCount = Number(existing.rows[0]?.count || 0)

      if (existingCount > 0) {
        console.log(
          `decision_items already contains ${existingCount} records. Skipping seed. Use --force-reset to replace the seeded decision inventory.`,
        )
        await client.query("commit")
        return
      }

      insertSummary = await insertNormalizedDecisionData(client, buildSeedItems())
    }

    await client.query("commit")

    if (insertSummary) {
      console.log(`Loaded ${insertSummary.roomCount} rooms.`)
      console.log(`Loaded ${insertSummary.categoryCount} decision categories.`)
      console.log(`Loaded ${insertSummary.itemCount} decision items.`)
      console.log(
        `Loaded baseline decision budget: £${insertSummary.baselineBudgetExVat.toLocaleString("en-GB")}`,
      )
    }
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
