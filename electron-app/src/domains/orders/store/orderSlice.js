import * as orderService from "@/domains/orders/services/orderService";

export const createOrderSlice = (set) => ({
	orders: [],
	selectedOrder: null,

	fetchOrders: async () => {
		try {
			const response = await orderService.getOrders();
			set({ orders: response.data || [] });
		} catch (error) {
			console.error("Failed to fetch orders:", error);
		}
	},

	fetchOrderById: async (orderId) => {
		try {
			const response = await orderService.getOrderById(orderId);
			set({ selectedOrder: response.data });
			return response.data;
		} catch (error) {
			console.error(`Failed to fetch order ${orderId}:`, error);
			set({ selectedOrder: null });
		}
	},

	updateSingleOrder: (updatedOrder) => {
		set((state) => ({
			orders: state.orders.map((o) =>
				o.id === updatedOrder.id ? updatedOrder : o
			),
			selectedOrder:
				state.selectedOrder?.id === updatedOrder.id
					? updatedOrder
					: state.selectedOrder,
		}));
	},
});
