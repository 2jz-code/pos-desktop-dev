import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAllOrders,
  resumeOrder,
  voidOrder,
} from "@/domains/orders/services/orderService";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  ClipboardList,
  Search,
  Filter,
  CheckCircle,
  Clock,
  XCircle,
  DollarSign,
  RefreshCw,
  Calendar,
  TrendingUp,
  Package,
  LayoutGrid,
  List,
} from "lucide-react";
import {
  getStatusConfig as getSharedStatusConfig,
  getPaymentStatusConfig as getSharedPaymentStatusConfig,
  useOrdersData,
  useOrderActions,
  STATUS_FILTER_PILLS,
  ORDER_TYPE_FILTER_PILLS,
  formatCurrency,
} from "@ajeen/ui";
import { createIconMapper } from "@ajeen/ui/lib/iconUtils";
import { toast } from "@/shared/components/ui/use-toast";
import { useAuth } from "@/context/AuthContext";
import { usePosStore } from "@/domains/pos/store/posStore";
import { shallow } from "zustand/shallow";
import { format } from "date-fns";
import { PageHeader } from "@/shared/components/layout/PageHeader";
import { PaginationControls } from "@/shared/components/ui/PaginationControls";
import { FilterPill } from "../components/FilterPill";
import { OrderCard } from "../components/OrderCard";
import { OrdersTableView } from "../components/OrdersTableView";

export default function OrdersPage() {
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem('ordersViewMode') || 'cards';
  });
  const navigate = useNavigate();

  const { isAuthenticated, isOwner } = useAuth();
  const { resumeCart } = usePosStore(
    (state) => ({
      resumeCart: state.resumeCart,
    }),
    shallow
  );

  // Use shared orders data hook
  const {
    orders,
    loading,
    error,
    nextUrl,
    prevUrl,
    count,
    currentPage,
    filters,
    hasFilters,
    handleNavigate,
    handleFilterChange,
    handleSearchChange,
    clearFilters,
    refetch
  } = useOrdersData({
    getAllOrdersService: getAllOrders
  });

  // Use shared order actions hook
  const { handleAction } = useOrderActions({
    toast,
    refetch
  });


  // Create icon mapper for this app
  const mapIcon = createIconMapper({
    CheckCircle,
    Clock,
    XCircle,
    DollarSign,
    RefreshCw
  });

  // Use shared status configs with icon mapping
  const getStatusConfig = (status) => {
    const config = getSharedStatusConfig(status);
    return {
      ...config,
      icon: mapIcon(config.icon)
    };
  };

  const getPaymentStatusConfig = (status) => {
    const config = getSharedPaymentStatusConfig(status);
    return {
      ...config,
      icon: mapIcon(config.icon)
    };
  };

  const handleResumeAction = async (orderId) => {
    try {
      const response = await resumeOrder(orderId);
      resumeCart(response.data);
      toast({
        title: "Success",
        description: "Order has been resumed and loaded into the cart.",
      });
      navigate("/pos");
    } catch (err) {
      const description =
        err?.response?.data?.error || "An unknown error occurred.";
      toast({
        title: "Operation Failed",
        description,
        variant: "destructive",
      });
      console.error(`Failed to resume order ${orderId}:`, err);
    }
  };

  const handleVoidAction = async (orderId) => {
    await handleAction(orderId, voidOrder, "Order has been voided successfully.");
  };

  const handleCardClick = (order) => {
    navigate(`/orders/${order.id}`);
  };

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('ordersViewMode', mode);
  };

  // Quick stats calculation
  const todayOrders = orders.filter(order =>
    format(new Date(order.created_at), "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")
  );
  const todayRevenue = todayOrders.reduce((sum, order) =>
    sum + parseFloat(order.total_collected || order.total_with_tip || 0), 0
  );

  const OrdersView = () => {
    if (viewMode === 'list') {
      return (
        <OrdersTableView
          orders={orders}
          loading={loading}
          error={error}
          hasFilters={hasFilters}
          clearFilters={clearFilters}
          fetchOrders={refetch}
          onCardClick={handleCardClick}
          onResumeOrder={handleResumeAction}
          onVoidOrder={handleVoidAction}
          getStatusConfig={getStatusConfig}
          getPaymentStatusConfig={getPaymentStatusConfig}
          isAuthenticated={isAuthenticated}
          isOwner={isOwner}
        />
      );
    }

    // Cards view
    if (loading) {
      return (
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-4 w-32" />
                  <div className="flex gap-4">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <div className="text-right space-y-2">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-4 w-12" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <Card className="p-8 text-center">
          <CardContent>
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={() => refetch()} variant="outline">
              Try Again
            </Button>
          </CardContent>
        </Card>
      );
    }

    if (orders.length === 0) {
      return (
        <Card className="p-8 text-center">
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            onCardClick={handleCardClick}
            onResumeOrder={handleResumeAction}
            onVoidOrder={handleVoidAction}
            getStatusConfig={getStatusConfig}
            getPaymentStatusConfig={getPaymentStatusConfig}
            showActions={isAuthenticated}
            isOwner={isOwner}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <PageHeader
        icon={ClipboardList}
        title="Orders"
        description="Manage and track all customer orders"
        className="shrink-0"
      />


      {/* Search and Filters */}
      <div className="border-b bg-background/95 backdrop-blur-sm p-4 space-y-4">
        {/* Controls Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant={showFilters ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="shrink-0"
            >
              <Filter className="h-3 w-3 mr-1" />
              {showFilters ? "Hide Filters" : "Show Filters"}
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              Displaying {orders.length} of {count} orders
            </span>

            {/* View Toggle */}
            <div className="flex items-center gap-1 border rounded-md p-1">
              <Button
                variant={viewMode === 'cards' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleViewModeChange('cards')}
                className="px-2 py-1 h-8"
              >
                <LayoutGrid className="h-3 w-3 mr-1" />
                Cards
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleViewModeChange('list')}
                className="px-2 py-1 h-8"
              >
                <List className="h-3 w-3 mr-1" />
                List
              </Button>
            </div>
          </div>
        </div>
        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search orders, customers, amounts..."
            className="pl-10 h-11"
            value={filters.search}
            onChange={handleSearchChange}
          />
        </div>

        {/* Filter Pills */}
        {showFilters && (
          <div className="flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row">
            <div className="flex items-center gap-2 flex-wrap">
            <FilterPill
              label="All"
              active={!hasFilters}
              onClick={clearFilters}
            />
            {STATUS_FILTER_PILLS.map((pill) => {
              const IconComponent = {
                Clock,
                CheckCircle,
                XCircle
              }[pill.iconName];

              return (
                <FilterPill
                  key={pill.key}
                  label={pill.label}
                  active={filters[pill.filterKey] === pill.filterValue}
                  onClick={() => handleFilterChange(pill.filterKey, filters[pill.filterKey] === pill.filterValue ? "ALL" : pill.filterValue)}
                  icon={IconComponent}
                />
              );
            })}
            </div>
          </div>
        )}

        {/* Extended Filters */}
        {showFilters && (
          <Card className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Order Type</label>
                <div className="flex flex-wrap gap-2">
                  {ORDER_TYPE_FILTER_PILLS.map((pill) => (
                    <FilterPill
                      key={pill.key}
                      label={pill.label}
                      active={filters[pill.filterKey] === pill.filterValue}
                      onClick={() => handleFilterChange(pill.filterKey, filters[pill.filterKey] === pill.filterValue ? "ALL" : pill.filterValue)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 p-4">
        <ScrollArea className="h-full">
          <div className="pb-6">
            <OrdersView />

            {/* Pagination */}
            {(prevUrl || nextUrl) && (
              <div className="mt-8">
                <PaginationControls
                  prevUrl={prevUrl}
                  nextUrl={nextUrl}
                  onNavigate={handleNavigate}
                  count={count}
                  currentPage={currentPage}
                  pageSize={25}
                />
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}