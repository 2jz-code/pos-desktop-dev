// desktop-combined/electron-app/src/store/posStore.js
import { createWithEqualityFn } from "zustand/traditional";
import { persist } from "zustand/middleware";
import { shallow } from "zustand/shallow";

import {
	createCartSlice,
	createOrderSlice,
	createProductSlice,
	createUserSlice,
	createDiscountSlice,
	createPaymentSlice,
} from "./slices";
import { cartSocket } from "../lib/cartSocket";

export const usePosStore = createWithEqualityFn(
	persist(
		(set, get) => ({
			...createCartSlice(set, get),
			...createOrderSlice(set, get),
			...createProductSlice(set, get),
			...createUserSlice(set, get),
			...createDiscountSlice(set, get),
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

			// --- THIS IS THE FIX ---
			// Add this function to ensure non-persisted state (like your machine options)
			// is correctly merged with the state restored from storage.
			merge: (persistedState, currentState) => {
				return { ...currentState, ...persistedState };
			},
			// --- END OF FIX ---
		}
	),
	shallow
);

cartSocket.init(usePosStore);
