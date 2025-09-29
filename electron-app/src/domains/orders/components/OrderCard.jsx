import { Badge } from "@/shared/components/ui/badge";
import { Card } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Package,
  Calendar,
  MoreVertical,
  Play,
  XCircle,
  User,
} from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@ajeen/ui";

export const OrderCard = ({
  order,
  onCardClick,
  onResumeOrder,
  onVoidOrder,
  getStatusConfig,
  getPaymentStatusConfig,
  showActions = true,
  isOwner = false,
}) => {
  const statusConfig = getStatusConfig(order.status);
  const paymentConfig = getPaymentStatusConfig(order.payment_status);

  const handleCardClick = (e) => {
    // Don't trigger card click if clicking on actions
    if (e.target.closest('[data-action-area]')) {
      return;
    }
    onCardClick(order);
  };

  const canResume = order.status === "HOLD" || order.status === "PENDING";
  const canVoid = isOwner && (order.status === "PENDING" || order.status === "HOLD");

  return (
    <Card
      className="p-4 hover:bg-muted/40 cursor-pointer transition-all duration-200 hover:shadow-sm"
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: Order Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <Badge
              variant={statusConfig.variant}
              className="shrink-0 font-medium"
            >
              <statusConfig.icon className="h-3 w-3 mr-1" />
              {statusConfig.label}
            </Badge>
            <span className="font-mono text-sm text-muted-foreground">
              #{order.order_number}
            </span>
            <Badge variant="outline" className="text-xs">
              {order.order_type}
            </Badge>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <User className="h-3 w-3 text-muted-foreground shrink-0" />
              <p className="font-medium text-foreground truncate">
                {order.customer_display_name || "Guest Customer"}
              </p>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1 shrink-0">
                <Package className="h-3 w-3" />
                {order.item_count} {order.item_count === 1 ? 'item' : 'items'}
              </span>
              <span className="flex items-center gap-1 shrink-0">
                <Calendar className="h-3 w-3" />
                {format(new Date(order.created_at), "MMM d, h:mm a")}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Amount & Actions */}
        <div className="flex flex-col items-end gap-3 shrink-0">
          <div className="text-right">
            <div className="text-lg font-bold text-foreground">
              {formatCurrency(order.total_collected || order.total_with_tip)}
            </div>
            <Badge
              variant={paymentConfig.variant}
              className="text-xs mt-1"
            >
              {paymentConfig.label}
            </Badge>
          </div>

          {/* Actions */}
          {showActions && (canResume || canVoid) && (
            <div data-action-area className="flex gap-2">
              {canResume && (
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onResumeOrder(order.id);
                  }}
                  className="min-h-[36px] px-3"
                >
                  <Play className="h-3 w-3 mr-1" />
                  Resume
                </Button>
              )}

              {(canResume || canVoid) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-[36px] px-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[120px]">
                    {canVoid && (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive min-h-[40px]"
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
        </div>
      </div>
    </Card>
  );
};