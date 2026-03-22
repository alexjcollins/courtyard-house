"use client"

import { startTransition, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { MetricCard } from "@/components/metric-card"
import type { ProjectData } from "@/lib/data"
import { formatCurrency, formatDate } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type FundingSummary = ProjectData["funding"]
type FundingSource = FundingSummary["sources"][number]
type FundingAllocation = FundingSummary["allocations"][number]
type FundingStage = ProjectData["fundingStages"][number]
type FundingAccount = FundingSource["accounts"][number]
type FundingEntry = FundingSource["entries"][number]

type FundingPageClientProps = {
  funding: FundingSummary
  fundingStages: FundingStage[]
  baselineBuildBudgetExVat: number
}

type StatementRow = {
  id: string
  date: string
  kind: "opening" | "actual-saving" | "predicted-saving" | "payment"
  label: string
  accountName: string
  creditExVat: number
  debitExVat: number
  balanceExVat: number
  entryId?: string
}

type AccountFormState = {
  accountId: string | null
  name: string
  startingBalanceExVat: string
}

type EntryFormState = {
  entryId: string | null
  accountId: string
  date: string
  amountExVat: string
  status: "actual" | "predicted"
  description: string
}

const EMPTY_ACCOUNT_FORM: AccountFormState = {
  accountId: null,
  name: "",
  startingBalanceExVat: "",
}

const EMPTY_ENTRY_FORM: EntryFormState = {
  entryId: null,
  accountId: "",
  date: new Date().toISOString().slice(0, 10),
  amountExVat: "",
  status: "actual",
  description: "",
}

export function FundingPageClient({
  funding,
  fundingStages,
  baselineBuildBudgetExVat,
}: FundingPageClientProps) {
  const router = useRouter()
  const [sourcesState, setSourcesState] = useState(funding.sources)
  const [allocationsState, setAllocationsState] = useState(funding.allocations)
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [statementAccountId, setStatementAccountId] = useState("all")
  const [accountForm, setAccountForm] = useState<AccountFormState>(EMPTY_ACCOUNT_FORM)
  const [entryForm, setEntryForm] = useState<EntryFormState>(EMPTY_ENTRY_FORM)
  const [pageMessage, setPageMessage] = useState("")
  const [modalMessage, setModalMessage] = useState("")
  const [isSavingAccount, setIsSavingAccount] = useState(false)
  const [isSavingEntry, setIsSavingEntry] = useState(false)
  const [pendingPaymentIds, setPendingPaymentIds] = useState<string[]>([])

  useEffect(() => {
    setSourcesState(funding.sources)
    setAllocationsState(funding.allocations)
  }, [funding.allocations, funding.sources])

  const selectedSource = useMemo(
    () => sourcesState.find((source) => source.id === selectedSourceId) || null,
    [selectedSourceId, sourcesState],
  )

  useEffect(() => {
    if (!selectedSource) {
      setStatementAccountId("all")
      setAccountForm(EMPTY_ACCOUNT_FORM)
      setEntryForm(EMPTY_ENTRY_FORM)
      return
    }

    const firstAccountId = selectedSource.accounts[0]?.id || ""
    setStatementAccountId((current) => {
      if (current === "all" || selectedSource.accounts.some((account) => account.id === current)) {
        return current
      }

      return firstAccountId || "all"
    })
    setEntryForm((current) => ({
      ...current,
      accountId:
        current.accountId && selectedSource.accounts.some((account) => account.id === current.accountId)
          ? current.accountId
          : firstAccountId,
    }))
  }, [selectedSource])

  const totals = useMemo(() => {
    const totalPlannedExVat = sourcesState.reduce(
      (sum, source) => sum + source.predictedAmountExVat,
      0,
    )
    const totalActualAvailableExVat = sourcesState.reduce(
      (sum, source) => sum + source.remainingExVat,
      0,
    )
    const totalProjectedBalanceExVat = sourcesState.reduce(
      (sum, source) => sum + source.projectedBalanceExVat,
      0,
    )
    const totalAllocatedExVat = sourcesState.reduce(
      (sum, source) => sum + source.allocatedExVat,
      0,
    )

    return {
      totalPlannedExVat,
      totalActualAvailableExVat,
      totalProjectedBalanceExVat,
      totalAllocatedExVat,
      projectGapExVat: baselineBuildBudgetExVat - totalPlannedExVat,
    }
  }, [baselineBuildBudgetExVat, sourcesState])

  const statementRows = useMemo(
    () =>
      selectedSource
        ? buildStatementRows(selectedSource, allocationsState, statementAccountId)
        : [],
    [allocationsState, selectedSource, statementAccountId],
  )

  const statementBalance =
    statementRows[statementRows.length - 1]?.balanceExVat ||
    selectedSource?.projectedBalanceExVat ||
    0

  function openSourceModal(sourceId: string) {
    setSelectedSourceId(sourceId)
    setModalMessage("")
    setAccountForm(EMPTY_ACCOUNT_FORM)
    setEntryForm(EMPTY_ENTRY_FORM)
  }

  function closeSourceModal() {
    setSelectedSourceId(null)
    setStatementAccountId("all")
    setAccountForm(EMPTY_ACCOUNT_FORM)
    setEntryForm(EMPTY_ENTRY_FORM)
    setModalMessage("")
  }

  function startEditingAccount(account: FundingAccount) {
    setAccountForm({
      accountId: account.id,
      name: account.name,
      startingBalanceExVat: String(account.startingBalanceExVat),
    })
    setModalMessage("")
  }

  function resetAccountForm() {
    setAccountForm(EMPTY_ACCOUNT_FORM)
  }

  function startEditingEntry(entry: FundingEntry) {
    setEntryForm({
      entryId: entry.id,
      accountId: entry.accountId,
      date: entry.date,
      amountExVat: String(entry.amountExVat),
      status: entry.status || "actual",
      description: entry.description || "",
    })
    setModalMessage("")
  }

  function resetEntryForm(selectedAccountId?: string) {
    setEntryForm({
      ...EMPTY_ENTRY_FORM,
      accountId: selectedAccountId || selectedSource?.accounts[0]?.id || "",
    })
  }

  async function saveAccount() {
    if (!selectedSource) return
    if (!accountForm.name.trim()) {
      setModalMessage("Savings pot name is required.")
      return
    }

    setIsSavingAccount(true)
    setModalMessage("")

    try {
      const response = await fetch("/api/funding/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: selectedSource.id,
          accountId: accountForm.accountId || undefined,
          name: accountForm.name.trim(),
          startingBalanceExVat: Number(accountForm.startingBalanceExVat || 0),
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || "Could not save savings pot.")
      }

      const nextSources = recalculateFundingSources(
        sourcesState.map((source) =>
          source.id === selectedSource.id
            ? {
                ...source,
                accounts: accountForm.accountId
                  ? source.accounts.map((account) =>
                      account.id === accountForm.accountId
                        ? {
                            ...account,
                            name: payload.account.name as string,
                            startingBalanceExVat: Number(
                              payload.account.startingBalanceExVat || 0,
                            ),
                          }
                        : account,
                    )
                  : [
                      ...source.accounts,
                      {
                        id: payload.account.id as string,
                        name: payload.account.name as string,
                        startingBalanceExVat: Number(payload.account.startingBalanceExVat || 0),
                        actualSavedExVat: 0,
                        predictedSavedExVat: 0,
                        paymentAllocatedExVat: 0,
                        currentBalanceExVat: Number(payload.account.startingBalanceExVat || 0),
                        projectedBalanceExVat: Number(payload.account.startingBalanceExVat || 0),
                        entryCount: 0,
                        paymentCount: 0,
                      },
                    ],
              }
            : source,
        ),
        allocationsState,
      )

      setSourcesState(nextSources)
      setModalMessage(accountForm.accountId ? "Savings pot updated." : "Savings pot added.")
      const savedAccountId =
        accountForm.accountId || (payload.account.id as string) || selectedSource.accounts[0]?.id
      setStatementAccountId(savedAccountId || "all")
      resetAccountForm()
      resetEntryForm(savedAccountId)
      startTransition(() => {
        router.refresh()
      })
    } catch (error) {
      setModalMessage(error instanceof Error ? error.message : "Could not save savings pot.")
    } finally {
      setIsSavingAccount(false)
    }
  }

  async function saveEntry() {
    if (!selectedSource) return
    if (!entryForm.accountId) {
      setModalMessage("Choose a savings pot first.")
      return
    }
    if (!entryForm.date) {
      setModalMessage("Date is required.")
      return
    }

    setIsSavingEntry(true)
    setModalMessage("")

    try {
      const response = await fetch("/api/funding/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: selectedSource.id,
          entryId: entryForm.entryId || undefined,
          accountId: entryForm.accountId,
          date: entryForm.date,
          amountExVat: Number(entryForm.amountExVat || 0),
          status: entryForm.status,
          description: entryForm.description.trim() || undefined,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || "Could not save savings entry.")
      }

      const nextEntry = {
        id: payload.entry.id as string,
        accountId: payload.entry.accountId as string,
        date: payload.entry.date as string,
        amountExVat: Number(payload.entry.amountExVat || 0),
        status: payload.entry.status as "actual" | "predicted",
        description: payload.entry.description as string | undefined,
      }

      const nextSources = recalculateFundingSources(
        sourcesState.map((source) =>
          source.id === selectedSource.id
            ? {
                ...source,
                entries: entryForm.entryId
                  ? source.entries
                      .map((entry) => (entry.id === entryForm.entryId ? nextEntry : entry))
                      .sort((left, right) => left.date.localeCompare(right.date))
                  : [...source.entries, nextEntry].sort((left, right) =>
                      left.date.localeCompare(right.date),
                    ),
              }
            : source,
        ),
        allocationsState,
      )

      setSourcesState(nextSources)
      setModalMessage(entryForm.entryId ? "Savings entry updated." : "Savings entry added.")
      resetEntryForm(entryForm.accountId)
      startTransition(() => {
        router.refresh()
      })
    } catch (error) {
      setModalMessage(error instanceof Error ? error.message : "Could not save savings entry.")
    } finally {
      setIsSavingEntry(false)
    }
  }

  async function updatePaymentAllocation(
    paymentId: string,
    fundingSourceId: string,
    fundingAccountId?: string,
  ) {
    const nextFundingSourceId = fundingSourceId || undefined
    const source = nextFundingSourceId
      ? sourcesState.find((entry) => entry.id === nextFundingSourceId)
      : undefined
    const nextFundingAccountId =
      fundingAccountId && source?.accounts.some((account) => account.id === fundingAccountId)
        ? fundingAccountId
        : undefined

    setPendingPaymentIds((current) => [...current, paymentId])
    setPageMessage("")

    try {
      const response = await fetch("/api/funding/payment-allocation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId,
          fundingSourceId: nextFundingSourceId,
          fundingAccountId: nextFundingAccountId,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || "Could not update payment allocation.")
      }

      const nextAllocations = allocationsState.map((allocation) =>
        allocation.paymentId === paymentId
          ? {
              ...allocation,
              fundingSourceId: nextFundingSourceId,
              fundingSourceName: source?.name || "Unassigned",
              fundingAccountId: nextFundingAccountId,
              fundingAccountName: nextFundingAccountId
                ? source?.accounts.find((account) => account.id === nextFundingAccountId)?.name
                : undefined,
            }
          : allocation,
      )

      setAllocationsState(nextAllocations)
      setSourcesState(recalculateFundingSources(sourcesState, nextAllocations))
      setPageMessage("Payment funding allocation updated.")
      startTransition(() => {
        router.refresh()
      })
    } catch (error) {
      setPageMessage(
        error instanceof Error ? error.message : "Could not update payment allocation.",
      )
    } finally {
      setPendingPaymentIds((current) => current.filter((id) => id !== paymentId))
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Funding
        </p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight">
          Sources, allocations, and drawdown
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Track current cash, projected funding, funded payments, and the savings-ledger detail behind each pot.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Predicted funding" value={formatCurrency(totals.totalPlannedExVat)} />
        <MetricCard label="Available now" value={formatCurrency(totals.totalActualAvailableExVat)} />
        <MetricCard label="Allocated to date" value={formatCurrency(totals.totalAllocatedExVat)} />
        <MetricCard label="Project gap" value={formatCurrency(totals.projectGapExVat)} />
      </div>

      <Card className="border-border/70 py-0">
        <CardHeader className="px-5 pt-5">
          <CardTitle className="text-2xl font-medium tracking-tight">
            Funding sources
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Predicted balance</TableHead>
                <TableHead>Allocated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sourcesState.map((source) => (
                <TableRow key={source.id}>
                  <TableCell className="max-w-[26rem] whitespace-normal">
                    {source.type === "cash" ? (
                      <button
                        type="button"
                        onClick={() => openSourceModal(source.id)}
                        className="text-left"
                      >
                        <p className="font-medium text-foreground underline underline-offset-4">
                          {source.name}
                        </p>
                      </button>
                    ) : (
                      <p className="font-medium text-foreground">{source.name}</p>
                    )}
                    {source.notes ? (
                      <p className="mt-1 text-sm text-muted-foreground">{source.notes}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>{source.type}</TableCell>
                  <TableCell>{source.status}</TableCell>
                  <TableCell>{formatCurrency(source.remainingExVat)}</TableCell>
                  <TableCell>{formatCurrency(source.projectedBalanceExVat)}</TableCell>
                  <TableCell>{formatCurrency(source.allocatedExVat)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-border/70 py-0">
          <CardHeader className="px-5 pt-5">
            <CardTitle className="text-2xl font-medium tracking-tight">
              Drawdown plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5">
            {fundingStages.map((stage) => (
              <div
                key={stage.id}
                className="border border-border/70 bg-secondary/20 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{stage.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {stage.milestoneName} · {formatDate(stage.milestoneDate)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {stage.drawdownExcluded
                        ? "Self-funded pre-start"
                        : `${stage.fundingSourceName || "Funding source"} drawdown`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">
                      {formatCurrency(stage.amountExVat)}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      {Math.round(stage.drawdownPercent * 100)}%
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/70 py-0">
          <CardHeader className="px-5 pt-5">
            <CardTitle className="text-2xl font-medium tracking-tight">
              Funded payments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5">
            {pageMessage ? <p className="text-sm text-muted-foreground">{pageMessage}</p> : null}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Pot</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocationsState.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      No funding allocations recorded yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  allocationsState.map((allocation) => {
                    const allocationSource = allocation.fundingSourceId
                      ? sourcesState.find((source) => source.id === allocation.fundingSourceId)
                      : null
                    const isPending = pendingPaymentIds.includes(allocation.paymentId)

                    return (
                      <TableRow key={allocation.paymentId}>
                        <TableCell>{formatDate(allocation.paidDate)}</TableCell>
                        <TableCell>
                          <select
                            value={allocation.fundingSourceId || ""}
                            onChange={(event) => {
                              void updatePaymentAllocation(
                                allocation.paymentId,
                                event.target.value,
                                undefined,
                              )
                            }}
                            disabled={isPending}
                            className="h-9 min-w-[12rem] border border-border bg-card px-3 text-sm text-foreground"
                          >
                            <option value="">Unassigned</option>
                            {sourcesState.map((source) => (
                              <option key={source.id} value={source.id}>
                                {source.name}
                              </option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell>
                          {allocationSource?.accounts.length ? (
                            <select
                              value={allocation.fundingAccountId || ""}
                              onChange={(event) => {
                                void updatePaymentAllocation(
                                  allocation.paymentId,
                                  allocation.fundingSourceId || "",
                                  event.target.value || undefined,
                                )
                              }}
                              disabled={isPending}
                              className="h-9 min-w-[11rem] border border-border bg-card px-3 text-sm text-foreground"
                            >
                              <option value="">Unassigned</option>
                              {allocationSource.accounts.map((account) => (
                                <option key={account.id} value={account.id}>
                                  {account.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>{allocation.supplierName}</TableCell>
                        <TableCell>{allocation.categoryName}</TableCell>
                        <TableCell>{allocation.invoiceNumber}</TableCell>
                        <TableCell>{formatCurrency(allocation.amountExVat)}</TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={6} className="font-medium">
                    Total funded payments
                  </TableCell>
                  <TableCell>{formatCurrency(totals.totalAllocatedExVat)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={Boolean(selectedSource)}
        onOpenChange={(open) => {
          if (!open) {
            closeSourceModal()
          }
        }}
      >
        <DialogContent className="h-[calc(100vh-80px)] w-[calc(100vw-80px)] max-w-[calc(100vw-80px)] overflow-y-auto border-border p-0 sm:max-w-[calc(100vw-80px)]">
          {selectedSource ? (
            <Card className="border-0 py-0">
              <CardHeader className="px-5 pt-5">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-medium tracking-tight">
                    {selectedSource.name}
                  </DialogTitle>
                  <DialogDescription>
                    Current cash, projected savings, and linked payments presented as a statement.
                  </DialogDescription>
                </DialogHeader>
              </CardHeader>
              <CardContent className="space-y-6 px-5 pb-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <MetricCard label="Available" value={formatCurrency(selectedSource.remainingExVat)} />
                  <MetricCard label="Allocated" value={formatCurrency(selectedSource.allocatedExVat)} />
                  <MetricCard label="Predicted balance" value={formatCurrency(statementBalance)} />
                </div>

                {modalMessage ? <p className="text-sm text-muted-foreground">{modalMessage}</p> : null}

                <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <h3 className="text-lg font-medium tracking-tight text-foreground">
                        Savings pots
                      </h3>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Pot</TableHead>
                            <TableHead>Opening</TableHead>
                            <TableHead>Actual saved</TableHead>
                            <TableHead>Predicted saved</TableHead>
                            <TableHead>Spent</TableHead>
                            <TableHead>Available</TableHead>
                            <TableHead>Predicted</TableHead>
                            <TableHead>Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedSource.accounts.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={8} className="text-muted-foreground">
                                No savings pots added yet.
                              </TableCell>
                            </TableRow>
                          ) : (
                            selectedSource.accounts.map((account) => (
                              <TableRow key={account.id}>
                                <TableCell>{account.name}</TableCell>
                                <TableCell>{formatCurrency(account.startingBalanceExVat)}</TableCell>
                                <TableCell>{formatCurrency(account.actualSavedExVat)}</TableCell>
                                <TableCell>{formatCurrency(account.predictedSavedExVat)}</TableCell>
                                <TableCell>{formatCurrency(account.paymentAllocatedExVat)}</TableCell>
                                <TableCell>{formatCurrency(account.currentBalanceExVat)}</TableCell>
                                <TableCell>{formatCurrency(account.projectedBalanceExVat)}</TableCell>
                                <TableCell>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => startEditingAccount(account)}
                                  >
                                    Edit
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="space-y-3 border border-border/70 p-4">
                      <h3 className="text-lg font-medium tracking-tight text-foreground">
                        {accountForm.accountId ? "Edit savings pot" : "Add savings pot"}
                      </h3>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input
                          value={accountForm.name}
                          onChange={(event) =>
                            setAccountForm((current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                          placeholder="Pot name"
                        />
                        <Input
                          value={accountForm.startingBalanceExVat}
                          onChange={(event) =>
                            setAccountForm((current) => ({
                              ...current,
                              startingBalanceExVat: event.target.value,
                            }))
                          }
                          type="number"
                          inputMode="decimal"
                          placeholder="Opening balance"
                        />
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button type="button" onClick={() => void saveAccount()} disabled={isSavingAccount}>
                          {isSavingAccount
                            ? "Saving…"
                            : accountForm.accountId
                              ? "Save pot"
                              : "Add pot"}
                        </Button>
                        {accountForm.accountId ? (
                          <Button type="button" variant="outline" onClick={resetAccountForm}>
                            Cancel
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-3 border border-border/70 p-4">
                      <h3 className="text-lg font-medium tracking-tight text-foreground">
                        {entryForm.entryId ? "Edit savings line item" : "Add savings line item"}
                      </h3>
                      <div className="grid gap-3 md:grid-cols-2">
                        <select
                          value={entryForm.accountId}
                          onChange={(event) =>
                            setEntryForm((current) => ({
                              ...current,
                              accountId: event.target.value,
                            }))
                          }
                          className="h-10 border border-border bg-card px-3 text-sm text-foreground"
                        >
                          <option value="">Choose pot</option>
                          {selectedSource.accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={entryForm.status}
                          onChange={(event) =>
                            setEntryForm((current) => ({
                              ...current,
                              status: event.target.value as "actual" | "predicted",
                            }))
                          }
                          className="h-10 border border-border bg-card px-3 text-sm text-foreground"
                        >
                          <option value="actual">Actual saved</option>
                          <option value="predicted">Predicted saving</option>
                        </select>
                        <Input
                          type="date"
                          value={entryForm.date}
                          onChange={(event) =>
                            setEntryForm((current) => ({
                              ...current,
                              date: event.target.value,
                            }))
                          }
                        />
                        <Input
                          value={entryForm.amountExVat}
                          onChange={(event) =>
                            setEntryForm((current) => ({
                              ...current,
                              amountExVat: event.target.value,
                            }))
                          }
                          type="number"
                          inputMode="decimal"
                          placeholder="Amount"
                        />
                        <Input
                          value={entryForm.description}
                          onChange={(event) =>
                            setEntryForm((current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                          placeholder="Description"
                          className="md:col-span-2"
                        />
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button type="button" onClick={() => void saveEntry()} disabled={isSavingEntry}>
                          {isSavingEntry
                            ? "Saving…"
                            : entryForm.entryId
                              ? "Save line item"
                              : "Add line item"}
                        </Button>
                        {entryForm.entryId ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              setEntryForm((current) => ({
                                ...current,
                                status: "actual",
                              }))
                            }
                          >
                            Mark as actual
                          </Button>
                        ) : null}
                        {entryForm.entryId ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => resetEntryForm(selectedSource.accounts[0]?.id)}
                          >
                            Cancel
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-lg font-medium tracking-tight text-foreground">
                        Statement
                      </h3>
                      <select
                        value={statementAccountId}
                        onChange={(event) => setStatementAccountId(event.target.value)}
                        className="h-10 min-w-[14rem] border border-border bg-card px-3 text-sm text-foreground"
                      >
                        <option value="all">All pots</option>
                        {selectedSource.accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedSource.unassignedAllocatedExVat > 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(selectedSource.unassignedAllocatedExVat)} of linked payments are still not assigned to a specific pot.
                      </p>
                    ) : null}

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Pot</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>In</TableHead>
                          <TableHead>Out</TableHead>
                          <TableHead>Balance</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {statementRows.map((row) => (
                          <TableRow
                            key={row.id}
                            className={row.kind === "predicted-saving" ? "opacity-50" : undefined}
                          >
                            <TableCell>{row.date ? formatDate(row.date) : "-"}</TableCell>
                            <TableCell>{labelForStatementKind(row.kind)}</TableCell>
                            <TableCell>{row.accountName}</TableCell>
                            <TableCell className="max-w-[18rem] whitespace-normal">
                              {row.label}
                            </TableCell>
                            <TableCell>
                              {row.creditExVat > 0 ? formatCurrency(row.creditExVat) : "-"}
                            </TableCell>
                            <TableCell>
                              {row.debitExVat > 0 ? formatCurrency(row.debitExVat) : "-"}
                            </TableCell>
                            <TableCell>{formatCurrency(row.balanceExVat)}</TableCell>
                            <TableCell>
                              {row.entryId ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const entry = selectedSource.entries.find(
                                      (item) => item.id === row.entryId,
                                    )
                                    if (entry) {
                                      startEditingEntry(entry)
                                    }
                                  }}
                                >
                                  Edit
                                </Button>
                              ) : (
                                <span className="text-sm text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function sourceUsesLedger(source: FundingSource): boolean {
  return Boolean(source.accounts.length || source.entries.length)
}

function recalculateFundingSources(
  sources: FundingSummary["sources"],
  allocations: FundingAllocation[],
): FundingSummary["sources"] {
  return sources.map((source) => {
    const sourceAllocations = allocations.filter(
      (allocation) => allocation.fundingSourceId === source.id,
    )
    const allocatedExVat = sourceAllocations.reduce(
      (sum, allocation) => sum + allocation.amountExVat,
      0,
    )
    const usesLedger = sourceUsesLedger(source)
    const actualBaseExVat = usesLedger
      ? source.accounts.reduce((sum, account) => sum + account.startingBalanceExVat, 0)
      : source.actualAmountExVat
    const actualSavedExVat = source.entries
      .filter((entry) => entry.status !== "predicted")
      .reduce((sum, entry) => sum + entry.amountExVat, 0)
    const predictedSavedExVat = source.entries
      .filter((entry) => entry.status === "predicted")
      .reduce((sum, entry) => sum + entry.amountExVat, 0)
    const actualAmountExVat = actualBaseExVat + actualSavedExVat
    const predictedAmountExVat = usesLedger
      ? actualAmountExVat + predictedSavedExVat
      : source.predictedAmountExVat
    const accounts = source.accounts.map((account) => {
      const accountActualSavedExVat = source.entries
        .filter((entry) => entry.accountId === account.id && entry.status !== "predicted")
        .reduce((sum, entry) => sum + entry.amountExVat, 0)
      const accountPredictedSavedExVat = source.entries
        .filter((entry) => entry.accountId === account.id && entry.status === "predicted")
        .reduce((sum, entry) => sum + entry.amountExVat, 0)
      const accountAllocations = sourceAllocations.filter(
        (allocation) => allocation.fundingAccountId === account.id,
      )
      const paymentAllocatedExVat = accountAllocations.reduce(
        (sum, allocation) => sum + allocation.amountExVat,
        0,
      )

      return {
        ...account,
        actualSavedExVat: accountActualSavedExVat,
        predictedSavedExVat: accountPredictedSavedExVat,
        paymentAllocatedExVat,
        currentBalanceExVat:
          account.startingBalanceExVat + accountActualSavedExVat - paymentAllocatedExVat,
        projectedBalanceExVat:
          account.startingBalanceExVat +
          accountActualSavedExVat +
          accountPredictedSavedExVat -
          paymentAllocatedExVat,
        entryCount: source.entries.filter((entry) => entry.accountId === account.id).length,
        paymentCount: accountAllocations.length,
      }
    })

    return {
      ...source,
      amountExVat: predictedAmountExVat,
      actualAmountExVat,
      predictedAmountExVat,
      allocatedExVat,
      remainingExVat: actualAmountExVat - allocatedExVat,
      projectedBalanceExVat: predictedAmountExVat - allocatedExVat,
      paymentCount: sourceAllocations.length,
      hasLedger: usesLedger,
      accounts,
      unassignedAllocatedExVat: sourceAllocations
        .filter((allocation) => !allocation.fundingAccountId)
        .reduce((sum, allocation) => sum + allocation.amountExVat, 0),
    }
  })
}

function buildStatementRows(
  source: FundingSource,
  allocations: FundingAllocation[],
  statementAccountId: string,
): StatementRow[] {
  const sourceAllocations = allocations.filter(
    (allocation) => allocation.fundingSourceId === source.id,
  )
  const isAllPots = statementAccountId === "all"
  const selectedAccount = source.accounts.find((account) => account.id === statementAccountId)
  const usesLedger = sourceUsesLedger(source)
  const openingRows: Array<Omit<StatementRow, "balanceExVat">> = usesLedger
    ? isAllPots
      ? source.accounts.map((account) => ({
          id: `${source.id}-${account.id}-opening`,
          date: "",
          kind: "opening" as const,
          label: "Opening balance",
          accountName: account.name,
          creditExVat: account.startingBalanceExVat,
          debitExVat: 0,
        }))
      : [
          {
            id: `${source.id}-${statementAccountId}-opening`,
            date: "",
            kind: "opening" as const,
            label: "Opening balance",
            accountName: selectedAccount?.name || "Selected pot",
            creditExVat: selectedAccount?.startingBalanceExVat || 0,
            debitExVat: 0,
          },
        ]
    : [
        {
          id: `${source.id}-opening`,
          date: "",
          kind: "opening" as const,
          label: "Opening balance",
          accountName: source.name,
          creditExVat: source.actualAmountExVat,
          debitExVat: 0,
        },
      ]

  const movementRows = [
    ...source.entries
      .filter((entry) => !usesLedger || isAllPots || entry.accountId === statementAccountId)
      .map((entry) => ({
        id: entry.id,
        date: entry.date,
        kind:
          entry.status === "predicted"
            ? ("predicted-saving" as const)
            : ("actual-saving" as const),
        label: entry.description || "Savings entry",
        accountName:
          source.accounts.find((account) => account.id === entry.accountId)?.name || source.name,
        creditExVat: entry.amountExVat,
        debitExVat: 0,
        entryId: entry.id,
      })),
    ...sourceAllocations
      .filter((allocation) => {
        if (!usesLedger || isAllPots) return true
        return allocation.fundingAccountId === statementAccountId
      })
      .map((allocation) => ({
        id: allocation.paymentId,
        date: allocation.paidDate,
        kind: "payment" as const,
        label: `${allocation.supplierName} · ${allocation.invoiceNumber}`,
        accountName: allocation.fundingAccountName || "Unassigned",
        creditExVat: 0,
        debitExVat: allocation.amountExVat,
      })),
  ].sort((left, right) => {
    const dateComparison = left.date.localeCompare(right.date)
    if (dateComparison !== 0) return dateComparison
    return left.label.localeCompare(right.label)
  })

  let runningBalance = 0
  const rows: StatementRow[] = []

  for (const openingRow of openingRows) {
    runningBalance += openingRow.creditExVat - openingRow.debitExVat
    rows.push({
      ...openingRow,
      balanceExVat: runningBalance,
    })
  }

  for (const movement of movementRows) {
    runningBalance += movement.creditExVat - movement.debitExVat
    rows.push({
      ...movement,
      balanceExVat: runningBalance,
    })
  }

  if (!usesLedger && source.predictedAmountExVat > source.actualAmountExVat) {
    runningBalance += source.predictedAmountExVat - source.actualAmountExVat
    rows.push({
      id: `${source.id}-projected-balance`,
      date: "",
      kind: "predicted-saving",
      label: "Projected savings not yet itemised",
      accountName: source.name,
      creditExVat: source.predictedAmountExVat - source.actualAmountExVat,
      debitExVat: 0,
      balanceExVat: runningBalance,
    })
  }

  return rows
}

function labelForStatementKind(kind: StatementRow["kind"]): string {
  switch (kind) {
    case "opening":
      return "Opening"
    case "actual-saving":
      return "Actual saving"
    case "predicted-saving":
      return "Predicted saving"
    case "payment":
      return "Payment"
    default:
      return kind
  }
}
