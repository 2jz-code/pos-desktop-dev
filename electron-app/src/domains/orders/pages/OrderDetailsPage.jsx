import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { usePosStore } from "@/domains/pos/store/posStore";
import * as orderService from "@/domains/orders/services/orderService";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { toast } from "@/shared/components/ui/use-toast";
import FullScreenLoader from "@/shared/components/common/FullScreenLoader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { formatCurrency } from "@/shared/lib/utils";
import {
  ArrowLeft,
  CreditCard,
  DollarSign,
  User,
  Mail,
  Phone,
  Printer,
  Send,
  Package,
  Receipt,
  Clock,
  Play,
  XCircle,
  MoreVertical,
  CheckCircle,
  RefreshCw,
} from "lucide-react";
import { useRolePermissions } from "@/shared/hooks/useRolePermissions";
import { useMutation } from "@tanstack/react-query";
import { useSettingsStore } from "@/domains/settings/store/settingsStore";
import { isDeliveryPlatform } from "@/domains/pos/constants/deliveryPlatforms";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { ItemCard } from "../components/ItemCard";

// Enhanced Transaction Detail Component
const TransactionDetail = ({ transaction }) => {
  const method = transaction.method?.replace("_", " ") || "N/A";
  const isCredit = method.toLowerCase() === "credit";

  return (
    <Card className="p-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-muted rounded-lg">
            {isCredit ? (
              <CreditCard className="h-4 w-4 text-primary" />
            ) : (
              <DollarSign className="h-4 w-4 text-primary" />
            )}
          </div>
          <div>
            <span className="font-semibold capitalize text-sm text-foreground">
              {method}
            </span>
            {isCredit && transaction.metadata?.card_brand && (
              <div className="text-xs text-muted-foreground">
                {transaction.metadata.card_brand} ****
                {transaction.metadata.card_last4}
              </div>
            )}
          </div>
        </div>
        <span className="font-semibold text-sm text-foreground">
          {formatCurrency(
            Number.parseFloat(transaction.amount) +
              Number.parseFloat(transaction.surcharge || 0)
          )}
        </span>
      </div>
    </Card>
  );
};

// Customer Information Component
const CustomerInfo = ({ customer_display_name, customer_email, customer_phone }) => {
  if (!customer_display_name || customer_display_name === "Guest Customer") {
    return (
      <Card className="p-4">
        <div className="text-center text-muted-foreground">
          <User className="h-8 w-8 mx-auto mb-2" />
          <p>Guest Customer</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <User className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-foreground font-medium">{customer_display_name}</span>
        </div>
      </Card>

      {customer_email && (
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
            <a
              href={`mailto:${customer_email}`}
              className="text-primary hover:underline break-all"
            >
              {customer_email}
            </a>
          </div>
        </Card>
      )}

      {customer_phone && (
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
            <a
              href={`tel:${customer_phone}`}
              className="text-primary hover:underline"
            >
              {customer_phone}
            </a>
          </div>
        </Card>
      )}
    </div>
  );
};

// Order Summary Component
const OrderSummary = ({ order }) => {
  return (
    <Card className="p-6">
      <div className="space-y-4">
        {/* Main Total */}
        <div className="flex justify-between items-center py-4 border-b">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            <span className="text-lg font-semibold text-foreground">Grand Total</span>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">
              {formatCurrency(order.total_collected || 0)}
            </div>
            <div className="text-sm text-muted-foreground">
              {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
            </div>
          </div>
        </div>

        {/* Breakdown */}
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="text-foreground">{formatCurrency(order.subtotal)}</span>
          </div>

          {order.total_discounts_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discounts</span>
              <span className="text-destructive">-{formatCurrency(order.total_discounts_amount)}</span>
            </div>
          )}

          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax</span>
            <span className="text-foreground">{formatCurrency(order.tax_total)}</span>
          </div>

          {order.total_surcharges > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Surcharges</span>
              <span className="text-foreground">{formatCurrency(order.total_surcharges)}</span>
            </div>
          )}

          {order.total_tips > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tips</span>
              <span className="text-foreground">{formatCurrency(order.total_tips)}</span>
            </div>
          )}
        </div>

        {/* Quick Info */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t text-sm">
          <div>
            <div className="text-muted-foreground">Order Type</div>
            <div className="font-medium text-foreground">{order.order_type}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Cashier</div>
            <div className="font-medium text-foreground">{order.cashier?.username || "N/A"}</div>
          </div>
        </div>
      </div>
    </Card>
  );
};

const OrderDetailsPage = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const permissions = useRolePermissions();
  const [isPrinting, setIsPrinting] = useState(false);

  const order = usePosStore((state) => state.selectedOrder);
  const fetchOrderById = usePosStore((state) => state.fetchOrderById);
  const updateSingleOrder = usePosStore((state) => state.updateSingleOrder);
  const resumeCart = usePosStore((state) => state.resumeCart);
  const isLoading = usePosStore((state) => !state.selectedOrder);

  const getLocalReceiptPrinter = useSettingsStore(
    (state) => state.getLocalReceiptPrinter
  );
  const settings = useSettingsStore((state) => state.settings);

  useEffect(() => {
    if (orderId) {
      fetchOrderById(orderId);
    }
  }, [orderId, fetchOrderById]);

  const getStatusConfig = (status) => {
    switch (status) {
      case "COMPLETED":
        return { variant: "default", icon: CheckCircle, label: "Completed" };
      case "PENDING":
        return { variant: "secondary", icon: Clock, label: "Pending" };
      case "HOLD":
        return { variant: "outline", icon: Clock, label: "On Hold" };
      case "CANCELLED":
      case "VOID":
        return {
          variant: "destructive",
          icon: XCircle,
          label: status === "CANCELLED" ? "Cancelled" : "Void"
        };
      default:
        return { variant: "outline", icon: Clock, label: status };
    }
  };

  const getPaymentStatusConfig = (status) => {
    switch (status) {
      case "PAID":
        return { variant: "default", icon: DollarSign, label: "Paid" };
      case "PARTIALLY_PAID":
        return { variant: "secondary", icon: DollarSign, label: "Partial" };
      case "UNPAID":
        return { variant: "destructive", icon: XCircle, label: "Unpaid" };
      case "REFUNDED":
      case "PARTIALLY_REFUNDED":
        return {
          variant: "outline",
          icon: RefreshCw,
          label: status === "REFUNDED" ? "Refunded" : "Partial Refund"
        };
      default:
        return { variant: "outline", icon: DollarSign, label: status };
    }
  };

  const handlePrintReceipt = async () => {
    const receiptPrinter = getLocalReceiptPrinter();
    if (!receiptPrinter) {
      toast({
        title: "Printer Error",
        description: "No receipt printer is configured.",
        variant: "destructive",
      });
      return;
    }

    setIsPrinting(true);
    try {
      const isTransaction = order.status !== "COMPLETED";
      await window.hardwareApi.invoke("print-receipt", {
        printer: receiptPrinter,
        data: order,
        storeSettings: settings,
        isTransaction: isTransaction,
      });
      toast({
        title: "Success",
        description: isTransaction ? "Transaction receipt sent to printer." : "Receipt sent to printer.",
      });
    } catch (error) {
      console.error("Failed to print receipt:", error);
      toast({
        title: "Print Failed",
        description: error.message || "Could not print the receipt.",
        variant: "destructive",
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleStatusChange = async (serviceFunction, successMessage) => {
    try {
      const updatedOrder = await serviceFunction(orderId);
      updateSingleOrder(updatedOrder.data);
      toast({ title: "Success", description: successMessage });
    } catch (err) {
      const description =
        err?.response?.data?.error || "An unknown error occurred.";
      toast({
        title: "Operation Failed",
        description: description,
        variant: "destructive",
      });
    }
  };

  const handleResume = async () => {
    try {
      const response = await orderService.resumeOrder(orderId);
      resumeCart(response.data);
      toast({
        title: "Success",
        description: "Order has been resumed and loaded into the cart.",
      });
      navigate("/pos");
    } catch (err) {
      console.error("Failed to resume order:", err);
      toast({
        title: "Operation Failed",
        description: "Could not resume the order.",
        variant: "destructive",
      });
    }
  };

  const resendEmailMutation = useMutation({
    mutationFn: () => orderService.resendConfirmationEmail(orderId),
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: data.data.message || "Confirmation email has been resent.",
      });
    },
    onError: (error) => {
      toast({
        title: "Operation Failed",
        description:
          error?.response?.data?.error || "Could not resend the email.",
        variant: "destructive",
      });
    },
  });

  if (isLoading && !order) return <FullScreenLoader />;

  if (!order) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="p-8 max-w-md mx-auto text-center">
          <CardContent className="space-y-4">
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <div>
              <h3 className="font-semibold text-foreground mb-2">Order Not Found</h3>
              <p className="text-sm text-muted-foreground">
                The order you're looking for doesn't exist or failed to load.
              </p>
            </div>
            <Button onClick={() => navigate("/orders")} variant="outline">
              Back to Orders
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { status, payment_status } = order;
  const statusConfig = getStatusConfig(status);
  const paymentConfig = getPaymentStatusConfig(payment_status);
  const canResume = status === "HOLD" || status === "PENDING";
  const canCancel = (status === "PENDING" || status === "HOLD") && permissions?.canCancelOrders();

  return (
    <div className="flex flex-col h-full">
      {/* Enhanced Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="p-4 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/orders")}
                className="shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-foreground truncate">
                  Order #{order.order_number}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(order.created_at), "MMMM d, yyyy 'at' h:mm a")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={statusConfig.variant} className="px-3 py-1">
                <statusConfig.icon className="h-3 w-3 mr-1" />
                {statusConfig.label}
              </Badge>
              <Badge variant={paymentConfig.variant} className="px-3 py-1">
                <paymentConfig.icon className="h-3 w-3 mr-1" />
                {paymentConfig.label}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 min-h-0 p-4 md:p-6">
        <ScrollArea className="h-full">
          <div className="max-w-4xl mx-auto space-y-6 pb-6">
            {/* Order Summary - Most Important First */}
            <OrderSummary order={order} />

            {/* Progressive Disclosure Sections */}
            <CollapsibleSection title="Order Items" icon={Package} defaultOpen>
              <div className="space-y-3">
                {order.items.map((item) => (
                  <ItemCard key={item.id} item={item} />
                ))}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Customer Information" icon={User}>
              <CustomerInfo
                customer_display_name={order.customer_display_name}
                customer_email={order.customer_email}
                customer_phone={order.customer_phone}
              />
            </CollapsibleSection>

            <CollapsibleSection title="Payment Details" icon={CreditCard}>
              {order.payment_details &&
              order.payment_details.transactions?.filter(
                (txn) => txn.status === "SUCCESSFUL"
              ).length > 0 ? (
                <div className="space-y-4">
                  {permissions.canAccessPayments() && (
                    <Card className="p-3 bg-primary/5 border-primary/20">
                      <Link
                        to={`/payments/${order.payment_details.id}`}
                        className="text-primary font-semibold hover:underline text-sm inline-flex items-center gap-2"
                      >
                        <CreditCard className="h-4 w-4" />
                        View Full Payment Record →
                      </Link>
                    </Card>
                  )}
                  <div className="space-y-3">
                    {order.payment_details.transactions
                      .filter((txn) => txn.status === "SUCCESSFUL")
                      .map((txn) => (
                        <TransactionDetail key={txn.id} transaction={txn} />
                      ))}
                  </div>
                </div>
              ) : (
                <Card className="p-6 text-center">
                  <CreditCard className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No payment details found for this order.
                  </p>
                </Card>
              )}
            </CollapsibleSection>
          </div>
        </ScrollArea>
      </div>

      {/* Sticky Action Bar */}
      <div className="border-t bg-card p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col sm:flex-row gap-3 justify-end">
            {/* Primary Actions */}
            {canResume && (
              <Button size="lg" className="min-h-[48px] px-6" onClick={handleResume}>
                <Play className="mr-2 h-4 w-4" />
                Resume Order
              </Button>
            )}

            {/* Secondary Actions */}
            <div className="flex gap-3">
              {["COMPLETED", "PENDING", "HOLD"].includes(status) &&
                (["POS", "WEB"].includes(order.order_type) || isDeliveryPlatform(order.order_type)) && (
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handlePrintReceipt}
                    disabled={isPrinting || !getLocalReceiptPrinter()}
                    className="min-h-[48px]"
                  >
                    <Printer className="mr-2 h-4 w-4" />
                    {isPrinting ? "Printing..." :
                      (status === "COMPLETED" ? "Print Receipt" : "Print Transaction")}
                  </Button>
                )}

              {status === "COMPLETED" && permissions?.canCancelOrders() && (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => resendEmailMutation.mutate()}
                  disabled={resendEmailMutation.isPending}
                  className="min-h-[48px]"
                >
                  <Send className="mr-2 h-4 w-4" />
                  {resendEmailMutation.isPending ? "Sending..." : "Resend Email"}
                </Button>
              )}

              {/* More Actions Menu */}
              {canCancel && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="lg" className="min-h-[48px] px-3">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      className="h-12 px-4 text-destructive focus:text-destructive"
                      onClick={() =>
                        handleStatusChange(
                          orderService.cancelOrder,
                          "Order has been cancelled."
                        )
                      }
                    >
                      <XCircle className="mr-3 h-4 w-4" />
                      Cancel Order
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderDetailsPage;