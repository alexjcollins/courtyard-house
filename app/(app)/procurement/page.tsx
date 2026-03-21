import { StatusBadge } from "@/components/status-badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermission } from "@/lib/auth"
import { getProjectData } from "@/lib/data"
import { formatCurrency, formatDate } from "@/lib/format"

export default async function ProcurementPage() {
  await requirePermission("procurement:view")
  const data = await getProjectData()

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Procurement
        </p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight">
          Quotes, POs, invoices, and staged payments
        </h1>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Suppliers", data.procurementFile.suppliers.length],
          ["Quotes", data.procurementFile.quotes.length],
          ["POs", data.procurementFile.purchaseOrders.length],
          ["Invoices", data.procurementFile.invoices.length],
        ].map(([label, value]) => (
          <Card key={label} className="border-border/70 py-0">
            <CardHeader className="px-5 pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {label}
              </p>
              <CardTitle className="mt-2 text-3xl font-medium tracking-tight">
                {value}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card className="border-border/70 py-0">
        <CardHeader className="px-5 pt-5">
          <CardTitle className="text-2xl font-medium tracking-tight">
            Supplier directory
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Trade</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.procurementFile.suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    No suppliers yet. Use the admin update box to seed procurement quickly.
                  </TableCell>
                </TableRow>
              ) : (
                data.procurementFile.suppliers.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell className="font-medium">{supplier.name}</TableCell>
                    <TableCell>{supplier.trade || "TBC"}</TableCell>
                    <TableCell>{supplier.notes || "—"}</TableCell>
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
            <CardTitle className="text-2xl font-medium tracking-tight">
              Quotes
            </CardTitle>
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
                {data.procurementFile.quotes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No quotes yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.procurementFile.quotes.map((quote) => (
                    <TableRow key={quote.id}>
                      <TableCell className="font-medium">{quote.title}</TableCell>
                      <TableCell>
                        {data.procurementFile.suppliers.find((supplier) => supplier.id === quote.supplierId)?.name || "Unknown supplier"}
                      </TableCell>
                      <TableCell>
                        {data.categories.find((category) => category.id === quote.categoryId)?.name || "Unassigned"}
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
            <CardTitle className="text-2xl font-medium tracking-tight">
              Purchase orders
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Stages</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.procurementFile.purchaseOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      No purchase orders yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.procurementFile.purchaseOrders.map((purchaseOrder) => (
                    <TableRow key={purchaseOrder.id}>
                      <TableCell className="font-medium">{purchaseOrder.title}</TableCell>
                      <TableCell>
                        {data.procurementFile.suppliers.find((supplier) => supplier.id === purchaseOrder.supplierId)?.name || "Unknown supplier"}
                      </TableCell>
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
            <CardTitle className="text-2xl font-medium tracking-tight">
              Stage payments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5">
            {data.dashboard.upcomingPayments60.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add stage definitions to a PO to start tracking upcoming calls.
              </p>
            ) : (
              data.dashboard.upcomingPayments60.map((payment) => (
                <div
                  key={payment.id}
                  className="border border-border/70 bg-secondary/30 p-4"
                >
                  <p className="text-sm font-medium text-foreground">{payment.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {payment.supplierName} · {formatDate(payment.dueDate)}
                  </p>
                  <p className="mt-3 text-sm font-medium text-foreground">
                    {formatCurrency(payment.amountExVat)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 py-0">
        <CardHeader className="px-5 pt-5">
          <CardTitle className="text-2xl font-medium tracking-tight">
            Invoices
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>PO</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.procurementFile.invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No invoices yet.
                  </TableCell>
                </TableRow>
              ) : (
                data.procurementFile.invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.number || invoice.id}</TableCell>
                    <TableCell>
                      {data.procurementFile.purchaseOrders.find((purchaseOrder) => purchaseOrder.id === invoice.purchaseOrderId)?.title || "Unknown PO"}
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
    </div>
  )
}
