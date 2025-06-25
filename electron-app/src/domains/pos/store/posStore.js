import { createWithEqualityFn } from "zustand/traditional";
import { persist } from "zustand/middleware";
import { shallow } from "zustand/shallow";
import { createCartSlice } from "@/domains/pos/store/cartSlice";
import { createOrderSlice } from "@/domains/orders/store/orderSlice";
import { createProductSlice } from "@/domains/products/store/productSlice";
import { createUserSlice } from "@/domains/users/store/userSlice";
import { createDiscountSlice } from "@/domains/discounts/store/discountSlice";
import { createPaymentSlice } from "@/domains/payments/store/paymentSlice";
import { createInventorySlice } from "@/domains/inventory/store/inventorySlice";
import { cartSocket } from "@/shared/lib/cartSocket";

export const usePosStore = createWithEqualityFn(
	persist(
		(set, get) => ({
			...createCartSlice(set, get),
			...createOrderSlice(set, get), // Removed duplicate call
			...createProductSlice(set, get),
			...createUserSlice(set, get),
			...createDiscountSlice(set, get), // Added required discount slice
			...createPaymentSlice(set, get),
			...createInventorySlice(set, get),
		}),
		{
			name: "pos-storage",
			partialize: (state) => ({
				// Persist all relevant cart state
				orderId: state.orderId,
				orderStatus: state.orderStatus,
				items: state.items,
				subtotal: state.subtotal,
				total: state.total,
				taxAmount: state.taxAmount,
				surchargesAmount: state.surchargesAmount,
				totalDiscountsAmount: state.totalDiscountsAmount,
				tip: state.tip,
				appliedDiscounts: state.appliedDiscounts,
				currentUser: state.currentUser,
			}),
			merge: (persistedState, currentState) => {
				return { ...currentState, ...persistedState };
			},
		}
	),
	shallow
);

cartSocket.init(usePosStore);
