import "server-only"

import { differenceInCalendarDays } from "date-fns"
import {
  createPrivateObjectSignedUrl,
  getStorageStatus as getStorageStatusFromProvider,
  readDataFileText,
  writeDataFileText,
  type StorageStatus,
} from "@/lib/storage"

export const DATA_FILE_NAMES = [
  "project.json",
  "categories.json",
  "lineItems.json",
  "procurement.json",
  "payments.json",
  "decisions.json",
  "ideas.json",
  "inspiration.json",
  "tasks.json",
  "timeline.json",
  "fundingModel.json",
] as const

export type DataFileName = (typeof DATA_FILE_NAMES)[number]

type VatRate = number

export type ProjectFile = {
  projectId: string
  name: string
  location: string
  currency: string
  budgeting: {
    budgetsDefaultExVat: boolean
    vatRates: {
      default: VatRate
      reduced: VatRate
      standard: VatRate
    }
  }
  areas: Record<string, number>
  construction: Record<string, unknown>
  procurement: Record<string, unknown>
}

export type Category = {
  id: string
  name: string
  budgetExVat: number
  vatRate?: VatRate
  vatIncluded?: boolean
  notes?: string
  forecastOverrideExVat?: number
  reportingBucket?: "construction" | "soft_cost"
}

export type CategoriesFile = {
  categories: Category[]
  globalContingency: {
    budgetExVat: number
    vatRate?: VatRate
    rules?: string
  }
  totals: {
    baselineBuildBudgetExVat: number
    contingencyExVat: number
    envelopeExVat: number
  }
}

export type LineItem = {
  id: string
  categoryId: string
  name: string
  budgetExVat: number
  vatRate?: VatRate
  vatIncluded?: boolean
  status: string
  meta?: Record<string, unknown>
}

export type Supplier = {
  id: string
  name: string
  trade?: string
  email?: string
  phone?: string
  notes?: string
}

export type Quote = {
  id: string
  supplierId: string
  categoryId?: string
  title: string
  amountExVat: number
  vatRate?: VatRate
  vatIncluded?: boolean
  status: string
  quoteDate?: string
  expiryDate?: string
  convertedToPurchaseOrderId?: string
  notes?: string
  createdDate?: string
  updatedDate?: string
}

export type StagePayment = {
  id: string
  title: string
  type: "percent" | "fixed"
  value: number
  dueDate?: string
  milestoneId?: string
  invoiceId?: string
  notes?: string
}

export type PurchaseOrder = {
  id: string
  supplierId: string
  categoryId?: string
  quoteId?: string
  title: string
  amountExVat: number
  vatRate?: VatRate
  vatIncluded?: boolean
  status: string
  issuedDate?: string
  updatedDate?: string
  notes?: string
  stagePayments?: StagePayment[]
}

export type Invoice = {
  id: string
  purchaseOrderId: string
  supplierId: string
  stagePaymentId?: string
  number?: string
  amountExVat: number
  vatRate?: VatRate
  vatIncluded?: boolean
  issueDate?: string
  dueDate?: string
  status: string
  notes?: string
  createdDate?: string
  updatedDate?: string
}

export type ProcurementFile = {
  suppliers: Supplier[]
  quotes: Quote[]
  purchaseOrders: PurchaseOrder[]
  invoices: Invoice[]
}

export type Payment = {
  id: string
  invoiceId: string
  amountExVat: number
  paidDate: string
  fundingSourceId?: string
  fundingAccountId?: string
  reference?: string
  notes?: string
}

export type PaymentsFile = {
  payments: Payment[]
}

export type FundingSourceAccount = {
  id: string
  name: string
  startingBalanceExVat: number
  notes?: string
}

export type FundingSourceEntry = {
  id: string
  accountId: string
  date: string
  amountExVat: number
  status: "actual" | "predicted"
  description?: string
}

export type Decision = {
  id: string
  title: string
  categoryId: string
  options: Array<{
    name: string
    costDeltaExVat: number
  }>
  selectedOptionIndex: number | null
  notes?: string
  createdDate?: string
  updatedDate?: string
}

export type DecisionsFile = {
  decisions: Decision[]
}

export type IdeaImage = {
  key: string
  alt?: string
  sourceUrl?: string
}

export type Idea = {
  id: string
  categoryId: string
  room?: string
  title: string
  supplierName?: string
  brand?: string
  sourceUrl?: string
  quantity?: number
  estimatedUnitExVat?: number
  estimatedTotalExVat?: number
  budgetAllowanceExVat?: number
  vatRate?: VatRate
  vatIncluded?: boolean
  currency?: string
  notes?: string
  tags?: string[]
  status: "collected" | "picked" | "archived"
  images?: IdeaImage[]
  metadata?: {
    description?: string
    siteName?: string
    priceText?: string
    imageSourceCount?: number
    ingestedAt?: string
    updatedFromUrlAt?: string
  }
  pickedDate?: string
  createdDate?: string
  updatedDate?: string
}

export type IdeasFile = {
  ideas: Idea[]
}

export type InspirationItem = {
  id: string
  title: string
  room?: string
  sourceUrl?: string
  notes?: string
  tags?: string[]
  images?: IdeaImage[]
  metadata?: {
    description?: string
    siteName?: string
    priceText?: string
    ingestedAt?: string
    updatedFromUrlAt?: string
  }
  createdDate?: string
  updatedDate?: string
}

export type InspirationFile = {
  items: InspirationItem[]
}

export type TaskRelationType = "decision" | "milestone"
export type TaskStatus = "backlog" | "todo" | "in_progress" | "blocked" | "done"
export type TaskPriority = "low" | "medium" | "high"

export type TaskRelation = {
  type: TaskRelationType
  id: string
  label: string
}

export type TaskAssignee = {
  userId: string
  name: string
  email: string
  role?: string
}

export type Task = {
  id: string
  code: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  assignee?: TaskAssignee
  related?: TaskRelation[]
  dueDate?: string
  notes?: string
  createdDate?: string
  updatedDate?: string
}

export type TasksFile = {
  tasks: Task[]
}

export type TaskReferenceOption = {
  type: TaskRelationType
  id: string
  label: string
  meta?: string
}

export type Milestone = {
  id: string
  name: string
  plannedDate: string
  actualDate?: string
  status: string
  notes?: string
}

export type TimelineFile = {
  timezone: string
  milestones: Milestone[]
  dependencies: Array<{
    from: string
    to: string
  }>
}

export type FundingModelFile = {
  model: string
  assumptions: {
    baselineBuildBudgetExVat: number
    contingencyExVat: number
    startDate: string
    buildStartDate: string
    buildEndDate: string
  }
  sources: Array<{
    id: string
    name: string
    type: string
    amountExVat: number
    actualAmountExVat?: number
    predictedAmountExVat?: number
    status: string
    notes?: string
    accounts?: FundingSourceAccount[]
    entries?: FundingSourceEntry[]
  }>
  stages: Array<{
    id: string
    name: string
    percent: number
    milestoneId: string
    fundingSourceId?: string
    drawdownPercent?: number
    drawdownExcluded?: boolean
    notes?: string
  }>
}

export type FinancialRollup = {
  exVat: number
  vat: number
  incVat: number
}

export type LatestChange = {
  id: string
  kind: "decision" | "quote" | "purchase-order" | "invoice" | "idea"
  title: string
  date: string
  description: string
}

export type UpcomingPayment = {
  id: string
  title: string
  supplierName: string
  dueDate: string
  amountExVat: number
  amountVat: number
  amountIncVat: number
  source: "stage" | "invoice"
}

export type IdeaSummary = Idea & {
  imageUrls: string[]
  selectedCostDeltaExVat: number
}

export type InspirationSummary = InspirationItem & {
  imageUrls: string[]
}

export type CategorySummary = Category & {
  metrics: {
    budget: FinancialRollup
    committed: FinancialRollup
    invoiced: FinancialRollup
    paid: FinancialRollup
    forecast: FinancialRollup
    variance: FinancialRollup
    remainingExVat: number
  }
  lineItems: LineItem[]
  quotes: Quote[]
  purchaseOrders: PurchaseOrder[]
  invoices: Invoice[]
  decisions: Decision[]
  ideas: IdeaSummary[]
}

export type ProjectData = {
  project: ProjectFile
  categoriesFile: CategoriesFile
  lineItemsFile: { lineItems: LineItem[] }
  procurementFile: ProcurementFile
  paymentsFile: PaymentsFile
  decisionsFile: DecisionsFile
  ideasFile: IdeasFile
  timelineFile: TimelineFile
  fundingModel: FundingModelFile
  categories: CategorySummary[]
  totals: {
    budget: FinancialRollup
    committed: FinancialRollup
    invoiced: FinancialRollup
    paid: FinancialRollup
    forecast: FinancialRollup
    variance: FinancialRollup
    remainingExVat: number
    contingencyRemainingExVat: number
    construction: {
      budget: FinancialRollup
      committed: FinancialRollup
      invoiced: FinancialRollup
      paid: FinancialRollup
      forecast: FinancialRollup
      variance: FinancialRollup
      remainingExVat: number
    }
  }
  dashboard: {
    riskCount: number
    latestChanges: LatestChange[]
    upcomingPayments30: UpcomingPayment[]
    upcomingPayments60: UpcomingPayment[]
    nextMilestone: Milestone | null
    slippageDays: number
    categoryChart: Array<{
      name: string
      budget: number
      committed: number
      invoiced: number
      paid: number
      forecast: number
    }>
  }
  timeline: {
    phases: Array<{
      id: string
      name: string
      milestoneIds: string[]
      startDate: string
      endDate: string
    }>
    chains: string[][]
  }
  fundingStages: Array<{
    id: string
    name: string
    percent: number
    milestoneId: string
    milestoneName: string
    milestoneDate: string
    fundingSourceId?: string
    fundingSourceName?: string
    drawdownPercent: number
    drawdownExcluded: boolean
    amountExVat: number
    notes?: string
  }>
  funding: {
    totalPlannedExVat: number
    totalActualAvailableExVat: number
    totalProjectedBalanceExVat: number
    totalAllocatedExVat: number
    totalRemainingExVat: number
    projectGapExVat: number
    sources: Array<{
      id: string
      name: string
      type: string
      amountExVat: number
      actualAmountExVat: number
      predictedAmountExVat: number
      status: string
      notes?: string
      allocatedExVat: number
      remainingExVat: number
      projectedBalanceExVat: number
      paymentCount: number
      hasLedger: boolean
      accounts: Array<{
        id: string
        name: string
        startingBalanceExVat: number
        actualSavedExVat: number
        predictedSavedExVat: number
        paymentAllocatedExVat: number
        currentBalanceExVat: number
        projectedBalanceExVat: number
        entryCount: number
        paymentCount: number
      }>
      entries: FundingSourceEntry[]
      unassignedAllocatedExVat: number
    }>
    allocations: Array<{
      paymentId: string
      paidDate: string
      amountExVat: number
      fundingSourceId?: string
      fundingSourceName: string
      fundingAccountId?: string
      fundingAccountName?: string
      invoiceId: string
      invoiceNumber: string
      supplierName: string
      categoryName: string
      reference?: string
      notes?: string
    }>
  }
}

export type EditableFile = {
  name: DataFileName
  content: string
}

export type AssistantDiff = {
  fileName: DataFileName
  summary: string
  changes: Array<{
    path: string
    before: string
    after: string
  }>
  nextContent: string
}

async function readJsonFile<T>(fileName: DataFileName): Promise<T> {
  const content = await readDataFileText(fileName)
  return JSON.parse(content) as T
}

function toFinancialRollup(
  amount: number,
  vatRate = 0,
  vatIncluded = false,
): FinancialRollup {
  if (vatIncluded) {
    const exVat = amount / (1 + vatRate)
    const vat = amount - exVat
    return {
      exVat,
      vat,
      incVat: amount,
    }
  }

  const vat = amount * vatRate
  return {
    exVat: amount,
    vat,
    incVat: amount + vat,
  }
}

function addRollups(a: FinancialRollup, b: FinancialRollup): FinancialRollup {
  return {
    exVat: a.exVat + b.exVat,
    vat: a.vat + b.vat,
    incVat: a.incVat + b.incVat,
  }
}

function subtractRollups(a: FinancialRollup, b: FinancialRollup): FinancialRollup {
  return {
    exVat: a.exVat - b.exVat,
    vat: a.vat - b.vat,
    incVat: a.incVat - b.incVat,
  }
}

function emptyRollup(): FinancialRollup {
  return { exVat: 0, vat: 0, incVat: 0 }
}

function createTotalsAccumulator() {
  return {
    budget: emptyRollup(),
    committed: emptyRollup(),
    invoiced: emptyRollup(),
    paid: emptyRollup(),
    forecast: emptyRollup(),
    variance: emptyRollup(),
    remainingExVat: 0,
  }
}

export function validateBudgetIntegrity(categoriesFile: CategoriesFile): void {
  const categoryBudgetTotal = categoriesFile.categories.reduce(
    (sum, category) => sum + Number(category.budgetExVat || 0),
    0,
  )

  if (categoryBudgetTotal !== categoriesFile.totals.baselineBuildBudgetExVat) {
    throw new Error(
      `Budget validation failed: categories total ${categoryBudgetTotal} but baseline is ${categoriesFile.totals.baselineBuildBudgetExVat}.`,
    )
  }

  if (
    Number(categoriesFile.globalContingency.budgetExVat || 0) !==
    Number(categoriesFile.totals.contingencyExVat || 0)
  ) {
    throw new Error(
      `Budget validation failed: contingency ${categoriesFile.globalContingency.budgetExVat} does not match totals.contingencyExVat ${categoriesFile.totals.contingencyExVat}.`,
    )
  }

  const envelopeTotal =
    categoryBudgetTotal + Number(categoriesFile.globalContingency.budgetExVat || 0)

  if (Number(categoriesFile.totals.envelopeExVat || 0) !== envelopeTotal) {
    throw new Error(
      `Budget validation failed: envelope total ${categoriesFile.totals.envelopeExVat} does not equal baseline plus contingency ${envelopeTotal}.`,
    )
  }
}

function resolveVatRate(
  explicitVatRate: number | undefined,
  fallbackVatRate: number | undefined,
  defaultVatRate: number,
): number {
  return explicitVatRate ?? fallbackVatRate ?? defaultVatRate
}

function isConstructionCategory(category: Category): boolean {
  return category.reportingBucket !== "soft_cost"
}

function sortByDateAscending<T extends { plannedDate?: string; dueDate?: string; date?: string }>(
  values: T[],
): T[] {
  return [...values].sort((a, b) => {
    const left = a.plannedDate || a.dueDate || a.date || ""
    const right = b.plannedDate || b.dueDate || b.date || ""
    return left.localeCompare(right)
  })
}

function startOfToday(): Date {
  const today = new Date()
  return new Date(today.getFullYear(), today.getMonth(), today.getDate())
}

function buildDependencyChains(timeline: TimelineFile): string[][] {
  const nextByFrom = new Map<string, string[]>()
  const incoming = new Set<string>()

  for (const dependency of timeline.dependencies) {
    nextByFrom.set(dependency.from, [
      ...(nextByFrom.get(dependency.from) || []),
      dependency.to,
    ])
    incoming.add(dependency.to)
  }

  const startingMilestones = timeline.milestones
    .map((milestone) => milestone.id)
    .filter((id) => !incoming.has(id))

  const chains: string[][] = []

  function walk(currentId: string, currentChain: string[]) {
    const nextIds = nextByFrom.get(currentId) || []
    if (nextIds.length === 0) {
      chains.push(currentChain)
      return
    }

    for (const nextId of nextIds) {
      walk(nextId, [...currentChain, nextId])
    }
  }

  for (const startId of startingMilestones) {
    walk(startId, [startId])
  }

  return chains
}

function deriveTimelinePhases(
  timeline: TimelineFile,
  projectStartDate?: string,
) {
  const phaseTemplates = [
    {
      id: "phase-preconstruction",
      name: "Pre-construction",
      milestoneIds: [
        "m-planning",
        "m-structural-signoff",
        "m-tech-freeze",
      ],
    },
    {
      id: "phase-tender",
      name: "Tender & appointment",
      milestoneIds: [
        "m-tender-issue",
        "m-bc-notice-lodged",
        "m-tender-return",
        "m-bc-plan-check",
        "m-contractor-appointed",
      ],
    },
    {
      id: "phase-site-setup",
      name: "Site setup & mobilisation",
      milestoneIds: [
        "m-site-setup",
        "m-contract-prestart",
      ],
    },
    {
      id: "phase-substructure",
      name: "Groundworks & substructure",
      milestoneIds: [
        "m-groundworks-start",
        "m-foundations-complete",
      ],
    },
    {
      id: "phase-structure",
      name: "Frame & weathering",
      milestoneIds: ["m-frame-erected", "m-watertight", "m-windows-in"],
    },
    {
      id: "phase-internals",
      name: "Services & internals",
      milestoneIds: ["m-first-fix", "m-plaster-screed", "m-second-fix"],
    },
    {
      id: "phase-handover",
      name: "Fit-out & handover",
      milestoneIds: ["m-kitchens-baths", "m-practical-completion"],
    },
  ]

  const milestoneMap = new Map(
    timeline.milestones.map((milestone) => [milestone.id, milestone]),
  )

  let previousPhaseEndDate = projectStartDate

  return phaseTemplates
    .map((phase) => {
      const phaseMilestones = phase.milestoneIds
        .map((milestoneId) => milestoneMap.get(milestoneId))
        .filter(Boolean) as Milestone[]

      if (phaseMilestones.length === 0) {
        return null
      }

      const sortedMilestones = [...phaseMilestones].sort((left, right) =>
        left.plannedDate.localeCompare(right.plannedDate),
      )

      const endDate = sortedMilestones[sortedMilestones.length - 1]?.plannedDate
      const startDate = previousPhaseEndDate || sortedMilestones[0]?.plannedDate

      if (endDate) {
        previousPhaseEndDate = endDate
      }

      return {
        ...phase,
        startDate,
        endDate,
      }
    })
    .filter(Boolean) as Array<{
    id: string
    name: string
    milestoneIds: string[]
    startDate: string
    endDate: string
  }>
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

function inferCategoryId(input: string, categories: Category[]): string | undefined {
  const normalizedInput = input.toLowerCase()

  for (const category of categories) {
    if (
      normalizedInput.includes(category.id.replaceAll("_", " ")) ||
      normalizedInput.includes(category.name.toLowerCase())
    ) {
      return category.id
    }
  }

  if (normalizedInput.includes("groundwork")) return "groundworks"
  if (normalizedInput.includes("cladding")) return "envelope"
  if (normalizedInput.includes("window") || normalizedInput.includes("slider")) {
    return "windows"
  }
  if (normalizedInput.includes("ashp") || normalizedInput.includes("ufh")) {
    return "mech_elec"
  }

  return undefined
}

function formatJson(content: unknown): string {
  return `${JSON.stringify(content, null, 2)}\n`
}

function normalizeTags(tags: string[] | undefined): string[] {
  return [...new Set((tags || []).map((tag) => tag.trim()).filter(Boolean))]
}

function createShortId(prefix: string, seed: string): string {
  const randomSuffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)

  return `${prefix}-${slugify(seed)}-${randomSuffix}`
}

function createTaskId(title: string): string {
  return createShortId("task", title)
}

function createTaskCode(tasks: Task[]): string {
  const nextNumber =
    tasks.reduce((max, task) => {
      const match = task.code.match(/(\d+)$/)
      return Math.max(max, match ? Number(match[1]) : 1000)
    }, 1000) + 1

  return `TASK-${nextNumber}`
}

function createIdeaId(title: string): string {
  return createShortId("idea", title)
}

function createInspirationId(title: string): string {
  return createShortId("insp", title)
}

function createFundingAccountId(name: string): string {
  return createShortId("fund-account", name)
}

function createFundingEntryId(description: string): string {
  return createShortId("fund-entry", description || "entry")
}

function hasFundingLedger(
  source: Pick<FundingModelFile["sources"][number], "accounts" | "entries">,
): boolean {
  return Boolean(source.accounts?.length || source.entries?.length)
}

function calculateActualFundingSourceAmount(
  source: Pick<
    FundingModelFile["sources"][number],
    "amountExVat" | "actualAmountExVat" | "accounts" | "entries"
  >,
): number {
  if (!hasFundingLedger(source)) {
    return Number(source.actualAmountExVat ?? source.amountExVat ?? 0)
  }

  const startingBalance = (source.accounts || []).reduce(
    (sum, account) => sum + Number(account.startingBalanceExVat || 0),
    0,
  )
  const actualEntryTotal = (source.entries || [])
    .filter((entry) => entry.status !== "predicted")
    .reduce((sum, entry) => sum + Number(entry.amountExVat || 0), 0)

  return startingBalance + actualEntryTotal
}

function calculatePredictedFundingSourceAmount(
  source: Pick<
    FundingModelFile["sources"][number],
    "amountExVat" | "actualAmountExVat" | "predictedAmountExVat" | "accounts" | "entries"
  >,
): number {
  if (!hasFundingLedger(source)) {
    return Number(
      source.predictedAmountExVat ?? source.actualAmountExVat ?? source.amountExVat ?? 0,
    )
  }

  const actualAmount = calculateActualFundingSourceAmount(source)
  const predictedEntryTotal = (source.entries || [])
    .filter((entry) => entry.status === "predicted")
    .reduce((sum, entry) => sum + Number(entry.amountExVat || 0), 0)

  return actualAmount + predictedEntryTotal
}

function syncFundingSourceAmount(
  source: FundingModelFile["sources"][number],
): FundingModelFile["sources"][number] {
  const actualAmountExVat = calculateActualFundingSourceAmount(source)
  const predictedAmountExVat = calculatePredictedFundingSourceAmount(source)

  return {
    ...source,
    amountExVat: predictedAmountExVat,
    actualAmountExVat,
    predictedAmountExVat,
  }
}

function categoryNameById(
  categoryId: string | undefined,
  categories: Category[],
): string {
  return categories.find((category) => category.id === categoryId)?.name || "Unassigned"
}

function generateQuoteDiff(
  prompt: string,
  procurement: ProcurementFile,
  categories: Category[],
): AssistantDiff | null {
  const match = prompt.match(
    /add quote from (?<supplier>.+?) £(?<amount>[\d,.]+)(?<multiplier>k)?(?:\s*(?<vatType>ex|inc)\s+vat)?(?:.*?expiring (?<days>\d{1,3}) days?)?/i,
  )

  if (!match?.groups?.supplier || !match.groups.amount) {
    return null
  }

  const supplierName = match.groups.supplier.trim()
  const amountBase = Number(match.groups.amount.replaceAll(",", ""))
  const amountExVat = match.groups.multiplier?.toLowerCase() === "k"
    ? amountBase * 1000
    : amountBase
  const vatIncluded = match.groups.vatType?.toLowerCase() === "inc"
  const expiryDays = match.groups.days ? Number(match.groups.days) : 14
  const today = startOfToday()
  const expiryDate = new Date(today)
  expiryDate.setDate(today.getDate() + expiryDays)

  const nextProcurement = JSON.parse(JSON.stringify(procurement)) as ProcurementFile
  let supplier = nextProcurement.suppliers.find(
    (entry) => entry.name.toLowerCase() === supplierName.toLowerCase(),
  )

  const changes: AssistantDiff["changes"] = []

  if (!supplier) {
    supplier = {
      id: `sup-${slugify(supplierName)}`,
      name: supplierName,
      trade: "TBC",
    }
    nextProcurement.suppliers.push(supplier)
    changes.push({
      path: "suppliers[]",
      before: "missing",
      after: `added ${supplier.id}`,
    })
  }

  const categoryId = inferCategoryId(prompt, categories)
  const quoteId = `q-${String(nextProcurement.quotes.length + 1).padStart(3, "0")}`

  nextProcurement.quotes.push({
    id: quoteId,
    supplierId: supplier.id,
    categoryId,
    title: `${supplierName} quote`,
    amountExVat,
    vatRate: 0.2,
    vatIncluded,
    status: "received",
    quoteDate: today.toISOString().slice(0, 10),
    expiryDate: expiryDate.toISOString().slice(0, 10),
    createdDate: today.toISOString().slice(0, 10),
    updatedDate: today.toISOString().slice(0, 10),
    notes: "Generated from the admin update box.",
  })

  changes.push({
    path: "quotes[]",
    before: "missing",
    after: `added ${quoteId}`,
  })

  return {
    fileName: "procurement.json",
    summary: `Add ${supplierName} quote for £${amountExVat.toLocaleString("en-GB")} ex VAT.`,
    changes,
    nextContent: formatJson(nextProcurement),
  }
}

export async function getEditableFiles(): Promise<EditableFile[]> {
  return Promise.all(
    DATA_FILE_NAMES.map(async (name) => ({
      name,
      content: await readDataFileText(name),
    })),
  )
}

export async function saveEditableFile(
  fileName: DataFileName,
  content: string,
): Promise<void> {
  const parsed = JSON.parse(content)

  if (fileName === "categories.json") {
    validateBudgetIntegrity(parsed as CategoriesFile)
  }

  await writeDataFileText(fileName, formatJson(parsed))
}

export type SaveIdeaInput = {
  ideaId?: string
  categoryId: string
  room?: string
  title: string
  supplierName?: string
  brand?: string
  sourceUrl?: string
  quantity?: number
  estimatedUnitExVat?: number
  estimatedTotalExVat?: number
  budgetAllowanceExVat?: number
  vatRate?: VatRate
  vatIncluded?: boolean
  currency?: string
  notes?: string
  tags?: string[]
  images?: IdeaImage[]
  metadata?: Idea["metadata"]
}

export type SaveInspirationInput = {
  itemId?: string
  title: string
  room?: string
  sourceUrl?: string
  notes?: string
  tags?: string[]
  images?: IdeaImage[]
  metadata?: InspirationItem["metadata"]
}

export type SaveTaskInput = {
  taskId?: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  assignee?: TaskAssignee
  related?: Array<{
    type: TaskRelationType
    id: string
  }>
  dueDate?: string
  notes?: string
}

export async function getInspirationItems(): Promise<InspirationSummary[]> {
  const inspirationFile = await readJsonFile<InspirationFile>("inspiration.json")

  return [...inspirationFile.items]
    .sort((left, right) =>
      (right.updatedDate || right.createdDate || "").localeCompare(
        left.updatedDate || left.createdDate || "",
      ),
    )
    .map((item) => ({
      ...item,
      imageUrls: (item.images || []).map((image) =>
        createPrivateObjectSignedUrl(image.key, {
          expiresInSeconds: 60 * 60,
        }),
      ),
    }))
}

export async function saveInspirationItem(
  input: SaveInspirationInput,
): Promise<InspirationItem> {
  const inspirationFile = await readJsonFile<InspirationFile>("inspiration.json")
  const today = new Date().toISOString().slice(0, 10)
  const currentItem = input.itemId
    ? inspirationFile.items.find((item) => item.id === input.itemId) || null
    : null

  if (input.itemId && !currentItem) {
    throw new Error("Inspiration item not found.")
  }

  const nextItem: InspirationItem = {
    id: currentItem?.id || createInspirationId(input.title),
    title: input.title.trim(),
    room: input.room?.trim() || undefined,
    sourceUrl: input.sourceUrl?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    tags: normalizeTags(input.tags),
    images: input.images ?? currentItem?.images ?? [],
    metadata: input.metadata ?? currentItem?.metadata,
    createdDate: currentItem?.createdDate || today,
    updatedDate: today,
  }

  if (currentItem) {
    const itemIndex = inspirationFile.items.findIndex((item) => item.id === currentItem.id)
    inspirationFile.items[itemIndex] = nextItem
  } else {
    inspirationFile.items.unshift(nextItem)
  }

  await writeDataFileText("inspiration.json", formatJson(inspirationFile))

  return nextItem
}

export async function deleteInspirationItem(itemId: string): Promise<void> {
  const inspirationFile = await readJsonFile<InspirationFile>("inspiration.json")
  const nextItems = inspirationFile.items.filter((item) => item.id !== itemId)

  if (nextItems.length === inspirationFile.items.length) {
    throw new Error("Inspiration item not found.")
  }

  inspirationFile.items = nextItems
  await writeDataFileText("inspiration.json", formatJson(inspirationFile))
}

export async function getTasksRegisterData(): Promise<{
  tasks: Task[]
  relatedOptions: TaskReferenceOption[]
}> {
  const [tasksFile, decisionsFile, timelineFile, categoriesFile] = await Promise.all([
    readJsonFile<TasksFile>("tasks.json"),
    readJsonFile<DecisionsFile>("decisions.json"),
    readJsonFile<TimelineFile>("timeline.json"),
    readJsonFile<CategoriesFile>("categories.json"),
  ])

  const categoryNameByDecision = new Map(
    decisionsFile.decisions.map((decision) => [
      decision.id,
      categoriesFile.categories.find((category) => category.id === decision.categoryId)?.name ||
        decision.categoryId,
    ]),
  )

  const decisionOptions: TaskReferenceOption[] = decisionsFile.decisions.map((decision) => ({
    type: "decision",
    id: decision.id,
    label: decision.title,
    meta: categoryNameByDecision.get(decision.id),
  }))

  const milestoneOptions: TaskReferenceOption[] = timelineFile.milestones.map((milestone) => ({
    type: "milestone",
    id: milestone.id,
    label: milestone.name,
    meta: milestone.plannedDate,
  }))

  return {
    tasks: [...tasksFile.tasks].sort((left, right) =>
      (right.updatedDate || right.createdDate || "").localeCompare(
        left.updatedDate || left.createdDate || "",
      ),
    ),
    relatedOptions: [...decisionOptions, ...milestoneOptions],
  }
}

export async function saveTask(input: SaveTaskInput): Promise<Task> {
  const [tasksFile, decisionsFile, timelineFile, categoriesFile] = await Promise.all([
    readJsonFile<TasksFile>("tasks.json"),
    readJsonFile<DecisionsFile>("decisions.json"),
    readJsonFile<TimelineFile>("timeline.json"),
    readJsonFile<CategoriesFile>("categories.json"),
  ])

  const currentTask = input.taskId
    ? tasksFile.tasks.find((task) => task.id === input.taskId) || null
    : null

  if (input.taskId && !currentTask) {
    throw new Error("Task not found.")
  }

  const title = input.title.trim()
  if (!title) {
    throw new Error("Task title is required.")
  }

  const decisionMap = new Map(
    decisionsFile.decisions.map((decision) => [
      decision.id,
      {
        label: decision.title,
        meta:
          categoriesFile.categories.find((category) => category.id === decision.categoryId)?.name ||
          decision.categoryId,
      },
    ]),
  )
  const milestoneMap = new Map(
    timelineFile.milestones.map((milestone) => [
      milestone.id,
      {
        label: milestone.name,
        meta: milestone.plannedDate,
      },
    ]),
  )

  const related = [...new Map(
    (input.related || []).map((relation) => [`${relation.type}:${relation.id}`, relation]),
  ).values()].map((relation) => {
    if (relation.type === "decision") {
      const decision = decisionMap.get(relation.id)
      if (!decision) {
        throw new Error("Related decision not found.")
      }

      return {
        type: relation.type,
        id: relation.id,
        label: decision.meta ? `${decision.label} · ${decision.meta}` : decision.label,
      } satisfies TaskRelation
    }

    const milestone = milestoneMap.get(relation.id)
    if (!milestone) {
      throw new Error("Related milestone not found.")
    }

    return {
      type: relation.type,
      id: relation.id,
      label: milestone.meta ? `${milestone.label} · ${milestone.meta}` : milestone.label,
    } satisfies TaskRelation
  })

  const today = new Date().toISOString().slice(0, 10)
  const nextTask: Task = {
    id: currentTask?.id || createTaskId(title),
    code: currentTask?.code || createTaskCode(tasksFile.tasks),
    title,
    status: input.status,
    priority: input.priority,
    assignee:
      input.assignee?.userId && input.assignee.email
        ? {
            userId: input.assignee.userId,
            name: input.assignee.name.trim() || input.assignee.email.trim(),
            email: input.assignee.email.trim(),
            role: input.assignee.role?.trim() || undefined,
          }
        : undefined,
    related: related.length > 0 ? related : undefined,
    dueDate: input.dueDate || undefined,
    notes: input.notes?.trim() || undefined,
    createdDate: currentTask?.createdDate || today,
    updatedDate: today,
  }

  if (currentTask) {
    const taskIndex = tasksFile.tasks.findIndex((task) => task.id === currentTask.id)
    tasksFile.tasks[taskIndex] = nextTask
  } else {
    tasksFile.tasks.unshift(nextTask)
  }

  await writeDataFileText("tasks.json", formatJson(tasksFile))
  return nextTask
}

export async function deleteTask(taskId: string): Promise<void> {
  const tasksFile = await readJsonFile<TasksFile>("tasks.json")
  const nextTasks = tasksFile.tasks.filter((task) => task.id !== taskId)

  if (nextTasks.length === tasksFile.tasks.length) {
    throw new Error("Task not found.")
  }

  tasksFile.tasks = nextTasks
  await writeDataFileText("tasks.json", formatJson(tasksFile))
}

export type SaveFundingSourceAccountInput = {
  sourceId: string
  accountId?: string
  name: string
  startingBalanceExVat: number
  notes?: string
}

export type SaveFundingSourceEntryInput = {
  sourceId: string
  entryId?: string
  accountId: string
  date: string
  amountExVat: number
  status: "actual" | "predicted"
  description?: string
}

export type UpdatePaymentFundingAllocationInput = {
  paymentId: string
  fundingSourceId?: string
  fundingAccountId?: string
}

export async function saveFundingSourceAccount(
  input: SaveFundingSourceAccountInput,
): Promise<FundingSourceAccount> {
  const fundingModel = await readJsonFile<FundingModelFile>("fundingModel.json")
  const sourceIndex = fundingModel.sources.findIndex((source) => source.id === input.sourceId)

  if (sourceIndex === -1) {
    throw new Error("Funding source not found.")
  }

  const source = fundingModel.sources[sourceIndex]
  const normalizedName = input.name.trim()
  if (!normalizedName) {
    throw new Error("Source name is required.")
  }

  const existingAccount = input.accountId
    ? (source.accounts || []).find((account) => account.id === input.accountId) || null
    : null

  if (input.accountId && !existingAccount) {
    throw new Error("Savings pot not found.")
  }

  if (
    (source.accounts || []).some(
      (account) =>
        account.id !== input.accountId &&
        account.name.toLowerCase() === normalizedName.toLowerCase(),
    )
  ) {
    throw new Error("A savings pot with that name already exists.")
  }

  const nextAccount: FundingSourceAccount = {
    id: existingAccount?.id || createFundingAccountId(normalizedName),
    name: normalizedName,
    startingBalanceExVat: Number(input.startingBalanceExVat || 0),
    notes: input.notes?.trim() || undefined,
  }

  fundingModel.sources[sourceIndex] = syncFundingSourceAmount({
    ...source,
    accounts: existingAccount
      ? (source.accounts || []).map((account) =>
          account.id === existingAccount.id ? nextAccount : account,
        )
      : [...(source.accounts || []), nextAccount],
    entries: source.entries || [],
  })

  await writeDataFileText("fundingModel.json", formatJson(fundingModel))
  return nextAccount
}

export async function saveFundingSourceEntry(
  input: SaveFundingSourceEntryInput,
): Promise<FundingSourceEntry> {
  const fundingModel = await readJsonFile<FundingModelFile>("fundingModel.json")
  const sourceIndex = fundingModel.sources.findIndex((source) => source.id === input.sourceId)

  if (sourceIndex === -1) {
    throw new Error("Funding source not found.")
  }

  const source = fundingModel.sources[sourceIndex]
  const account = (source.accounts || []).find((entry) => entry.id === input.accountId)
  if (!account) {
    throw new Error("Savings pot not found.")
  }

  if (!input.date) {
    throw new Error("Date is required.")
  }

  const existingEntry = input.entryId
    ? (source.entries || []).find((entry) => entry.id === input.entryId) || null
    : null

  if (input.entryId && !existingEntry) {
    throw new Error("Savings entry not found.")
  }

  const nextEntry: FundingSourceEntry = {
    id: existingEntry?.id || createFundingEntryId(input.description || account.name),
    accountId: input.accountId,
    date: input.date,
    amountExVat: Number(input.amountExVat || 0),
    status: input.status,
    description: input.description?.trim() || undefined,
  }

  fundingModel.sources[sourceIndex] = syncFundingSourceAmount({
    ...source,
    accounts: source.accounts || [],
    entries: existingEntry
      ? (source.entries || [])
          .map((entry) => (entry.id === existingEntry.id ? nextEntry : entry))
          .sort((left, right) => left.date.localeCompare(right.date))
      : [...(source.entries || []), nextEntry].sort((left, right) =>
          left.date.localeCompare(right.date),
        ),
  })

  await writeDataFileText("fundingModel.json", formatJson(fundingModel))
  return nextEntry
}

export async function updatePaymentFundingAllocation(
  input: UpdatePaymentFundingAllocationInput,
): Promise<void> {
  const [paymentsFile, fundingModel] = await Promise.all([
    readJsonFile<PaymentsFile>("payments.json"),
    readJsonFile<FundingModelFile>("fundingModel.json"),
  ])

  const paymentIndex = paymentsFile.payments.findIndex((payment) => payment.id === input.paymentId)
  if (paymentIndex === -1) {
    throw new Error("Payment not found.")
  }

  const fundingSource = input.fundingSourceId
    ? fundingModel.sources.find((source) => source.id === input.fundingSourceId)
    : undefined

  if (input.fundingSourceId && !fundingSource) {
    throw new Error("Funding source not found.")
  }

  if (input.fundingAccountId) {
    const accountBelongsToSource = (fundingSource?.accounts || []).some(
      (account) => account.id === input.fundingAccountId,
    )

    if (!accountBelongsToSource) {
      throw new Error("Savings pot does not belong to that funding source.")
    }
  }

  paymentsFile.payments[paymentIndex] = {
    ...paymentsFile.payments[paymentIndex],
    fundingSourceId: input.fundingSourceId || undefined,
    fundingAccountId:
      input.fundingSourceId && input.fundingAccountId ? input.fundingAccountId : undefined,
  }

  await writeDataFileText("payments.json", formatJson(paymentsFile))
}

export async function saveIdea(input: SaveIdeaInput): Promise<Idea> {
  const [ideasFile, categoriesFile] = await Promise.all([
    readJsonFile<IdeasFile>("ideas.json"),
    readJsonFile<CategoriesFile>("categories.json"),
  ])

  if (!categoriesFile.categories.some((category) => category.id === input.categoryId)) {
    throw new Error("Category not found.")
  }

  const today = new Date().toISOString().slice(0, 10)
  const quantity = input.quantity && input.quantity > 0 ? input.quantity : 1
  const estimatedTotalExVat =
    input.estimatedTotalExVat ??
    (input.estimatedUnitExVat ? input.estimatedUnitExVat * quantity : undefined)

  const currentIdea = input.ideaId
    ? ideasFile.ideas.find((idea) => idea.id === input.ideaId) || null
    : null

  if (input.ideaId && !currentIdea) {
    throw new Error("Idea not found.")
  }

  const nextIdea: Idea = {
    id: currentIdea?.id || createIdeaId(input.title),
    categoryId: input.categoryId,
    room: input.room?.trim() || undefined,
    title: input.title.trim(),
    supplierName: input.supplierName?.trim() || undefined,
    brand: input.brand?.trim() || undefined,
    sourceUrl: input.sourceUrl?.trim() || undefined,
    quantity,
    estimatedUnitExVat: input.estimatedUnitExVat,
    estimatedTotalExVat,
    budgetAllowanceExVat: input.budgetAllowanceExVat ?? 0,
    vatRate: input.vatRate ?? currentIdea?.vatRate,
    vatIncluded: input.vatIncluded ?? currentIdea?.vatIncluded,
    currency: input.currency || currentIdea?.currency || "GBP",
    notes: input.notes?.trim() || undefined,
    tags: normalizeTags(input.tags),
    status: currentIdea?.status || "collected",
    images: input.images ?? currentIdea?.images ?? [],
    metadata: input.metadata ?? currentIdea?.metadata,
    pickedDate: currentIdea?.pickedDate,
    createdDate: currentIdea?.createdDate || today,
    updatedDate: today,
  }

  if (currentIdea) {
    const ideaIndex = ideasFile.ideas.findIndex((idea) => idea.id === currentIdea.id)
    ideasFile.ideas[ideaIndex] = nextIdea
  } else {
    ideasFile.ideas.unshift(nextIdea)
  }

  await writeDataFileText("ideas.json", formatJson(ideasFile))

  return nextIdea
}

export async function updateIdeaPickedState(
  ideaId: string,
  status: "collected" | "picked",
): Promise<Idea> {
  const ideasFile = await readJsonFile<IdeasFile>("ideas.json")
  const ideaIndex = ideasFile.ideas.findIndex((idea) => idea.id === ideaId)

  if (ideaIndex === -1) {
    throw new Error("Idea not found.")
  }

  const currentIdea = ideasFile.ideas[ideaIndex]
  if (!currentIdea) {
    throw new Error("Idea not found.")
  }

  const today = new Date().toISOString().slice(0, 10)
  const nextIdea: Idea = {
    ...currentIdea,
    status,
    pickedDate: status === "picked" ? today : undefined,
    updatedDate: today,
  }

  ideasFile.ideas[ideaIndex] = nextIdea
  await writeDataFileText("ideas.json", formatJson(ideasFile))

  return nextIdea
}

export async function updateDecisionSelection(
  decisionId: string,
  selectedOptionIndex: number | null,
): Promise<Decision> {
  const decisionsFile = await readJsonFile<DecisionsFile>("decisions.json")
  const decisionIndex = decisionsFile.decisions.findIndex(
    (decision) => decision.id === decisionId,
  )

  if (decisionIndex === -1) {
    throw new Error("Decision not found.")
  }

  const decision = decisionsFile.decisions[decisionIndex]

  if (!decision) {
    throw new Error("Decision not found.")
  }

  if (
    selectedOptionIndex !== null &&
    (selectedOptionIndex < 0 || selectedOptionIndex >= decision.options.length)
  ) {
    throw new Error("Invalid option index.")
  }

  const nextDecision: Decision = {
    ...decision,
    selectedOptionIndex,
    updatedDate: new Date().toISOString().slice(0, 10),
  }

  decisionsFile.decisions[decisionIndex] = nextDecision
  await writeDataFileText("decisions.json", formatJson(decisionsFile))

  return nextDecision
}

export function getStorageStatus(): StorageStatus {
  return getStorageStatusFromProvider()
}

export async function generateAssistantDiff(prompt: string): Promise<AssistantDiff> {
  const normalizedPrompt = prompt.trim()
  if (!normalizedPrompt) {
    throw new Error("Enter an update instruction first.")
  }

  const [procurement, categoriesFile] = await Promise.all([
    readJsonFile<ProcurementFile>("procurement.json"),
    readJsonFile<CategoriesFile>("categories.json"),
  ])

  const quoteDiff = generateQuoteDiff(
    normalizedPrompt,
    procurement,
    categoriesFile.categories,
  )

  if (quoteDiff) {
    return quoteDiff
  }

  throw new Error(
    "The MVP update box currently supports quote instructions like “Add quote from ABC Groundworks £42k ex VAT expiring 14 days”.",
  )
}

export async function getProjectData(): Promise<ProjectData> {
  const [
    project,
    categoriesFile,
    lineItemsFile,
    procurementFile,
    paymentsFile,
    decisionsFile,
    ideasFile,
    timelineFile,
    fundingModel,
  ] = await Promise.all([
    readJsonFile<ProjectFile>("project.json"),
    readJsonFile<CategoriesFile>("categories.json"),
    readJsonFile<{ lineItems: LineItem[] }>("lineItems.json"),
    readJsonFile<ProcurementFile>("procurement.json"),
    readJsonFile<PaymentsFile>("payments.json"),
    readJsonFile<DecisionsFile>("decisions.json"),
    readJsonFile<IdeasFile>("ideas.json"),
    readJsonFile<TimelineFile>("timeline.json"),
    readJsonFile<FundingModelFile>("fundingModel.json"),
  ])

  validateBudgetIntegrity(categoriesFile)

  const defaultVatRate = project.budgeting.vatRates.default
  const today = startOfToday()

  const supplierMap = new Map(
    procurementFile.suppliers.map((supplier) => [supplier.id, supplier]),
  )
  const quoteMap = new Map(procurementFile.quotes.map((quote) => [quote.id, quote]))
  const purchaseOrderMap = new Map(
    procurementFile.purchaseOrders.map((purchaseOrder) => [purchaseOrder.id, purchaseOrder]),
  )
  const milestoneMap = new Map(
    timelineFile.milestones.map((milestone) => [milestone.id, milestone]),
  )
  const fundingSourceMap = new Map(
    (fundingModel.sources || []).map((source) => [source.id, source]),
  )
  const fundingSourceActualAmountMap = new Map(
    (fundingModel.sources || []).map((source) => [
      source.id,
      calculateActualFundingSourceAmount(source),
    ]),
  )
  const fundingSourcePredictedAmountMap = new Map(
    (fundingModel.sources || []).map((source) => [
      source.id,
      calculatePredictedFundingSourceAmount(source),
    ]),
  )
  const fundingAccountMap = new Map<string, FundingSourceAccount>()
  for (const source of fundingModel.sources || []) {
    for (const account of source.accounts || []) {
      fundingAccountMap.set(account.id, account)
    }
  }

  const paymentsByInvoiceId = new Map<string, Payment[]>()
  for (const payment of paymentsFile.payments) {
    paymentsByInvoiceId.set(payment.invoiceId, [
      ...(paymentsByInvoiceId.get(payment.invoiceId) || []),
      payment,
    ])
  }

  const invoiceCategoryId = (invoice: Invoice): string | undefined => {
    const purchaseOrder = purchaseOrderMap.get(invoice.purchaseOrderId)
    if (purchaseOrder?.categoryId) return purchaseOrder.categoryId
    if (purchaseOrder?.quoteId) return quoteMap.get(purchaseOrder.quoteId)?.categoryId
    return undefined
  }

  const paymentFundingAllocations = paymentsFile.payments.map((payment) => {
    const invoice = procurementFile.invoices.find((entry) => entry.id === payment.invoiceId)
    const categoryName = categoryNameById(
      invoice ? invoiceCategoryId(invoice) : undefined,
      categoriesFile.categories,
    )
    const supplierName = invoice
      ? supplierMap.get(invoice.supplierId)?.name || "Unknown supplier"
      : "Unknown supplier"
    const fundingSource = payment.fundingSourceId
      ? fundingSourceMap.get(payment.fundingSourceId)
      : undefined

    return {
      paymentId: payment.id,
      paidDate: payment.paidDate,
      amountExVat: payment.amountExVat,
      fundingSourceId: payment.fundingSourceId,
      fundingSourceName: fundingSource?.name || "Unassigned",
      fundingAccountId: payment.fundingAccountId,
      fundingAccountName: payment.fundingAccountId
        ? fundingAccountMap.get(payment.fundingAccountId)?.name
        : undefined,
      invoiceId: payment.invoiceId,
      invoiceNumber: invoice?.number || payment.invoiceId,
      supplierName,
      categoryName,
      reference: payment.reference,
      notes: payment.notes,
    }
  })

  const selectedDecisionDeltaByCategory = new Map<string, number>()
  for (const decision of decisionsFile.decisions) {
    const selectedOption =
      decision.selectedOptionIndex === null
        ? null
        : decision.options[decision.selectedOptionIndex] || null

    if (!selectedOption) continue

    selectedDecisionDeltaByCategory.set(
      decision.categoryId,
      (selectedDecisionDeltaByCategory.get(decision.categoryId) || 0) +
        selectedOption.costDeltaExVat,
    )
  }

  const pickedIdeaDeltaByCategory = new Map<string, number>()
  for (const idea of ideasFile.ideas) {
    if (idea.status !== "picked") continue

    const estimatedTotalExVat =
      idea.estimatedTotalExVat ??
      (idea.estimatedUnitExVat && idea.quantity
        ? idea.estimatedUnitExVat * idea.quantity
        : idea.estimatedUnitExVat) ??
      0

    const delta = estimatedTotalExVat - (idea.budgetAllowanceExVat ?? 0)

    pickedIdeaDeltaByCategory.set(
      idea.categoryId,
      (pickedIdeaDeltaByCategory.get(idea.categoryId) || 0) + delta,
    )
  }

  const categories: CategorySummary[] = categoriesFile.categories.map((category) => {
    const lineItems = lineItemsFile.lineItems.filter(
      (lineItem) => lineItem.categoryId === category.id,
    )
    const quotes = procurementFile.quotes.filter((quote) => quote.categoryId === category.id)
    const purchaseOrders = procurementFile.purchaseOrders.filter((purchaseOrder) => {
      if (purchaseOrder.categoryId === category.id) return true
      if (purchaseOrder.quoteId) {
        return quoteMap.get(purchaseOrder.quoteId)?.categoryId === category.id
      }
      return false
    })
    const invoices = procurementFile.invoices.filter(
      (invoice) => invoiceCategoryId(invoice) === category.id,
    )
    const decisions = decisionsFile.decisions.filter(
      (decision) => decision.categoryId === category.id,
    )
    const ideas = ideasFile.ideas
      .filter((idea) => idea.categoryId === category.id)
      .map((idea) => {
        const estimatedTotalExVat =
          idea.estimatedTotalExVat ??
          (idea.estimatedUnitExVat && idea.quantity
            ? idea.estimatedUnitExVat * idea.quantity
            : idea.estimatedUnitExVat) ??
          0

        return {
          ...idea,
          estimatedTotalExVat,
          imageUrls: (idea.images || []).map((image) =>
            createPrivateObjectSignedUrl(image.key, {
              expiresInSeconds: 60 * 60,
            }),
          ),
          selectedCostDeltaExVat:
            estimatedTotalExVat - (idea.budgetAllowanceExVat ?? 0),
        }
      })

    const categoryVatRate = resolveVatRate(category.vatRate, undefined, defaultVatRate)
    const budget = toFinancialRollup(
      category.budgetExVat,
      categoryVatRate,
      Boolean(category.vatIncluded),
    )

    const committed = purchaseOrders.reduce((sum, purchaseOrder) => {
      const vatRate = resolveVatRate(purchaseOrder.vatRate, category.vatRate, defaultVatRate)
      return addRollups(
        sum,
        toFinancialRollup(
          purchaseOrder.amountExVat,
          vatRate,
          Boolean(purchaseOrder.vatIncluded),
        ),
      )
    }, emptyRollup())

    const invoiced = invoices.reduce((sum, invoice) => {
      const vatRate = resolveVatRate(invoice.vatRate, category.vatRate, defaultVatRate)
      return addRollups(
        sum,
        toFinancialRollup(invoice.amountExVat, vatRate, Boolean(invoice.vatIncluded)),
      )
    }, emptyRollup())

    const paid = invoices.reduce((sum, invoice) => {
      const invoicePayments = paymentsByInvoiceId.get(invoice.id) || []
      const vatRate = resolveVatRate(invoice.vatRate, category.vatRate, defaultVatRate)
      const paidExVat = invoicePayments.reduce(
        (paymentSum, payment) => paymentSum + payment.amountExVat,
        0,
      )
      return addRollups(sum, toFinancialRollup(paidExVat, vatRate, Boolean(invoice.vatIncluded)))
    }, emptyRollup())

    const forecastExVat =
      category.forecastOverrideExVat ??
      category.budgetExVat +
        (selectedDecisionDeltaByCategory.get(category.id) || 0) +
        (pickedIdeaDeltaByCategory.get(category.id) || 0)

    const forecast = toFinancialRollup(
      forecastExVat,
      categoryVatRate,
      Boolean(category.vatIncluded),
    )

    const variance = subtractRollups(forecast, budget)

    return {
      ...category,
      metrics: {
        budget,
        committed,
        invoiced,
        paid,
        forecast,
        variance,
        remainingExVat: forecast.exVat - paid.exVat,
      },
      lineItems,
      quotes,
      purchaseOrders,
      invoices,
      decisions,
      ideas,
    }
  })

  const aggregateTotals = (sourceCategories: CategorySummary[]) =>
    sourceCategories.reduce(
      (sum, category) => ({
        budget: addRollups(sum.budget, category.metrics.budget),
        committed: addRollups(sum.committed, category.metrics.committed),
        invoiced: addRollups(sum.invoiced, category.metrics.invoiced),
        paid: addRollups(sum.paid, category.metrics.paid),
        forecast: addRollups(sum.forecast, category.metrics.forecast),
        variance: addRollups(sum.variance, category.metrics.variance),
        remainingExVat: sum.remainingExVat + category.metrics.remainingExVat,
      }),
      createTotalsAccumulator(),
    )

  const totals = {
    ...aggregateTotals(categories),
    contingencyRemainingExVat: categoriesFile.globalContingency.budgetExVat,
    construction: aggregateTotals(
      categories.filter((category) => isConstructionCategory(category)),
    ),
  }

  const selectedDecisionDelta = decisionsFile.decisions.reduce((sum, decision) => {
    const selectedOption =
      decision.selectedOptionIndex === null
        ? null
        : decision.options[decision.selectedOptionIndex] || null
    return sum + Math.max(selectedOption?.costDeltaExVat || 0, 0)
  }, 0)

  totals.contingencyRemainingExVat =
    categoriesFile.globalContingency.budgetExVat - selectedDecisionDelta

  const stagePayments = procurementFile.purchaseOrders.flatMap((purchaseOrder) =>
    (purchaseOrder.stagePayments || []).map((stage) => {
      const dueDate = stage.dueDate || milestoneMap.get(stage.milestoneId || "")?.plannedDate
      const vatRate = resolveVatRate(
        purchaseOrder.vatRate,
        categories.find((category) => category.id === purchaseOrder.categoryId)?.vatRate,
        defaultVatRate,
      )
      const amountExVat =
        stage.type === "percent"
          ? purchaseOrder.amountExVat * stage.value
          : stage.value
      const rollup = toFinancialRollup(
        amountExVat,
        vatRate,
        Boolean(purchaseOrder.vatIncluded),
      )

      return dueDate
        ? {
            id: `${purchaseOrder.id}:${stage.id}`,
            title: `${purchaseOrder.title} · ${stage.title}`,
            supplierName:
              supplierMap.get(purchaseOrder.supplierId)?.name || "Unknown supplier",
            dueDate,
            amountExVat: rollup.exVat,
            amountVat: rollup.vat,
            amountIncVat: rollup.incVat,
            source: "stage" as const,
          }
        : null
    }),
  ).filter(Boolean) as UpcomingPayment[]

  const invoicePaymentSchedule = procurementFile.invoices
    .filter((invoice) => invoice.dueDate)
    .map((invoice) => {
      const invoicePayments = paymentsByInvoiceId.get(invoice.id) || []
      const paidExVat = invoicePayments.reduce(
        (sum, payment) => sum + payment.amountExVat,
        0,
      )
      const outstandingExVat = Math.max(invoice.amountExVat - paidExVat, 0)
      const vatRate = resolveVatRate(
        invoice.vatRate,
        categories.find((category) => category.id === invoiceCategoryId(invoice))?.vatRate,
        defaultVatRate,
      )
      const rollup = toFinancialRollup(outstandingExVat, vatRate, Boolean(invoice.vatIncluded))

      return {
        id: invoice.id,
        title: invoice.number || invoice.id,
        supplierName: supplierMap.get(invoice.supplierId)?.name || "Unknown supplier",
        dueDate: invoice.dueDate as string,
        amountExVat: rollup.exVat,
        amountVat: rollup.vat,
        amountIncVat: rollup.incVat,
        source: "invoice" as const,
      }
    })
    .filter((invoice) => invoice.amountExVat > 0)

  const upcomingPayments = sortByDateAscending([
    ...stagePayments,
    ...invoicePaymentSchedule,
  ])

  const latestChanges = [
    ...ideasFile.ideas.map((idea) => ({
      id: idea.id,
      kind: "idea" as const,
      title: idea.title,
      date: idea.updatedDate || idea.createdDate || "1970-01-01",
      description:
        idea.status === "picked"
          ? `Picked for ${idea.room || "category"}`
          : "Idea captured",
    })),
    ...decisionsFile.decisions.map((decision) => ({
      id: decision.id,
      kind: "decision" as const,
      title: decision.title,
      date: decision.updatedDate || decision.createdDate || "1970-01-01",
      description:
        decision.selectedOptionIndex === null
          ? "Decision still open"
          : `Selected ${decision.options[decision.selectedOptionIndex]?.name || "option"}`,
    })),
    ...procurementFile.quotes.map((quote) => ({
      id: quote.id,
      kind: "quote" as const,
      title: quote.title,
      date: quote.updatedDate || quote.createdDate || quote.quoteDate || "1970-01-01",
      description: `Quote ${quote.status}`,
    })),
    ...procurementFile.purchaseOrders.map((purchaseOrder) => ({
      id: purchaseOrder.id,
      kind: "purchase-order" as const,
      title: purchaseOrder.title,
      date: purchaseOrder.updatedDate || purchaseOrder.issuedDate || "1970-01-01",
      description: `PO ${purchaseOrder.status}`,
    })),
    ...procurementFile.invoices.map((invoice) => ({
      id: invoice.id,
      kind: "invoice" as const,
      title: invoice.number || invoice.id,
      date: invoice.updatedDate || invoice.createdDate || invoice.issueDate || "1970-01-01",
      description: `Invoice ${invoice.status}`,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8)

  const overdueMilestones = timelineFile.milestones.filter((milestone) => {
    const daysFromToday = differenceInCalendarDays(new Date(milestone.plannedDate), today)
    return daysFromToday < 0 && milestone.status !== "done"
  })

  const expiringQuotes = procurementFile.quotes.filter((quote) => {
    if (!quote.expiryDate) return false
    const daysFromToday = differenceInCalendarDays(new Date(quote.expiryDate), today)
    return daysFromToday >= 0 && daysFromToday <= 14 && quote.status !== "accepted"
  })

  const overdueInvoices = procurementFile.invoices.filter((invoice) => {
    if (!invoice.dueDate) return false
    const daysFromToday = differenceInCalendarDays(new Date(invoice.dueDate), today)
    const outstandingExVat =
      invoice.amountExVat -
      (paymentsByInvoiceId.get(invoice.id) || []).reduce(
        (sum, payment) => sum + payment.amountExVat,
        0,
      )
    return daysFromToday < 0 && outstandingExVat > 0
  })

  const unresolvedDecisions = decisionsFile.decisions.filter(
    (decision) => decision.selectedOptionIndex === null,
  )

  const nextMilestone =
    timelineFile.milestones
      .filter((milestone) => differenceInCalendarDays(new Date(milestone.plannedDate), today) >= 0)
      .sort((left, right) => left.plannedDate.localeCompare(right.plannedDate))[0] || null

  const slippageDays = overdueMilestones.length
    ? Math.max(
        ...overdueMilestones.map((milestone) =>
          Math.abs(differenceInCalendarDays(new Date(milestone.plannedDate), today)),
        ),
      )
    : 0

  const fundingStages = fundingModel.stages.map((stage) => {
    const milestone = milestoneMap.get(stage.milestoneId)
    const fundingSource = stage.fundingSourceId
      ? fundingSourceMap.get(stage.fundingSourceId)
      : undefined
    const drawdownPercent = stage.drawdownExcluded ? 0 : stage.drawdownPercent ?? stage.percent
    const sourceAmountExVat = fundingSource
      ? fundingSourcePredictedAmountMap.get(fundingSource.id) ??
        fundingSource.predictedAmountExVat ??
        fundingSource.amountExVat
      : 0
    return {
      ...stage,
      milestoneName: milestone?.name || stage.milestoneId,
      milestoneDate: milestone?.plannedDate || "",
      fundingSourceName: fundingSource?.name,
      drawdownPercent,
      drawdownExcluded: Boolean(stage.drawdownExcluded),
      amountExVat: sourceAmountExVat * drawdownPercent,
    }
  })

  const fundingSources = (fundingModel.sources || []).map((source) => {
    const allocations = paymentFundingAllocations.filter(
      (allocation) => allocation.fundingSourceId === source.id,
    )
    const allocatedExVat = allocations.reduce(
      (sum, allocation) => sum + allocation.amountExVat,
      0,
    )
    const actualAmountExVat =
      fundingSourceActualAmountMap.get(source.id) ??
      source.actualAmountExVat ??
      source.amountExVat
    const predictedAmountExVat =
      fundingSourcePredictedAmountMap.get(source.id) ??
      source.predictedAmountExVat ??
      source.amountExVat
    const accounts = (source.accounts || []).map((account) => {
      const actualSavedExVat = (source.entries || [])
        .filter((entry) => entry.accountId === account.id && entry.status !== "predicted")
        .reduce((sum, entry) => sum + entry.amountExVat, 0)
      const predictedSavedExVat = (source.entries || [])
        .filter((entry) => entry.accountId === account.id && entry.status === "predicted")
        .reduce((sum, entry) => sum + entry.amountExVat, 0)
      const accountAllocations = allocations.filter(
        (allocation) => allocation.fundingAccountId === account.id,
      )
      const paymentAllocatedExVat = accountAllocations.reduce(
        (sum, allocation) => sum + allocation.amountExVat,
        0,
      )

      return {
        id: account.id,
        name: account.name,
        startingBalanceExVat: account.startingBalanceExVat,
        actualSavedExVat,
        predictedSavedExVat,
        paymentAllocatedExVat,
        currentBalanceExVat:
          account.startingBalanceExVat + actualSavedExVat - paymentAllocatedExVat,
        projectedBalanceExVat:
          account.startingBalanceExVat +
          actualSavedExVat +
          predictedSavedExVat -
          paymentAllocatedExVat,
        entryCount: (source.entries || []).filter((entry) => entry.accountId === account.id).length,
        paymentCount: accountAllocations.length,
      }
    })
    const unassignedAllocatedExVat = allocations
      .filter((allocation) => !allocation.fundingAccountId)
      .reduce((sum, allocation) => sum + allocation.amountExVat, 0)

    return {
      ...source,
      amountExVat: predictedAmountExVat,
      actualAmountExVat,
      predictedAmountExVat,
      allocatedExVat,
      remainingExVat: actualAmountExVat - allocatedExVat,
      projectedBalanceExVat: predictedAmountExVat - allocatedExVat,
      paymentCount: allocations.length,
      hasLedger: hasFundingLedger(source),
      accounts,
      entries: source.entries || [],
      unassignedAllocatedExVat,
    }
  })

  const funding = {
    totalPlannedExVat: fundingSources.reduce((sum, source) => sum + source.amountExVat, 0),
    totalActualAvailableExVat: fundingSources.reduce(
      (sum, source) => sum + source.remainingExVat,
      0,
    ),
    totalProjectedBalanceExVat: fundingSources.reduce(
      (sum, source) => sum + source.projectedBalanceExVat,
      0,
    ),
    totalAllocatedExVat: fundingSources.reduce(
      (sum, source) => sum + source.allocatedExVat,
      0,
    ),
    totalRemainingExVat: fundingSources.reduce(
      (sum, source) => sum + source.remainingExVat,
      0,
    ),
    projectGapExVat:
      categoriesFile.totals.baselineBuildBudgetExVat -
      fundingSources.reduce((sum, source) => sum + source.amountExVat, 0),
    sources: fundingSources,
    allocations: paymentFundingAllocations.sort((left, right) =>
      right.paidDate.localeCompare(left.paidDate),
    ),
  }

  return {
    project,
    categoriesFile,
    lineItemsFile,
    procurementFile,
    paymentsFile,
    decisionsFile,
    ideasFile,
    timelineFile,
    fundingModel,
    categories,
    totals,
    funding,
    dashboard: {
      riskCount:
        unresolvedDecisions.length +
        expiringQuotes.length +
        overdueInvoices.length +
        overdueMilestones.length,
      latestChanges,
      upcomingPayments30: upcomingPayments.filter(
        (payment) =>
          differenceInCalendarDays(new Date(payment.dueDate), today) >= 0 &&
          differenceInCalendarDays(new Date(payment.dueDate), today) <= 30,
      ),
      upcomingPayments60: upcomingPayments.filter(
        (payment) =>
          differenceInCalendarDays(new Date(payment.dueDate), today) >= 0 &&
          differenceInCalendarDays(new Date(payment.dueDate), today) <= 60,
      ),
      nextMilestone,
      slippageDays,
      categoryChart: categories.map((category) => ({
        name: category.name,
        budget: category.metrics.budget.exVat,
        committed: category.metrics.committed.exVat,
        invoiced: category.metrics.invoiced.exVat,
        paid: category.metrics.paid.exVat,
        forecast: category.metrics.forecast.exVat,
      })),
    },
    timeline: {
      phases: deriveTimelinePhases(
        timelineFile,
        fundingModel.assumptions.startDate,
      ),
      chains: buildDependencyChains(timelineFile),
    },
    fundingStages,
  }
}
