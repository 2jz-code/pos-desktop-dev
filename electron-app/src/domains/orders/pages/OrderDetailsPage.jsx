import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { usePosStore } from "@/domains/pos/store/posStore";
import * as orderService from "@/domains/orders/services/orderService";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/shared/components/ui/hover-card";
import { toast } from "@/shared/components/ui/use-toast";
import FullScreenLoader from "@/shared/components/common/FullScreenLoader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { formatCurrency, formatPhoneNumber } from "@ajeen/ui";
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
  CloudOff,
} from "lucide-react";
import { useRolePermissions } from "@/shared/hooks/useRolePermissions";
import { useOnlineStatus } from "@/shared/hooks";
import { useMutation } from "@tanstack/react-query";
import { useSettingsStore } from "@/domains/settings/store/settingsStore";
import { openCashDrawer } from "@/shared/lib/hardware";
import { isDeliveryPlatform } from "@/domains/pos/constants/deliveryPlatforms";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { ItemCard } from "../components/ItemCard";
import OrderApprovalDialog from "../components/OrderApprovalDialog";

// Compact Transaction Detail Component
const TransactionDetail = ({ transaction }) => {
  const method = transaction.method?.replace("_", " ") || "N/A";
  const isCredit = method.toLowerCase() === "credit";

  return (
    <div className="flex items-center justify-between py-3 px-4 bg-muted/20 rounded-lg border border-border/40">
      <div className="flex items-center gap-3">
        <div className="flex size-8 items-center justify-center bg-primary/15 text-primary rounded-lg">
          {isCredit ? (
            <CreditCard className="h-4 w-4" />
          ) : (
            <DollarSign className="h-4 w-4" />
          )}
        </div>
        <div>
          <div className="font-medium capitalize text-sm text-foreground">
            {method}
          </div>
          {isCredit && transaction.metadata?.card_brand && (
            <div className="text-xs text-muted-foreground">
              {transaction.metadata.card_brand} ****{transaction.metadata.card_last4}
            </div>
          )}
        </div>
      </div>
      <div className="font-bold text-foreground">
        {formatCurrency(
          Number.parseFloat(transaction.amount) +
            Number.parseFloat(transaction.surcharge || 0)
        )}
      </div>
    </div>
  );
};

// Compact Customer Information Component
const CustomerInfo = ({ customer_display_name, customer_email, customer_phone }) => {
  if (!customer_display_name || customer_display_name === "Guest Customer") {
    return (
      <Card className="p-4 border border-border/60 bg-muted/10">
        <div className="flex items-center justify-center gap-3 text-muted-foreground">
          <User className="h-5 w-5" />
          <span className="font-medium">Guest Customer</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 border border-border/60 bg-card/80 space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex size-8 items-center justify-center bg-primary/15 text-primary rounded-lg">
          <User className="h-4 w-4" />
        </div>
        <span className="text-foreground font-semibold">{customer_display_name}</span>
      </div>

      {customer_email && (
        <div className="flex items-center gap-3 pl-11">
          <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
          <a
            href={`mailto:${customer_email}`}
            className="text-primary hover:underline break-all text-sm"
          >
            {customer_email}
          </a>
        </div>
      )}

      {customer_phone && (
        <div className="flex items-center gap-3 pl-11">
          <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
          <a
            href={`tel:${customer_phone}`}
            className="text-primary hover:underline text-sm"
          >
            {formatPhoneNumber(customer_phone)}
          </a>
        </div>
      )}
    </Card>
  );
};

// Compact Order Summary Component
const OrderSummary = ({ order }) => {
  // Find order-level one-off discounts (no specific order_item)
  const orderLevelDiscounts = (order.adjustments || []).filter(
    (adj) => adj.adjustment_type === "ONE_OFF_DISCOUNT" && !adj.order_item
  );

  // Check for ORDER-LEVEL exemptions only (item-level exemptions are already reflected in tax_total)
  const taxExemption = (order.adjustments || []).find((adj) => adj.adjustment_type === "TAX_EXEMPT" && !adj.order_item);
  const feeExemption = (order.adjustments || []).find((adj) => adj.adjustment_type === "FEE_EXEMPT" && !adj.order_item);

  return (
    <Card className="p-5 border border-border/60 bg-card/80">
      <div className="space-y-4">
        {/* Main Total */}
        <div className="text-center py-3 bg-primary/5 rounded-lg border border-primary/20">
          <div className="text-2xl font-bold text-primary mb-1">
            {formatCurrency(order.total_collected || 0)}
          </div>
          <div className="text-sm text-muted-foreground">
            {order.items.length} {order.items.length === 1 ? 'item' : 'items'} • Total
          </div>
        </div>

        {/* Breakdown */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="text-foreground font-medium">{formatCurrency(order.subtotal)}</span>
          </div>

          {/* Order-Level One-Off Discounts */}
          {orderLevelDiscounts.map((discount) => {
            let discountLabel = "One-Off Discount";
            if (discount.discount_type === "PERCENTAGE") {
              discountLabel = `${discount.discount_value}% Discount`;
            } else if (discount.discount_value) {
              discountLabel = `${formatCurrency(discount.discount_value)} Discount`;
            }
            return (
              <div key={discount.id} className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm">{discountLabel}</span>
                  <HoverCard>
                    <HoverCardTrigger asChild>
                      <Badge
                        variant="outline"
                        className="text-xs px-1.5 py-0 border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 cursor-help"
                      >
                        {discount.discount_type === "PERCENTAGE" ? `${discount.discount_value}%` : formatCurrency(discount.discount_value)}
                      </Badge>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80" side="top">
                      <div className="space-y-2">
                        <div className="text-sm">
                          <span className="font-semibold">Reason:</span>
                          <p className="text-muted-foreground mt-1">{discount.reason}</p>
                        </div>
                        {discount.approved_by_name && (
                          <div className="text-xs text-muted-foreground border-t pt-2">
                            Approved by {discount.approved_by_name}
                          </div>
                        )}
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                </div>
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  -{formatCurrency(Math.abs(parseFloat(discount.amount || 0)))}
                </span>
              </div>
            );
          })}

          {/* Applied code-based discounts */}
          {order.total_discounts_amount > 0 && order.applied_discounts?.length > 0 && (
            <>
              {order.applied_discounts.map((orderDiscount) => (
                <div key={orderDiscount.id} className="flex justify-between">
                  <span className="text-muted-foreground">{orderDiscount.discount?.name || "Discount"}</span>
                  <span className="text-destructive font-medium">-{formatCurrency(orderDiscount.amount)}</span>
                </div>
              ))}
            </>
          )}

          {/* Show either Tax OR Tax Exemption */}
          {taxExemption ? (
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Tax Exemption</span>
                {taxExemption.reason && (
                  <HoverCard>
                    <HoverCardTrigger asChild>
                      <Badge
                        variant="outline"
                        className="text-xs px-1.5 py-0 border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 cursor-help"
                      >
                        Info
                      </Badge>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80" side="top">
                      <div className="space-y-2">
                        <div className="text-sm">
                          <span className="font-semibold">Reason:</span>
                          <p className="text-muted-foreground mt-1">{taxExemption.reason}</p>
                        </div>
                        {taxExemption.approved_by_name && (
                          <div className="text-xs text-muted-foreground border-t pt-2">
                            Approved by {taxExemption.approved_by_name}
                          </div>
                        )}
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                )}
              </div>
              <span className="text-orange-600 dark:text-orange-400 font-medium">Applied</span>
            </div>
          ) : (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="text-foreground font-medium">{formatCurrency(order.tax_total)}</span>
            </div>
          )}

          {/* Show surcharges if any */}
          {order.total_surcharges > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Surcharges</span>
              <span className="text-foreground font-medium">{formatCurrency(order.total_surcharges)}</span>
            </div>
          )}

          {/* Show fee exemption if applied */}
          {feeExemption && (
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Fee Exemption</span>
                {feeExemption.reason && (
                  <HoverCard>
                    <HoverCardTrigger asChild>
                      <Badge
                        variant="outline"
                        className="text-xs px-1.5 py-0 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 cursor-help"
                      >
                        Info
                      </Badge>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80" side="top">
                      <div className="space-y-2">
                        <div className="text-sm">
                          <span className="font-semibold">Reason:</span>
                          <p className="text-muted-foreground mt-1">{feeExemption.reason}</p>
                        </div>
                        {feeExemption.approved_by_name && (
                          <div className="text-xs text-muted-foreground border-t pt-2">
                            Approved by {feeExemption.approved_by_name}
                          </div>
                        )}
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                )}
              </div>
              <span className="text-blue-600 dark:text-blue-400 font-medium">Applied</span>
            </div>
          )}

          {order.total_tips > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tips</span>
              <span className="text-foreground font-medium">{formatCurrency(order.total_tips)}</span>
            </div>
          )}
        </div>

        {/* Quick Info */}
        <div className="pt-3 border-t border-border/40 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Type</span>
            <Badge variant="outline" className="text-xs font-medium">{order.order_type}</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cashier</span>
            <span className="text-foreground font-medium">{order.cashier?.username || "N/A"}</span>
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
  const isOnline = useOnlineStatus();
  const [isPrinting, setIsPrinting] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [approvalRequest, setApprovalRequest] = useState(null);

  const [offlineOrder, setOfflineOrder] = useState(null);
  const [offlineLoading, setOfflineLoading] = useState(false);
  // Track if we're viewing a local offline order (by local_id, not server_id)
  const [isLocalOrder, setIsLocalOrder] = useState(false);

  const onlineOrder = usePosStore((state) => state.selectedOrder);
  const fetchOrderById = usePosStore((state) => state.fetchOrderById);
  const updateSingleOrder = usePosStore((state) => state.updateSingleOrder);
  const resumeCart = usePosStore((state) => state.resumeCart);
  const onlineLoading = usePosStore((state) => !state.selectedOrder);

  // Use offline order if we're viewing a local order, otherwise use online order when connected
  const order = isLocalOrder ? offlineOrder : (isOnline ? onlineOrder : offlineOrder);
  const isLoading = isLocalOrder ? offlineLoading : (isOnline ? onlineLoading : offlineLoading);

  const getLocalReceiptPrinter = useSettingsStore(
    (state) => state.getLocalReceiptPrinter
  );
  const settings = useSettingsStore((state) => state.settings);
  const printers = useSettingsStore((state) => state.printers);
  const receiptPrinterId = useSettingsStore((state) => state.receiptPrinterId);

  // Fetch offline order from local DB
  const fetchOfflineOrder = async (localOrderId) => {
    if (!window.offlineAPI?.getOfflineOrder) return;

    setOfflineLoading(true);
    try {
      const orderData = await window.offlineAPI.getOfflineOrder(localOrderId);
      if (orderData) {
        const payload = orderData.payload || {};

        // Get cached products to enrich item data
        let productsMap = {};
        try {
          const cachedProducts = await window.offlineAPI?.getCachedProducts?.() || [];
          productsMap = cachedProducts.reduce((acc, p) => {
            acc[p.id] = p;
            return acc;
          }, {});
        } catch (e) {
          console.warn('Could not load cached products for order display:', e);
        }

        // Get cached users to get cashier info
        let cashierInfo = null;
        if (payload.cashier_id) {
          try {
            const cachedUsers = await window.offlineAPI?.getCachedUsers?.() || [];
            cashierInfo = cachedUsers.find(u => u.id === payload.cashier_id);
          } catch (e) {
            console.warn('Could not load cached users for cashier info:', e);
          }
        }

        // Transform items with product info
        const transformedItems = (payload.items || []).map(item => {
          const product = productsMap[item.product_id];
          return {
            id: item.product_id,
            product_id: item.product_id,
            product: product || { id: item.product_id, name: 'Product' },
            product_name: product?.name || 'Product',
            quantity: item.quantity,
            price_at_sale: item.price_at_sale,
            notes: item.notes,
            modifiers: item.selected_modifiers || [],
            refunded_quantity: 0,
          };
        });

        // Calculate totals from payload
        const tipAmount = payload.payment?.tip || 0;
        const totalAmount = parseFloat(payload.total || 0);
        const paymentAmount = parseFloat(payload.payment?.amount || totalAmount);

        // Transform to match expected format
        const transformed = {
          id: orderData.local_id,
          local_id: orderData.local_id,
          server_order_id: orderData.server_order_id,
          order_number: orderData.server_order_number || `OFF-${orderData.local_id.slice(0, 6).toUpperCase()}`,
          status: orderData.status === 'SYNCED' ? 'COMPLETED' : 'COMPLETED', // Offline orders are completed at checkout
          sync_status: orderData.status,
          payment_status: 'PAID',
          order_type: payload.order_type || 'POS',
          dining_preference: payload.dining_preference || 'TAKE_OUT',
          created_at: payload.created_offline_at || orderData.created_at,
          // Totals
          subtotal: parseFloat(payload.subtotal || 0),
          total_tax: parseFloat(payload.tax_amount || 0),
          tax_total: parseFloat(payload.tax_amount || 0), // OrderSummary uses tax_total
          total: totalAmount,
          total_tips: tipAmount,
          total_with_tip: totalAmount + tipAmount,
          total_collected: paymentAmount + tipAmount,
          total_discounts: parseFloat(payload.total_discounts || 0),
          total_adjustments: parseFloat(payload.total_adjustments || 0),
          // Items
          items: transformedItems,
          item_count: transformedItems.length,
          // Customer info
          guest_first_name: payload.guest_first_name,
          customer_display_name: payload.guest_first_name || 'Guest Customer',
          // Cashier info
          cashier: cashierInfo ? {
            id: cashierInfo.id,
            username: cashierInfo.username || cashierInfo.first_name || 'Staff',
            first_name: cashierInfo.first_name,
            last_name: cashierInfo.last_name,
          } : null,
          // Payment info
          payment: {
            status: 'PAID',
            total_collected: paymentAmount + tipAmount,
            transactions: [{
              method: payload.payment?.method || 'CASH',
              amount: paymentAmount,
              tip: tipAmount,
              status: 'SUCCESSFUL',
            }],
          },
          // Discounts and adjustments
          discounts: payload.discounts || [],
          adjustments: payload.adjustments || [],
          // Offline flags
          is_offline: true,
          offline_status: orderData.status,
        };
        setOfflineOrder(transformed);
      }
    } catch (err) {
      console.error('Error fetching offline order:', err);
    } finally {
      setOfflineLoading(false);
    }
  };

  useEffect(() => {
    if (!orderId) return;

    const loadOrder = async () => {
      // First, check if this orderId exists in local offline orders
      // This handles the case where we navigated here from the offline orders list
      if (window.offlineAPI?.getOfflineOrder) {
        try {
          const localOrder = await window.offlineAPI.getOfflineOrder(orderId);
          if (localOrder) {
            // This is a local offline order - always load from local DB
            setIsLocalOrder(true);
            await fetchOfflineOrder(orderId);
            return;
          }
        } catch (e) {
          // Not a local order, continue to check online
        }
      }

      // Not a local order - fetch from backend if online
      setIsLocalOrder(false);
      if (isOnline) {
        fetchOrderById(orderId);
      }
    };

    loadOrder();
  }, [orderId, fetchOrderById, isOnline]);

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

  const handleVoid = async () => {
    try {
      const response = await orderService.voidOrder(orderId);

      // Check if approval is required (202 status)
      if (response.status === 202) {
        const data = response.data;
        setApprovalRequest({
          approvalRequestId: data.approval_request_id,
          message: data.message,
          actionType: "ORDER_VOID",
          orderNumber: data.order_number,
          orderTotal: data.order_total,
        });
        setApprovalDialogOpen(true);
        return;
      }

      // Order voided successfully without approval
      toast({
        title: "Success",
        description: "Order has been voided successfully.",
      });

      // Refresh the order
      await fetchOrderById(orderId);
    } catch (err) {
      const description =
        err?.response?.data?.error || "An unknown error occurred.";
      toast({
        title: "Operation Failed",
        description,
        variant: "destructive",
      });
      console.error(`Failed to void order ${orderId}:`, err);
    }
  };

  const handleApprovalSuccess = async ({ approved }) => {
    setApprovalDialogOpen(false);
    setApprovalRequest(null);

    if (approved) {
      // Open cash drawer for refund
      try {
        const receiptPrinter = printers.find(p => p.id === receiptPrinterId);
        if (receiptPrinter) {
          await openCashDrawer(receiptPrinter);
        }
      } catch (error) {
        console.error("Failed to open cash drawer:", error);
        // Don't block the success flow if cash drawer fails
      }

      toast({
        title: "Approved",
        description: "Order void approved by manager. Order has been voided.",
      });
    } else {
      toast({
        title: "Denied",
        description: "Order void request denied by manager.",
        variant: "destructive",
      });
    }

    // Refresh the order
    await fetchOrderById(orderId);
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
  // Can void any order except already voided or cancelled
  const canVoid = !["VOID", "CANCELLED"].includes(status);

  return (
    <div className="flex flex-col h-full">
      {/* Enhanced Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="p-3 md:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
              {/* Local offline order (pending sync or viewing locally) */}
              {order.is_offline && (
                <Badge variant="secondary" className="px-3 py-1 bg-amber-100 text-amber-800 border-amber-200">
                  <CloudOff className="h-3 w-3 mr-1" />
                  {order.sync_status === 'SYNCED' ? 'Synced' : 'Pending Sync'}
                </Badge>
              )}
              {/* Synced order that was originally created offline */}
              {!order.is_offline && order.is_offline_order && (
                <Badge variant="secondary" className="px-3 py-1 bg-slate-100 text-slate-600 border-slate-200">
                  <CloudOff className="h-3 w-3 mr-1" />
                  Offline Origin
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 min-h-0 p-3 md:p-4 lg:p-6">
        <ScrollArea className="h-full">
          <div className="w-full pb-6">
            {/* Multi-Column Layout on Desktop */}
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 lg:gap-6">
              {/* Left Column - Order Items (Takes more space on larger screens) */}
              <div className="xl:col-span-3 space-y-8">
                {/* Order Items Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3 border-b border-border/60 pb-2.5 mb-4">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <Package className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">Order Items</h2>
                      <p className="text-xs text-muted-foreground">
                        {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
                      </p>
                    </div>
                  </div>
                  {/* Grid layout for items on larger screens for better space usage */}
                  <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3">
                    {order.items.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        adjustments={order.adjustments || []}
                        compact={order.items.length > 2}
                      />
                    ))}
                  </div>
                </div>

                {/* Payment Details Section - Large Desktop Only */}
                <div className="hidden xl:block space-y-4">
                  <div className="flex items-center gap-3 border-b border-border/60 pb-2.5 mb-4">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <CreditCard className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">Payment Details</h2>
                      <p className="text-xs text-muted-foreground">Transaction information</p>
                    </div>
                  </div>
                  {order.payment_details &&
                  order.payment_details.transactions?.filter(
                    (txn) => !["FAILED", "CANCELED"].includes(txn.status)
                  ).length > 0 ? (
                    <div className="space-y-4">
                      {permissions.canAccessPayments() && (
                        <Card className="p-4 bg-primary/5 border-primary/20">
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
                          .filter((txn) => !["FAILED", "CANCELED"].includes(txn.status))
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
                </div>
              </div>

              {/* Right Column - Order Summary & Customer Info (Takes 1/4 on XL screens) */}
              <div className="space-y-6">
                {/* Order Summary */}
                <OrderSummary order={order} />

                {/* Customer Information */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3 border-b border-border/60 pb-2.5 mb-4">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <User className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">Customer</h2>
                      <p className="text-xs text-muted-foreground">Contact information</p>
                    </div>
                  </div>
                  <CustomerInfo
                    customer_display_name={order.customer_display_name}
                    customer_email={order.customer_email}
                    customer_phone={order.customer_phone}
                  />
                </div>

                {/* Payment Details Section - Mobile & Tablet */}
                <div className="xl:hidden space-y-4">
                  <div className="flex items-center gap-3 border-b border-border/60 pb-2.5 mb-4">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <CreditCard className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">Payment Details</h2>
                      <p className="text-xs text-muted-foreground">Transaction information</p>
                    </div>
                  </div>
                  {order.payment_details &&
                  order.payment_details.transactions?.filter(
                    (txn) => !["FAILED", "CANCELED"].includes(txn.status)
                  ).length > 0 ? (
                    <div className="space-y-4">
                      {permissions.canAccessPayments() && (
                        <Card className="p-4 bg-primary/5 border-primary/20">
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
                          .filter((txn) => !["FAILED", "CANCELED"].includes(txn.status))
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
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Sticky Action Bar */}
      <div className="border-t bg-card p-3 md:p-4 lg:p-6">
        <div className="w-full max-w-none">
          <div className="flex flex-col sm:flex-row gap-3 justify-end">
            {/* Primary Actions */}
            {canResume && (
              <Button
                size="lg"
                className={`min-h-[48px] px-6 ${!isOnline ? 'opacity-50' : ''}`}
                onClick={() => isOnline && handleResume()}
                disabled={!isOnline}
              >
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
              {(canCancel || canVoid) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="lg" className="min-h-[48px] px-3">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {canVoid && (
                      <DropdownMenuItem
                        className={`h-12 px-4 ${isOnline ? 'text-destructive focus:text-destructive' : 'opacity-50'}`}
                        disabled={!isOnline}
                        onClick={() => isOnline && handleVoid()}
                      >
                        <XCircle className="mr-3 h-4 w-4" />
                        Void Order
                      </DropdownMenuItem>
                    )}
                    {canCancel && (
                      <DropdownMenuItem
                        className={`h-12 px-4 ${isOnline ? 'text-destructive focus:text-destructive' : 'opacity-50'}`}
                        disabled={!isOnline}
                        onClick={() =>
                          isOnline && handleStatusChange(
                            orderService.cancelOrder,
                            "Order has been cancelled."
                          )
                        }
                      >
                        <XCircle className="mr-3 h-4 w-4" />
                        Cancel Order
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Manager Approval Dialog */}
      <OrderApprovalDialog
        open={approvalDialogOpen}
        onClose={() => setApprovalDialogOpen(false)}
        approvalRequest={approvalRequest}
        onSuccess={handleApprovalSuccess}
      />
    </div>
  );
};

export default OrderDetailsPage;