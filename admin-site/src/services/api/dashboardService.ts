import apiClient from "./client";
import { getAllOrders } from "./orderService";
import inventoryService from "./inventoryService";
import reportsService from "./reportsService";

export interface DashboardMetrics {
	todaySales: {
		value: string;
		comparison: string;
		trend: "up" | "down" | "neutral";
		trendValue: string;
	};
	ordersCount: {
		value: string;
		subtitle: string;
		comparison: string;
		trend: "up" | "down" | "neutral";
		trendValue: string;
	};
	topProduct: {
		value: string;
		subtitle: string;
		comparison: string;
	};
	lowStockCount: {
		value: string;
		subtitle: string;
	};
}

export interface ActivityItem {
	id: string;
	type: "order" | "product" | "inventory" | "user";
	message: string;
	timestamp: string;
	icon: string;
	linkTo?: string;
}

class DashboardService {
	/**
	 * Get dashboard metrics for today
	 * @param locationId - Optional store location ID to filter metrics by location
	 */
	async getDashboardMetrics(locationId?: number): Promise<DashboardMetrics> {
		try {
			const today = new Date();
			const yesterday = new Date(today);
			yesterday.setDate(yesterday.getDate() - 1);

			// Use the same date formatting as reports service
			// Start of today at 00:00:00
			const todayStart = reportsService.formatDateForApi(today);
			// End of today at 23:59:59 for real-time data
			const formatEndOfDay = (date: Date): string => {
				const year = date.getFullYear();
				const month = String(date.getMonth() + 1).padStart(2, "0");
				const day = String(date.getDate()).padStart(2, "0");
				return `${year}-${month}-${day}T23:59:59`;
			};
			const todayEnd = formatEndOfDay(today);

			// Yesterday uses standard formatting (full day)
			const yesterdayStart = reportsService.formatDateForApi(yesterday);
			const yesterdayEnd = reportsService.formatEndDateForApi(yesterday);

			if (!todayStart || !todayEnd || !yesterdayStart || !yesterdayEnd) {
				throw new Error("Invalid date range");
			}

			console.log("Dashboard fetching reports for:", {
				today: { start: todayStart, end: todayEnd },
				yesterday: { start: yesterdayStart, end: yesterdayEnd },
				locationId,
			});

			// Build filters with optional location_id
			const filters = locationId ? { location_id: locationId } : {};

			// Fetch today's sales report and products report in parallel
			const [todaySalesData, yesterdaySalesData, todayProductsData] = await Promise.all([
				reportsService.generateSalesReport(todayStart, todayEnd, "day", filters),
				reportsService.generateSalesReport(yesterdayStart, yesterdayEnd, "day", filters),
				reportsService.generateProductsReport(todayStart, todayEnd, filters),
			]);

			// Extract metrics from sales reports (use net_revenue instead of total_revenue)
			const todaySalesTotal = (todaySalesData as any).net_revenue || 0;
			const yesterdaySalesTotal = (yesterdaySalesData as any).net_revenue || 0;
			const todayOrderCount = (todaySalesData as any).total_orders || 0;
			const yesterdayOrderCount = (yesterdaySalesData as any).total_orders || 0;

			const salesDiff = todaySalesTotal - yesterdaySalesTotal;
			const salesPercentChange =
				yesterdaySalesTotal > 0
					? ((salesDiff / yesterdaySalesTotal) * 100).toFixed(0)
					: "0";

			const orderDiff = todayOrderCount - yesterdayOrderCount;
			const orderPercentChange =
				yesterdayOrderCount > 0
					? ((orderDiff / yesterdayOrderCount) * 100).toFixed(0)
					: "0";

			// Get top product from today's products report
			console.log("Products report data:", todayProductsData);
			const topProduct =
				(todayProductsData as any).top_products &&
				(todayProductsData as any).top_products.length > 0
					? (todayProductsData as any).top_products[0]
					: null;
			console.log("Top product:", topProduct);

			// Get low stock count (filtered by store location from middleware)
			const lowStockItems = await inventoryService.getAllStock({
				is_low_stock: true,
			});
			const lowStockCount = Array.isArray(lowStockItems)
				? lowStockItems.length
				: lowStockItems.results?.length || 0;

			// Get completed/pending counts from today's data
			const completedCount = todaySalesData.total_orders || 0;
			const pendingCount = 0; // Sales report only shows completed orders

			return {
				todaySales: {
					value: `$${todaySalesTotal.toFixed(2)}`,
					comparison: `vs $${yesterdaySalesTotal.toFixed(2)} yesterday`,
					trend:
						salesDiff > 0 ? "up" : salesDiff < 0 ? "down" : "neutral",
					trendValue: `${salesDiff >= 0 ? "+" : ""}${salesPercentChange}%`,
				},
				ordersCount: {
					value: todayOrderCount.toString(),
					subtitle: `${completedCount} completed${pendingCount > 0 ? `, ${pendingCount} pending` : ""}`,
					comparison: `vs ${yesterdayOrderCount} yesterday`,
					trend:
						orderDiff > 0 ? "up" : orderDiff < 0 ? "down" : "neutral",
					trendValue: `${orderDiff >= 0 ? "+" : ""}${orderPercentChange}%`,
				},
				topProduct: {
					value: topProduct?.name || "N/A",
					subtitle:
						topProduct && (topProduct.sold || topProduct.sold === 0)
							? `${topProduct.sold} sold today`
							: "No sales today",
					comparison:
						topProduct && (topProduct.revenue || topProduct.revenue === 0)
							? `Revenue: $${topProduct.revenue.toFixed(2)}`
							: "",
				},
				lowStockCount: {
					value: lowStockCount.toString(),
					subtitle:
						lowStockCount === 1 ? "Item needs restock" : "Items need restock",
				},
			};
		} catch (error) {
			console.error("Failed to fetch dashboard metrics:", error);
			throw error;
		}
	}

	/**
	 * Get recent activity feed
	 */
	async getRecentActivity(tenantSlug?: string): Promise<ActivityItem[]> {
		try {
			// Fetch recent orders
			const recentOrders = await getAllOrders({
				ordering: "-created_at",
				page_size: 10,
			});

			const orders = Array.isArray(recentOrders)
				? recentOrders
				: recentOrders.results || [];

			const activities: ActivityItem[] = [];

			// Convert orders to activity items
			orders.slice(0, 5).forEach((order: any) => {
				const timeAgo = this.getTimeAgo(new Date(order.created_at));
				const ordersPath = tenantSlug ? `/${tenantSlug}/orders` : '/orders';
				activities.push({
					id: `order-${order.id}`,
					type: "order",
					message: `${order.status === "completed" ? "Order completed" : "New order"} #${order.order_number}`,
					timestamp: timeAgo,
					icon: "ShoppingCart",
					linkTo: `${ordersPath}?highlight=${order.order_number}`,
				});
			});

			return activities;
		} catch (error) {
			console.error("Failed to fetch recent activity:", error);
			return [];
		}
	}

	/**
	 * Helper to format time ago
	 */
	private getTimeAgo(date: Date): string {
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return "Just now";
		if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
		if (diffHours < 24)
			return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
		return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
	}
}

const dashboardService = new DashboardService();
export default dashboardService;