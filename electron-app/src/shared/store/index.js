// Central Store Configuration
// This file composes all domain slices into a single store for global state access

import { configureStore, combineReducers } from "@reduxjs/toolkit";

// Import domain slices
import { cartSlice, posStore, terminalStore } from "@/domains/pos";
import { productSlice } from "@/domains/products";
import { orderSlice } from "@/domains/orders";
import { paymentSlice } from "@/domains/payments";
import { inventorySlice } from "@/domains/inventory";
import { userSlice } from "@/domains/users";
import { settingsSlice } from "@/domains/settings";
import { discountSlice } from "@/domains/discounts";

// Create the root reducer combining all domain slices
const rootReducer = combineReducers({
	// POS Domain State
	cart: cartSlice.reducer,
	// Note: posStore and terminalStore might be Zustand stores, handle separately if needed

	// Product Domain State
	products: productSlice.reducer,

	// Orders Domain State
	orders: orderSlice.reducer,

	// Payments Domain State
	payments: paymentSlice.reducer,

	// Inventory Domain State
	inventory: inventorySlice.reducer,

	// Users Domain State
	users: userSlice.reducer,

	// Settings Domain State
	settings: settingsSlice.reducer,

	// Discounts Domain State
	discounts: discountSlice.reducer,
});

// Configure the store
export const store = configureStore({
	reducer: rootReducer,
	middleware: (getDefaultMiddleware) =>
		getDefaultMiddleware({
			serializableCheck: {
				// Ignore these action types
				ignoredActions: [
					"persist/PERSIST",
					"persist/REHYDRATE",
					"persist/PAUSE",
					"persist/PURGE",
					"persist/REGISTER",
				],
			},
		}),
});

// Export types for TypeScript (future use)
// export type RootState = ReturnType<typeof store.getState>
// export type AppDispatch = typeof store.dispatch

// Export individual slices for direct access if needed
export {
	cartSlice,
	productSlice,
	orderSlice,
	paymentSlice,
	inventorySlice,
	userSlice,
	settingsSlice,
	discountSlice,
};

// Export Zustand stores separately (if they remain Zustand-based)
export { posStore, terminalStore };
