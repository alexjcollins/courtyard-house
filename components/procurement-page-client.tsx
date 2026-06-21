"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"
import { MetricCard } from "@/components/metric-card"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { formatCurrency, formatDate } from "@/lib/format"
import type {
  Invoice,
  Payment,
  PaymentsFile,
  ProcurementEntityType,
  ProcurementFile,
  PurchaseOrder,
  Quote,
  SaveInvoiceInput,
  SavePaymentInput,
  SavePurchaseOrderInput,
  SaveQuoteInput,
  SaveStagePaymentInput,
  SaveSupplierInput,
  Supplier,
} from "@/lib/data"
import { cn } from "@/lib/utils"

type ProcurementPageClientProps = {
  initialProcurementFile: ProcurementFile
  initialPaymentsFile: PaymentsFile
  categories: Array<{ id: string; name: string }>
  milestones: Array<{ id: string; name: string; plannedDate: string }>
  fundingSources: Array<{
    id: string
    name: string
    accounts: Array<{ id: string; name: string }>
  }>
  canEdit: boolean
}

type DialogType = ProcurementEntityType | null

const EMPTY_SUPPLIER_FORM: SaveSupplierInput = {
  name: "",
  trade: "",
  email: "",
  phone: "",
  notes: "",
}

const EMPTY_QUOTE_FORM: SaveQuoteInput = {
  supplierId: "",
  categoryId: "",
  title: "",
  amountExVat: 0,
  vatRate: 0.2,
  vatIncluded: false,
  status: "received",
  quoteDate: "",
  expiryDate: "",
  notes: "",
}

const EMPTY_STAGE_PAYMENT: SaveStagePaymentInput = {
  title: "",
  type: "fixed",
  value: 0,
  dueDate: "",
  milestoneId: "",
  notes: "",
}

const EMPTY_PURCHASE_ORDER_FORM: SavePurchaseOrderInput = {
  supplierId: "",
  categoryId: "",
  quoteId: "",
  title: "",
  amountExVat: 0,
  vatRate: 0.2,
  vatIncluded: false,
  status: "issued",
  issuedDate: "",
  notes: "",
  stagePayments: [],
}

const EMPTY_INVOICE_FORM: SaveInvoiceInput = {
  purchaseOrderId: "",
  supplierId: "",
  stagePaymentId: "",
  number: "",
  amountExVat: 0,
  vatRate: 0.2,
  vatIncluded: false,
  issueDate: "",
  dueDate: "",
  status: "received",
  notes: "",
}

const EMPTY_PAYMENT_FORM: SavePaymentInput = {
  invoiceId: "",
  amountExVat: 0,
  paidDate: "",
  fundingSourceId: "",
  fundingAccountId: "",
  reference: "",
  notes: "",
}

function numberInputValue(value: number | undefined) {
  return value && value !== 0 ? String(value) : ""
}

function createSupplierForm(supplier?: Supplier): SaveSupplierInput {
  if (!supplier) {
    return EMPTY_SUPPLIER_FORM
  }

  return {
    supplierId: supplier.id,
    name: supplier.name,
    trade: supplier.trade || "",
    email: supplier.email || "",
    phone: supplier.phone || "",
    notes: supplier.notes || "",
  }
}

function createQuoteForm(quote?: Quote): SaveQuoteInput {
  if (!quote) {
    return EMPTY_QUOTE_FORM
  }

  return {
    quoteId: quote.id,
    supplierId: quote.supplierId,
    categoryId: quote.categoryId || "",
    title: quote.title,
    amountExVat: quote.amountExVat,
    vatRate: quote.vatRate ?? 0.2,
    vatIncluded: Boolean(quote.vatIncluded),
    status: quote.status,
    quoteDate: quote.quoteDate || "",
    expiryDate: quote.expiryDate || "",
    notes: quote.notes || "",
  }
}

function createPurchaseOrderForm(purchaseOrder?: PurchaseOrder): SavePurchaseOrderInput {
  if (!purchaseOrder) {
    return EMPTY_PURCHASE_ORDER_FORM
  }

  return {
    purchaseOrderId: purchaseOrder.id,
    supplierId: purchaseOrder.supplierId,
    categoryId: purchaseOrder.categoryId || "",
    quoteId: purchaseOrder.quoteId || "",
    title: purchaseOrder.title,
    amountExVat: purchaseOrder.amountExVat,
    vatRate: purchaseOrder.vatRate ?? 0.2,
    vatIncluded: Boolean(purchaseOrder.vatIncluded),
    status: purchaseOrder.status,
    issuedDate: purchaseOrder.issuedDate || "",
    notes: purchaseOrder.notes || "",
    stagePayments: (purchaseOrder.stagePayments || []).map((stagePayment) => ({
      stagePaymentId: stagePayment.id,
      title: stagePayment.title,
      type: stagePayment.type,
      value: stagePayment.value,
      dueDate: stagePayment.dueDate || "",
      milestoneId: stagePayment.milestoneId || "",
      notes: stagePayment.notes || "",
    })),
  }
}

function createInvoiceForm(invoice?: Invoice): SaveInvoiceInput {
  if (!invoice) {
    return EMPTY_INVOICE_FORM
  }

  return {
    invoiceId: invoice.id,
    purchaseOrderId: invoice.purchaseOrderId,
    supplierId: invoice.supplierId,
    stagePaymentId: invoice.stagePaymentId || "",
    number: invoice.number || "",
    amountExVat: invoice.amountExVat,
    vatRate: invoice.vatRate ?? 0.2,
    vatIncluded: Boolean(invoice.vatIncluded),
    issueDate: invoice.issueDate || "",
    dueDate: invoice.dueDate || "",
    status: invoice.status,
    notes: invoice.notes || "",
  }
}

function createPaymentForm(payment?: Payment): SavePaymentInput {
  if (!payment) {
    return EMPTY_PAYMENT_FORM
  }

  return {
    paymentId: payment.id,
    invoiceId: payment.invoiceId,
    amountExVat: payment.amountExVat,
    paidDate: payment.paidDate,
    fundingSourceId: payment.fundingSourceId || "",
    fundingAccountId: payment.fundingAccountId || "",
    reference: payment.reference || "",
    notes: payment.notes || "",
  }
}

export function ProcurementPageClient({
  initialProcurementFile,
  initialPaymentsFile,
  categories,
  milestones,
  fundingSources,
  canEdit,
}: ProcurementPageClientProps) {
  const router = useRouter()
  const [procurementFile, setProcurementFile] = useState(initialProcurementFile)
  const [paymentsFile, setPaymentsFile] = useState(initialPaymentsFile)
  const [dialogType, setDialogType] = useState<DialogType>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [supplierForm, setSupplierForm] = useState<SaveSupplierInput>(EMPTY_SUPPLIER_FORM)
  const [quoteForm, setQuoteForm] = useState<SaveQuoteInput>(EMPTY_QUOTE_FORM)
  const [purchaseOrderForm, setPurchaseOrderForm] = useState<SavePurchaseOrderInput>(
    EMPTY_PURCHASE_ORDER_FORM,
  )
  const [invoiceForm, setInvoiceForm] = useState<SaveInvoiceInput>(EMPTY_INVOICE_FORM)
  const [paymentForm, setPaymentForm] = useState<SavePaymentInput>(EMPTY_PAYMENT_FORM)

  useEffect(() => {
    setProcurementFile(initialProcurementFile)
  }, [initialProcurementFile])

  useEffect(() => {
    setPaymentsFile(initialPaymentsFile)
  }, [initialPaymentsFile])

  const supplierMap = useMemo(
    () => new Map(procurementFile.suppliers.map((supplier) => [supplier.id, supplier])),
    [procurementFile.suppliers],
  )

  const purchaseOrderMap = useMemo(
    () =>
      new Map(
        procurementFile.purchaseOrders.map((purchaseOrder) => [purchaseOrder.id, purchaseOrder]),
      ),
    [procurementFile.purchaseOrders],
  )

  const quoteMap = useMemo(
    () => new Map(procurementFile.quotes.map((quote) => [quote.id, quote])),
    [procurementFile.quotes],
  )

  const invoiceMap = useMemo(
    () => new Map(procurementFile.invoices.map((invoice) => [invoice.id, invoice])),
    [procurementFile.invoices],
  )

  const stagePayments = useMemo(
    () =>
      procurementFile.purchaseOrders.flatMap((purchaseOrder) =>
        (purchaseOrder.stagePayments || []).map((stagePayment) => ({
          ...stagePayment,
          purchaseOrderId: purchaseOrder.id,
          purchaseOrderTitle: purchaseOrder.title,
          supplierName:
            supplierMap.get(purchaseOrder.supplierId)?.name || "Unknown supplier",
        })),
      ),
    [procurementFile.purchaseOrders, supplierMap],
  )

  const totals = useMemo(
    () => ({
      supplierCount: procurementFile.suppliers.length,
      quoteCount: procurementFile.quotes.length,
      purchaseOrderCount: procurementFile.purchaseOrders.length,
      invoiceCount: procurementFile.invoices.length,
      paymentCount: paymentsFile.payments.length,
      paymentTotalExVat: paymentsFile.payments.reduce(
        (sum, payment) => sum + payment.amountExVat,
        0,
      ),
    }),
    [paymentsFile.payments, procurementFile],
  )

  const selectedInvoicePurchaseOrder = invoiceForm.purchaseOrderId
    ? purchaseOrderMap.get(invoiceForm.purchaseOrderId)
    : null

  const selectedFundingSource = paymentForm.fundingSourceId
    ? fundingSources.find((source) => source.id === paymentForm.fundingSourceId) || null
    : null

  function setSnapshot(nextProcurementFile: ProcurementFile, nextPaymentsFile: PaymentsFile) {
    setProcurementFile(nextProcurementFile)
    setPaymentsFile(nextPaymentsFile)
  }

  function resetDialogs() {
    setDialogType(null)
    setError(null)
    setIsSaving(false)
    setIsDeleting(false)
  }

  function openCreateSupplierDialog() {
    setError(null)
    setSupplierForm(EMPTY_SUPPLIER_FORM)
    setDialogType("supplier")
  }

  function openEditSupplierDialog(supplier: Supplier) {
    setError(null)
    setSupplierForm(createSupplierForm(supplier))
    setDialogType("supplier")
  }

  function openCreateQuoteDialog() {
    setError(null)
    setQuoteForm(EMPTY_QUOTE_FORM)
    setDialogType("quote")
  }

  function openEditQuoteDialog(quote: Quote) {
    setError(null)
    setQuoteForm(createQuoteForm(quote))
    setDialogType("quote")
  }

  function openCreatePurchaseOrderDialog() {
    setError(null)
    setPurchaseOrderForm(EMPTY_PURCHASE_ORDER_FORM)
    setDialogType("purchaseOrder")
  }

  function openEditPurchaseOrderDialog(purchaseOrder: PurchaseOrder) {
    setError(null)
    setPurchaseOrderForm(createPurchaseOrderForm(purchaseOrder))
    setDialogType("purchaseOrder")
  }

  function openCreateInvoiceDialog() {
    setError(null)
    setInvoiceForm(EMPTY_INVOICE_FORM)
    setDialogType("invoice")
  }

  function openEditInvoiceDialog(invoice: Invoice) {
    setError(null)
    setInvoiceForm(createInvoiceForm(invoice))
    setDialogType("invoice")
  }

  function openCreatePaymentDialog() {
    setError(null)
    setPaymentForm(EMPTY_PAYMENT_FORM)
    setDialogType("payment")
  }

  function openEditPaymentDialog(payment: Payment) {
    setError(null)
    setPaymentForm(createPaymentForm(payment))
    setDialogType("payment")
  }

  async function saveEntity(entityType: ProcurementEntityType, payload: unknown) {
    setIsSaving(true)
    setError(null)

    try {
      const response = await fetch("/api/procurement/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, payload }),
      })
      const nextPayload = await response.json()

      if (!response.ok) {
        throw new Error(nextPayload.error || "Could not save record.")
      }

      setSnapshot(nextPayload.procurementFile, nextPayload.paymentsFile)
      resetDialogs()
      router.refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not save record.")
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteEntity(entityType: ProcurementEntityType, entityId: string | undefined) {
    if (!entityId) {
      return
    }

    if (!window.confirm("Delete this record?")) {
      return
    }

    setIsDeleting(true)
    setError(null)

    try {
      const response = await fetch("/api/procurement/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId }),
      })
      const nextPayload = await response.json()

      if (!response.ok) {
        throw new Error(nextPayload.error || "Could not delete record.")
      }

      setSnapshot(nextPayload.procurementFile, nextPayload.paymentsFile)
      resetDialogs()
      router.refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not delete record.")
    } finally {
      setIsDeleting(false)
    }
  }

  function updateStagePayment(index: number, patch: Partial<SaveStagePaymentInput>) {
    setPurchaseOrderForm((current) => ({
      ...current,
      stagePayments: (current.stagePayments || []).map((stagePayment, stageIndex) =>
        stageIndex === index ? { ...stagePayment, ...patch } : stagePayment,
      ),
    }))
  }

  function addStagePayment() {
    setPurchaseOrderForm((current) => ({
      ...current,
      stagePayments: [...(current.stagePayments || []), EMPTY_STAGE_PAYMENT],
    }))
  }

  function removeStagePayment(index: number) {
    setPurchaseOrderForm((current) => ({
      ...current,
      stagePayments: (current.stagePayments || []).filter(
        (_stagePayment, stageIndex) => stageIndex !== index,
      ),
    }))
  }

  function renderSupplierDialog() {
    return (
      <>
        <DialogHeader>
          <DialogTitle>
            {supplierForm.supplierId ? "Edit supplier" : "Add supplier"}
          </DialogTitle>
          <DialogDescription>
            Keep the supplier directory current so quotes, orders, and invoices can link cleanly.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={supplierForm.name}
              onChange={(event) =>
                setSupplierForm((current) => ({ ...current, name: event.target.value }))
              }
              disabled={isSaving}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Trade</label>
            <Input
              value={supplierForm.trade || ""}
              onChange={(event) =>
                setSupplierForm((current) => ({ ...current, trade: event.target.value }))
              }
              disabled={isSaving}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Email</label>
            <Input
              value={supplierForm.email || ""}
              onChange={(event) =>
                setSupplierForm((current) => ({ ...current, email: event.target.value }))
              }
              disabled={isSaving}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Phone</label>
            <Input
              value={supplierForm.phone || ""}
              onChange={(event) =>
                setSupplierForm((current) => ({ ...current, phone: event.target.value }))
              }
              disabled={isSaving}
            />
          </div>
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">Notes</label>
          <Textarea
            value={supplierForm.notes || ""}
            onChange={(event) =>
              setSupplierForm((current) => ({ ...current, notes: event.target.value }))
            }
            disabled={isSaving}
            className="min-h-28"
          />
        </div>

        <DialogFooter className="justify-between sm:justify-between">
          <div>
            {supplierForm.supplierId ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void deleteEntity("supplier", supplierForm.supplierId)}
                disabled={isSaving || isDeleting}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={resetDialogs} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void saveEntity("supplier", supplierForm)}
              disabled={isSaving || !supplierForm.name.trim()}
            >
              {isSaving ? "Saving..." : supplierForm.supplierId ? "Save supplier" : "Create supplier"}
            </Button>
          </div>
        </DialogFooter>
      </>
    )
  }

  function renderQuoteDialog() {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{quoteForm.quoteId ? "Edit quote" : "Add quote"}</DialogTitle>
          <DialogDescription>
            Record incoming prices before a package is accepted or converted into a purchase order.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Supplier</label>
            <select
              value={quoteForm.supplierId}
              onChange={(event) =>
                setQuoteForm((current) => ({ ...current, supplierId: event.target.value }))
              }
              className="h-10 border border-border/70 bg-background px-3 text-sm"
              disabled={isSaving}
            >
              <option value="">Choose supplier</option>
              {procurementFile.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Category</label>
            <select
              value={quoteForm.categoryId || ""}
              onChange={(event) =>
                setQuoteForm((current) => ({ ...current, categoryId: event.target.value }))
              }
              className="h-10 border border-border/70 bg-background px-3 text-sm"
              disabled={isSaving}
            >
              <option value="">Unassigned</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 md:col-span-2">
            <label className="text-sm font-medium">Title</label>
            <Input
              value={quoteForm.title}
              onChange={(event) =>
                setQuoteForm((current) => ({ ...current, title: event.target.value }))
              }
              disabled={isSaving}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Amount ex VAT</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={numberInputValue(quoteForm.amountExVat)}
              onChange={(event) =>
                setQuoteForm((current) => ({
                  ...current,
                  amountExVat: Number(event.target.value || 0),
                }))
              }
              disabled={isSaving}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">VAT rate</label>
            <select
              value={String(quoteForm.vatRate ?? 0.2)}
              onChange={(event) =>
                setQuoteForm((current) => ({
                  ...current,
                  vatRate: Number(event.target.value),
                }))
              }
              className="h-10 border border-border/70 bg-background px-3 text-sm"
              disabled={isSaving}
            >
              <option value="0">0%</option>
              <option value="0.05">5%</option>
              <option value="0.2">20%</option>
            </select>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Quote date</label>
            <Input
              type="date"
              value={quoteForm.quoteDate || ""}
              onChange={(event) =>
                setQuoteForm((current) => ({ ...current, quoteDate: event.target.value }))
              }
              disabled={isSaving}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Expiry date</label>
            <Input
              type="date"
              value={quoteForm.expiryDate || ""}
              onChange={(event) =>
                setQuoteForm((current) => ({ ...current, expiryDate: event.target.value }))
              }
              disabled={isSaving}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Status</label>
            <select
              value={quoteForm.status}
              onChange={(event) =>
                setQuoteForm((current) => ({ ...current, status: event.target.value }))
              }
              className="h-10 border border-border/70 bg-background px-3 text-sm"
              disabled={isSaving}
            >
              <option value="received">Received</option>
              <option value="accepted">Accepted</option>
              <option value="planned">Planned</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">Notes</label>
          <Textarea
            value={quoteForm.notes || ""}
            onChange={(event) =>
              setQuoteForm((current) => ({ ...current, notes: event.target.value }))
            }
            disabled={isSaving}
            className="min-h-28"
          />
        </div>

        <DialogFooter className="justify-between sm:justify-between">
          <div>
            {quoteForm.quoteId ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void deleteEntity("quote", quoteForm.quoteId)}
                disabled={isSaving || isDeleting}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={resetDialogs} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void saveEntity("quote", quoteForm)}
              disabled={isSaving || !quoteForm.title.trim() || !quoteForm.supplierId}
            >
              {isSaving ? "Saving..." : quoteForm.quoteId ? "Save quote" : "Create quote"}
            </Button>
          </div>
        </DialogFooter>
      </>
    )
  }

  function renderPurchaseOrderDialog() {
    return (
      <>
        <DialogHeader>
          <DialogTitle>
            {purchaseOrderForm.purchaseOrderId ? "Edit purchase order" : "Add purchase order"}
          </DialogTitle>
          <DialogDescription>
            Capture issued contract values and optional stage payment calls against the package.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Quote</label>
              <select
                value={purchaseOrderForm.quoteId || ""}
                onChange={(event) => {
                  const nextQuote = quoteMap.get(event.target.value)
                  setPurchaseOrderForm((current) => ({
                    ...current,
                    quoteId: event.target.value,
                    supplierId: nextQuote?.supplierId || current.supplierId,
                    categoryId: nextQuote?.categoryId || current.categoryId,
                    title: nextQuote?.title || current.title,
                    amountExVat: nextQuote?.amountExVat || current.amountExVat,
                    vatRate: nextQuote?.vatRate ?? current.vatRate,
                    vatIncluded: nextQuote?.vatIncluded ?? current.vatIncluded,
                  }))
                }}
                className="h-10 border border-border/70 bg-background px-3 text-sm"
                disabled={isSaving}
              >
                <option value="">No linked quote</option>
                {procurementFile.quotes.map((quote) => (
                  <option key={quote.id} value={quote.id}>
                    {quote.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Supplier</label>
              <select
                value={purchaseOrderForm.supplierId}
                onChange={(event) =>
                  setPurchaseOrderForm((current) => ({
                    ...current,
                    supplierId: event.target.value,
                  }))
                }
                className="h-10 border border-border/70 bg-background px-3 text-sm"
                disabled={isSaving}
              >
                <option value="">Choose supplier</option>
                {procurementFile.suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Category</label>
              <select
                value={purchaseOrderForm.categoryId || ""}
                onChange={(event) =>
                  setPurchaseOrderForm((current) => ({
                    ...current,
                    categoryId: event.target.value,
                  }))
                }
                className="h-10 border border-border/70 bg-background px-3 text-sm"
                disabled={isSaving}
              >
                <option value="">Unassigned</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2 xl:col-span-3">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={purchaseOrderForm.title}
                onChange={(event) =>
                  setPurchaseOrderForm((current) => ({ ...current, title: event.target.value }))
                }
                disabled={isSaving}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Amount ex VAT</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={numberInputValue(purchaseOrderForm.amountExVat)}
                onChange={(event) =>
                  setPurchaseOrderForm((current) => ({
                    ...current,
                    amountExVat: Number(event.target.value || 0),
                  }))
                }
                disabled={isSaving}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">VAT rate</label>
              <select
                value={String(purchaseOrderForm.vatRate ?? 0.2)}
                onChange={(event) =>
                  setPurchaseOrderForm((current) => ({
                    ...current,
                    vatRate: Number(event.target.value),
                  }))
                }
                className="h-10 border border-border/70 bg-background px-3 text-sm"
                disabled={isSaving}
              >
                <option value="0">0%</option>
                <option value="0.05">5%</option>
                <option value="0.2">20%</option>
              </select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Issued date</label>
              <Input
                type="date"
                value={purchaseOrderForm.issuedDate || ""}
                onChange={(event) =>
                  setPurchaseOrderForm((current) => ({
                    ...current,
                    issuedDate: event.target.value,
                  }))
                }
                disabled={isSaving}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Status</label>
              <select
                value={purchaseOrderForm.status}
                onChange={(event) =>
                  setPurchaseOrderForm((current) => ({ ...current, status: event.target.value }))
                }
                className="h-10 border border-border/70 bg-background px-3 text-sm"
                disabled={isSaving}
              >
                <option value="issued">Issued</option>
                <option value="approved">Approved</option>
                <option value="planned">Planned</option>
              </select>
            </div>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Notes</label>
            <Textarea
              value={purchaseOrderForm.notes || ""}
              onChange={(event) =>
                setPurchaseOrderForm((current) => ({ ...current, notes: event.target.value }))
              }
              disabled={isSaving}
              className="min-h-24"
            />
          </div>

          <div className="space-y-3 border border-border/70 bg-card px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Stage payments</p>
                <p className="text-sm text-muted-foreground">
                  Define fixed amounts or percentages against the order value.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={addStagePayment} disabled={isSaving}>
                <Plus className="size-4" />
                Add stage
              </Button>
            </div>

            {(purchaseOrderForm.stagePayments || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No stages yet.</p>
            ) : (
              <div className="space-y-4">
                {(purchaseOrderForm.stagePayments || []).map((stagePayment, index) => (
                  <div key={stagePayment.stagePaymentId || index} className="border border-border/70 p-4">
                    <div className="grid gap-4 xl:grid-cols-6">
                      <div className="grid gap-2 xl:col-span-2">
                        <label className="text-sm font-medium">Title</label>
                        <Input
                          value={stagePayment.title}
                          onChange={(event) =>
                            updateStagePayment(index, { title: event.target.value })
                          }
                          disabled={isSaving}
                        />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-sm font-medium">Type</label>
                        <select
                          value={stagePayment.type}
                          onChange={(event) =>
                            updateStagePayment(index, {
                              type: event.target.value as SaveStagePaymentInput["type"],
                            })
                          }
                          className="h-10 border border-border/70 bg-background px-3 text-sm"
                          disabled={isSaving}
                        >
                          <option value="fixed">Fixed</option>
                          <option value="percent">Percent</option>
                        </select>
                      </div>
                      <div className="grid gap-2">
                        <label className="text-sm font-medium">
                          {stagePayment.type === "percent" ? "Percent" : "Amount"}
                        </label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={numberInputValue(stagePayment.value)}
                          onChange={(event) =>
                            updateStagePayment(index, {
                              value: Number(event.target.value || 0),
                            })
                          }
                          disabled={isSaving}
                        />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-sm font-medium">Due date</label>
                        <Input
                          type="date"
                          value={stagePayment.dueDate || ""}
                          onChange={(event) =>
                            updateStagePayment(index, { dueDate: event.target.value })
                          }
                          disabled={isSaving}
                        />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-sm font-medium">Milestone</label>
                        <select
                          value={stagePayment.milestoneId || ""}
                          onChange={(event) =>
                            updateStagePayment(index, { milestoneId: event.target.value })
                          }
                          className="h-10 border border-border/70 bg-background px-3 text-sm"
                          disabled={isSaving}
                        >
                          <option value="">No milestone link</option>
                          {milestones.map((milestone) => (
                            <option key={milestone.id} value={milestone.id}>
                              {milestone.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2">
                      <label className="text-sm font-medium">Notes</label>
                      <Textarea
                        value={stagePayment.notes || ""}
                        onChange={(event) =>
                          updateStagePayment(index, { notes: event.target.value })
                        }
                        disabled={isSaving}
                        className="min-h-20"
                      />
                    </div>
                    <div className="mt-4 flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => removeStagePayment(index)}
                        disabled={isSaving}
                      >
                        <Trash2 className="size-4" />
                        Remove stage
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="justify-between sm:justify-between">
          <div>
            {purchaseOrderForm.purchaseOrderId ? (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void deleteEntity("purchaseOrder", purchaseOrderForm.purchaseOrderId)
                }
                disabled={isSaving || isDeleting}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={resetDialogs} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void saveEntity("purchaseOrder", purchaseOrderForm)}
              disabled={
                isSaving ||
                !purchaseOrderForm.title.trim() ||
                !purchaseOrderForm.supplierId
              }
            >
              {isSaving
                ? "Saving..."
                : purchaseOrderForm.purchaseOrderId
                  ? "Save purchase order"
                  : "Create purchase order"}
            </Button>
          </div>
        </DialogFooter>
      </>
    )
  }

  function renderInvoiceDialog() {
    const selectedStagePayments = selectedInvoicePurchaseOrder?.stagePayments || []

    return (
      <>
        <DialogHeader>
          <DialogTitle>{invoiceForm.invoiceId ? "Edit invoice" : "Add invoice"}</DialogTitle>
          <DialogDescription>
            Link invoices back to a purchase order and, where relevant, to a stage payment call.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="grid gap-2 xl:col-span-2">
            <label className="text-sm font-medium">Purchase order</label>
            <select
              value={invoiceForm.purchaseOrderId}
              onChange={(event) => {
                const nextPurchaseOrder = purchaseOrderMap.get(event.target.value)
                setInvoiceForm((current) => ({
                  ...current,
                  purchaseOrderId: event.target.value,
                  supplierId: nextPurchaseOrder?.supplierId || "",
                  stagePaymentId: "",
                  vatRate: nextPurchaseOrder?.vatRate ?? current.vatRate,
                }))
              }}
              className="h-10 border border-border/70 bg-background px-3 text-sm"
              disabled={isSaving}
            >
              <option value="">Choose purchase order</option>
              {procurementFile.purchaseOrders.map((purchaseOrder) => (
                <option key={purchaseOrder.id} value={purchaseOrder.id}>
                  {purchaseOrder.title}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Stage payment</label>
            <select
              value={invoiceForm.stagePaymentId || ""}
              onChange={(event) =>
                setInvoiceForm((current) => ({ ...current, stagePaymentId: event.target.value }))
              }
              className="h-10 border border-border/70 bg-background px-3 text-sm"
              disabled={isSaving || !selectedInvoicePurchaseOrder}
            >
              <option value="">No stage link</option>
              {selectedStagePayments.map((stagePayment) => (
                <option key={stagePayment.id} value={stagePayment.id}>
                  {stagePayment.title}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Invoice number</label>
            <Input
              value={invoiceForm.number || ""}
              onChange={(event) =>
                setInvoiceForm((current) => ({ ...current, number: event.target.value }))
              }
              disabled={isSaving}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Amount ex VAT</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={numberInputValue(invoiceForm.amountExVat)}
              onChange={(event) =>
                setInvoiceForm((current) => ({
                  ...current,
                  amountExVat: Number(event.target.value || 0),
                }))
              }
              disabled={isSaving}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">VAT rate</label>
            <select
              value={String(invoiceForm.vatRate ?? 0.2)}
              onChange={(event) =>
                setInvoiceForm((current) => ({
                  ...current,
                  vatRate: Number(event.target.value),
                }))
              }
              className="h-10 border border-border/70 bg-background px-3 text-sm"
              disabled={isSaving}
            >
              <option value="0">0%</option>
              <option value="0.05">5%</option>
              <option value="0.2">20%</option>
            </select>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Issue date</label>
            <Input
              type="date"
              value={invoiceForm.issueDate || ""}
              onChange={(event) =>
                setInvoiceForm((current) => ({ ...current, issueDate: event.target.value }))
              }
              disabled={isSaving}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Due date</label>
            <Input
              type="date"
              value={invoiceForm.dueDate || ""}
              onChange={(event) =>
                setInvoiceForm((current) => ({ ...current, dueDate: event.target.value }))
              }
              disabled={isSaving}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Status</label>
            <select
              value={invoiceForm.status}
              onChange={(event) =>
                setInvoiceForm((current) => ({ ...current, status: event.target.value }))
              }
              className="h-10 border border-border/70 bg-background px-3 text-sm"
              disabled={isSaving}
            >
              <option value="received">Received</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">Notes</label>
          <Textarea
            value={invoiceForm.notes || ""}
            onChange={(event) =>
              setInvoiceForm((current) => ({ ...current, notes: event.target.value }))
            }
            disabled={isSaving}
            className="min-h-24"
          />
        </div>

        <DialogFooter className="justify-between sm:justify-between">
          <div>
            {invoiceForm.invoiceId ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void deleteEntity("invoice", invoiceForm.invoiceId)}
                disabled={isSaving || isDeleting}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={resetDialogs} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void saveEntity("invoice", invoiceForm)}
              disabled={isSaving || !invoiceForm.purchaseOrderId}
            >
              {isSaving ? "Saving..." : invoiceForm.invoiceId ? "Save invoice" : "Create invoice"}
            </Button>
          </div>
        </DialogFooter>
      </>
    )
  }

  function renderPaymentDialog() {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{paymentForm.paymentId ? "Edit payment" : "Add payment"}</DialogTitle>
          <DialogDescription>
            Record each payment against an invoice and optionally allocate it to a funding source.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="grid gap-2 xl:col-span-2">
            <label className="text-sm font-medium">Invoice</label>
            <select
              value={paymentForm.invoiceId}
              onChange={(event) =>
                setPaymentForm((current) => ({ ...current, invoiceId: event.target.value }))
              }
              className="h-10 border border-border/70 bg-background px-3 text-sm"
              disabled={isSaving}
            >
              <option value="">Choose invoice</option>
              {procurementFile.invoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {(invoice.number || invoice.id) +
                    " · " +
                    (purchaseOrderMap.get(invoice.purchaseOrderId)?.title || "Unknown PO")}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Paid date</label>
            <Input
              type="date"
              value={paymentForm.paidDate}
              onChange={(event) =>
                setPaymentForm((current) => ({ ...current, paidDate: event.target.value }))
              }
              disabled={isSaving}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Amount ex VAT</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={numberInputValue(paymentForm.amountExVat)}
              onChange={(event) =>
                setPaymentForm((current) => ({
                  ...current,
                  amountExVat: Number(event.target.value || 0),
                }))
              }
              disabled={isSaving}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Funding source</label>
            <select
              value={paymentForm.fundingSourceId || ""}
              onChange={(event) =>
                setPaymentForm((current) => ({
                  ...current,
                  fundingSourceId: event.target.value,
                  fundingAccountId: "",
                }))
              }
              className="h-10 border border-border/70 bg-background px-3 text-sm"
              disabled={isSaving}
            >
              <option value="">Unassigned</option>
              {fundingSources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Savings pot</label>
            <select
              value={paymentForm.fundingAccountId || ""}
              onChange={(event) =>
                setPaymentForm((current) => ({
                  ...current,
                  fundingAccountId: event.target.value,
                }))
              }
              className="h-10 border border-border/70 bg-background px-3 text-sm"
              disabled={isSaving || !selectedFundingSource}
            >
              <option value="">Unassigned</option>
              {(selectedFundingSource?.accounts || []).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Reference</label>
            <Input
              value={paymentForm.reference || ""}
              onChange={(event) =>
                setPaymentForm((current) => ({ ...current, reference: event.target.value }))
              }
              disabled={isSaving}
            />
          </div>
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">Notes</label>
          <Textarea
            value={paymentForm.notes || ""}
            onChange={(event) =>
              setPaymentForm((current) => ({ ...current, notes: event.target.value }))
            }
            disabled={isSaving}
            className="min-h-24"
          />
        </div>

        <DialogFooter className="justify-between sm:justify-between">
          <div>
            {paymentForm.paymentId ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void deleteEntity("payment", paymentForm.paymentId)}
                disabled={isSaving || isDeleting}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={resetDialogs} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void saveEntity("payment", paymentForm)}
              disabled={isSaving || !paymentForm.invoiceId || !paymentForm.paidDate}
            >
              {isSaving ? "Saving..." : paymentForm.paymentId ? "Save payment" : "Create payment"}
            </Button>
          </div>
        </DialogFooter>
      </>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard label="Suppliers" value={String(totals.supplierCount)} />
        <MetricCard label="Quotes" value={String(totals.quoteCount)} />
        <MetricCard label="POs" value={String(totals.purchaseOrderCount)} />
        <MetricCard label="Invoices" value={String(totals.invoiceCount)} />
        <MetricCard label="Paid" value={formatCurrency(totals.paymentTotalExVat)} />
      </div>

      <Card className="border-border/70 py-0">
        <CardHeader className="px-5 pt-5">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-2xl font-medium tracking-tight">Supplier directory</CardTitle>
            {canEdit ? (
              <Button type="button" onClick={openCreateSupplierDialog}>
                <Plus className="size-4" />
                Add supplier
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Trade</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {procurementFile.suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No suppliers yet.
                  </TableCell>
                </TableRow>
              ) : (
                procurementFile.suppliers.map((supplier) => (
                  <TableRow
                    key={supplier.id}
                    className={cn(canEdit ? "cursor-pointer" : "")}
                    onClick={canEdit ? () => openEditSupplierDialog(supplier) : undefined}
                  >
                    <TableCell className="font-medium">{supplier.name}</TableCell>
                    <TableCell>{supplier.trade || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {[supplier.email, supplier.phone].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {supplier.notes || "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="border-border/70 py-0 xl:col-span-3">
          <CardHeader className="px-5 pt-5">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-2xl font-medium tracking-tight">Quotes</CardTitle>
              {canEdit ? (
                <Button type="button" onClick={openCreateQuoteDialog}>
                  <Plus className="size-4" />
                  Add quote
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quote</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {procurementFile.quotes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No quotes yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  procurementFile.quotes.map((quote) => (
                    <TableRow
                      key={quote.id}
                      className={cn(canEdit ? "cursor-pointer" : "")}
                      onClick={canEdit ? () => openEditQuoteDialog(quote) : undefined}
                    >
                      <TableCell className="font-medium">{quote.title}</TableCell>
                      <TableCell>{supplierMap.get(quote.supplierId)?.name || "Unknown supplier"}</TableCell>
                      <TableCell>
                        {categories.find((category) => category.id === quote.categoryId)?.name ||
                          "Unassigned"}
                      </TableCell>
                      <TableCell>{formatCurrency(quote.amountExVat)}</TableCell>
                      <TableCell>{quote.expiryDate ? formatDate(quote.expiryDate) : "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={quote.status} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-border/70 py-0 xl:col-span-2">
          <CardHeader className="px-5 pt-5">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-2xl font-medium tracking-tight">
                Purchase orders
              </CardTitle>
              {canEdit ? (
                <Button type="button" onClick={openCreatePurchaseOrderDialog}>
                  <Plus className="size-4" />
                  Add PO
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Quote</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Stages</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {procurementFile.purchaseOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No purchase orders yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  procurementFile.purchaseOrders.map((purchaseOrder) => (
                    <TableRow
                      key={purchaseOrder.id}
                      className={cn(canEdit ? "cursor-pointer" : "")}
                      onClick={canEdit ? () => openEditPurchaseOrderDialog(purchaseOrder) : undefined}
                    >
                      <TableCell className="font-medium">{purchaseOrder.title}</TableCell>
                      <TableCell>
                        {supplierMap.get(purchaseOrder.supplierId)?.name || "Unknown supplier"}
                      </TableCell>
                      <TableCell>{quoteMap.get(purchaseOrder.quoteId || "")?.title || "—"}</TableCell>
                      <TableCell>{formatCurrency(purchaseOrder.amountExVat)}</TableCell>
                      <TableCell>{purchaseOrder.stagePayments?.length || 0}</TableCell>
                      <TableCell>
                        <StatusBadge status={purchaseOrder.status} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-border/70 py-0">
          <CardHeader className="px-5 pt-5">
            <CardTitle className="text-2xl font-medium tracking-tight">Stage payments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5">
            {stagePayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add stage definitions to a PO to start tracking upcoming calls.
              </p>
            ) : (
              stagePayments.map((stagePayment) => (
                <div key={stagePayment.id} className="border border-border/70 p-4">
                  <p className="text-sm font-medium text-foreground">{stagePayment.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {stagePayment.purchaseOrderTitle} · {stagePayment.supplierName}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {stagePayment.dueDate ? formatDate(stagePayment.dueDate) : "No date"} ·{" "}
                    {stagePayment.type === "percent"
                      ? `${stagePayment.value}%`
                      : formatCurrency(stagePayment.value)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-border/70 py-0">
          <CardHeader className="px-5 pt-5">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-2xl font-medium tracking-tight">Invoices</CardTitle>
              {canEdit ? (
                <Button type="button" onClick={openCreateInvoiceDialog}>
                  <Plus className="size-4" />
                  Add invoice
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>PO</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {procurementFile.invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      No invoices yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  procurementFile.invoices.map((invoice) => (
                    <TableRow
                      key={invoice.id}
                      className={cn(canEdit ? "cursor-pointer" : "")}
                      onClick={canEdit ? () => openEditInvoiceDialog(invoice) : undefined}
                    >
                      <TableCell className="font-medium">{invoice.number || invoice.id}</TableCell>
                      <TableCell>
                        {purchaseOrderMap.get(invoice.purchaseOrderId)?.title || "Unknown PO"}
                      </TableCell>
                      <TableCell>{invoice.dueDate ? formatDate(invoice.dueDate) : "—"}</TableCell>
                      <TableCell>{formatCurrency(invoice.amountExVat)}</TableCell>
                      <TableCell>
                        <StatusBadge status={invoice.status} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-border/70 py-0">
          <CardHeader className="px-5 pt-5">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-2xl font-medium tracking-tight">Payments</CardTitle>
              {canEdit ? (
                <Button type="button" onClick={openCreatePaymentDialog}>
                  <Plus className="size-4" />
                  Add payment
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Funding</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentsFile.payments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      No payments yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  paymentsFile.payments.map((payment) => {
                    const invoice = invoiceMap.get(payment.invoiceId)
                    const fundingSourceName = fundingSources.find(
                      (source) => source.id === payment.fundingSourceId,
                    )?.name
                    const fundingAccountName = fundingSources
                      .flatMap((source) => source.accounts)
                      .find((account) => account.id === payment.fundingAccountId)?.name

                    return (
                      <TableRow
                        key={payment.id}
                        className={cn(canEdit ? "cursor-pointer" : "")}
                        onClick={canEdit ? () => openEditPaymentDialog(payment) : undefined}
                      >
                        <TableCell className="font-medium">
                          {invoice?.number || payment.invoiceId}
                        </TableCell>
                        <TableCell>{formatDate(payment.paidDate)}</TableCell>
                        <TableCell>{formatCurrency(payment.amountExVat)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {[fundingSourceName, fundingAccountName].filter(Boolean).join(" · ") || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {payment.reference || "—"}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogType !== null} onOpenChange={(open) => (!open ? resetDialogs() : null)}>
        <DialogContent className="w-[calc(100vw-80px)] max-w-[1400px] max-h-[calc(100vh-80px)] overflow-y-auto border-border/70 sm:max-w-[1400px]">
          <div className="space-y-6">
            {dialogType === "supplier" ? renderSupplierDialog() : null}
            {dialogType === "quote" ? renderQuoteDialog() : null}
            {dialogType === "purchaseOrder" ? renderPurchaseOrderDialog() : null}
            {dialogType === "invoice" ? renderInvoiceDialog() : null}
            {dialogType === "payment" ? renderPaymentDialog() : null}
            {error ? <p className="text-sm text-[color:var(--accent)]">{error}</p> : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
