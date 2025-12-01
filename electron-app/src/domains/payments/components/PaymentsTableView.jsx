import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { CreditCard, CloudOff } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@ajeen/ui";

export const PaymentsTableView = ({
  payments,
  loading,
  error,
  hasFilters,
  clearFilters,
  fetchPayments,
  onCardClick,
  getPaymentStatusConfig,
  getPaymentMethod,
  isOnline = true,
}) => {
  if (loading) {
    return (
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Payment</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-8 text-center">
        <div className="space-y-4">
          <p className="text-destructive">{error}</p>
          <Button onClick={() => fetchPayments()} variant="outline">
            Try Again
          </Button>
        </div>
      </Card>
    );
  }

  if (payments.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="space-y-4">
          <CreditCard className="h-12 w-12 text-muted-foreground mx-auto" />
          <div>
            <h3 className="font-medium text-foreground mb-2">No payments found</h3>
            <p className="text-sm text-muted-foreground">
              {hasFilters
                ? "Try adjusting your search or filter criteria"
                : "Payments will appear here once transactions are processed"
              }
            </p>
          </div>
          {hasFilters && (
            <Button variant="outline" onClick={clearFilters}>
              Clear Filters
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Payment</TableHead>
            <TableHead>Order</TableHead>
            <TableHead>Method</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((payment) => {
            const statusConfig = getPaymentStatusConfig(payment.status);

            return (
              <TableRow
                key={payment.id}
                className="cursor-pointer hover:bg-muted/40"
                onClick={() => onCardClick(payment)}
              >
                <TableCell className="font-medium">
                  <div className="space-y-1">
                    <div className="font-mono text-sm">#{payment.payment_number}</div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        {payment.transaction_count || 0} transaction{payment.transaction_count === 1 ? '' : 's'}
                      </span>
                      {payment.is_offline && (
                        <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800 border-amber-200">
                          <CloudOff className="h-3 w-3 mr-1" />
                          {payment.sync_status === 'SYNCED' ? 'Synced' : 'Pending'}
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>

                <TableCell>
                  <div className="space-y-1">
                    <div className="font-medium">
                      {payment.order_number ? `#${payment.order_number}` : "N/A"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {payment.order_number ? "Order Payment" : "Standalone"}
                    </div>
                  </div>
                </TableCell>

                <TableCell>
                  <Badge
                    variant="outline"
                    className="text-xs"
                  >
                    {payment.primary_method || "N/A"}
                  </Badge>
                </TableCell>

                <TableCell>
                  <Badge
                    variant={statusConfig.variant}
                    className="font-medium"
                  >
                    <statusConfig.icon className="h-3 w-3 mr-1" />
                    {statusConfig.label}
                  </Badge>
                </TableCell>

                <TableCell className="text-right font-bold">
                  {formatCurrency(payment.total_collected)}
                </TableCell>

                <TableCell className="text-muted-foreground">
                  {format(new Date(payment.created_at), "MMM d, h:mm a")}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
};