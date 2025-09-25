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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  ClipboardList,
  MoreVertical,
  Play,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/shared/lib/utils";

export const OrdersTableView = ({
  orders,
  loading,
  error,
  hasFilters,
  clearFilters,
  fetchOrders,
  onCardClick,
  onResumeOrder,
  onVoidOrder,
  getStatusConfig,
  getPaymentStatusConfig,
  isAuthenticated,
  isOwner,
}) => {
  if (loading) {
    return (
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-8 w-8" /></TableCell>
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
          <Button onClick={() => fetchOrders()} variant="outline">
            Try Again
          </Button>
        </div>
      </Card>
    );
  }

  if (orders.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="space-y-4">
          <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto" />
          <div>
            <h3 className="font-medium text-foreground mb-2">No orders found</h3>
            <p className="text-sm text-muted-foreground">
              {hasFilters
                ? "Try adjusting your search or filter criteria"
                : "Orders will appear here once customers start placing them"
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
            <TableHead>Order</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="w-[80px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => {
            const statusConfig = getStatusConfig(order.status);
            const paymentConfig = getPaymentStatusConfig(order.payment_status);
            const canResume = order.status === "HOLD" || order.status === "PENDING";
            const canVoid = isOwner && (order.status === "PENDING" || order.status === "HOLD");

            return (
              <TableRow
                key={order.id}
                className="cursor-pointer hover:bg-muted/40"
                onClick={() => onCardClick(order)}
              >
                <TableCell className="font-medium">
                  <div className="space-y-1">
                    <div className="font-mono text-sm">#{order.order_number}</div>
                    <Badge variant="outline" className="text-xs">
                      {order.order_type}
                    </Badge>
                  </div>
                </TableCell>

                <TableCell>
                  <div className="space-y-1">
                    <div className="font-medium">
                      {order.customer_display_name || "Guest Customer"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {order.item_count} {order.item_count === 1 ? 'item' : 'items'}
                    </div>
                  </div>
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

                <TableCell>
                  <Badge
                    variant={paymentConfig.variant}
                    className="text-xs"
                  >
                    {paymentConfig.label}
                  </Badge>
                </TableCell>

                <TableCell className="text-right font-bold">
                  {formatCurrency(order.total_collected || order.total_with_tip)}
                </TableCell>

                <TableCell className="text-muted-foreground">
                  {format(new Date(order.created_at), "MMM d, h:mm a")}
                </TableCell>

                <TableCell>
                  {isAuthenticated && (canResume || canVoid) && (
                    <div className="flex items-center gap-1">
                      {canResume && (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onResumeOrder(order.id);
                          }}
                          className="h-8 w-8 p-0"
                        >
                          <Play className="h-3 w-3" />
                        </Button>
                      )}

                      {(canResume || canVoid) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[120px]">
                            {canVoid && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onVoidOrder(order.id);
                                }}
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Void Order
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
};