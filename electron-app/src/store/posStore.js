import { createWithEqualityFn } from "zustand/traditional";
import { persist } from "zustand/middleware";
import { shallow } from "zustand/shallow";

import {
	createCartSlice,
	createOrderSlice,
	createProductSlice,
	createUserSlice,
	createDiscountSlice, // Added missing import
	createPaymentSlice,
} from "./slices";
import { cartSocket } from "../lib/cartSocket";

export const usePosStore = createWithEqualityFn(
	persist(
		(set, get) => ({
			...createCartSlice(set, get),
			...createOrderSlice(set, get), // Removed duplicate call
			...createProductSlice(set, get),
			...createUserSlice(set, get),
			...createDiscountSlice(set, get), // Added required discount slice
			...createPaymentSlice(set, get),
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
