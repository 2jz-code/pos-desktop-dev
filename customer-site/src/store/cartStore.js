import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// Default cart state - keep it minimal
const defaultCartState = {
	// Local state only
	isLoading: false,
	checkoutCompleted: false,
	error: null,
	// All cart data comes from server queries, not stored here
};

export const useCartStore = create(
	persist(
		(set, get) => ({
			...defaultCartState,

			// Actions that don't need optimistic updates
			setLoading: (loading) => set({ isLoading: loading }),
			setError: (error) => set({ error }),
			setCheckoutCompleted: (completed) => {
				console.log(`Setting checkout completed: ${completed}`);
				set({ checkoutCompleted: completed });
			},

			// Reset state
			resetCart: () => set({ ...defaultCartState }),

			// Utility to check if checkout was recently completed
			isCheckoutRecentlyCompleted: () => {
				const state = get();
				return state.checkoutCompleted === true;
			},

			// Force reset checkout state (useful for debugging or manual reset)
			forceResetCheckoutState: () => {
				console.log("Force resetting checkout state");
				set({ checkoutCompleted: false, error: null });
			},
		}),
		{
			name: "cart-storage",
			storage: createJSONStorage(() => localStorage),
			// Only persist simple state, not cart data
			partialize: (state) => ({
				checkoutCompleted: state.checkoutCompleted,
			}),
		}
	)
);
