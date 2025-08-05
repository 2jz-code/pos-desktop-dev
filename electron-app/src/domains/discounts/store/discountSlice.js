import * as discountService from "@/domains/discounts/services/discountService";

export const createDiscountSlice = (set, get) => ({
	discounts: [],
	isLoading: false,
	error: null,
	isDiscountDialogOpen: false, // <-- ADDED: State to manage dialog visibility

	setIsDiscountDialogOpen: (isOpen) => set({ isDiscountDialogOpen: isOpen }),

	fetchDiscounts: async (params) => {
		set({ isLoading: true, error: null });
		try {
			const response = await discountService.getDiscounts(params);
			set({ discounts: response.data.results, isLoading: false });
		} catch (error) {
			console.error("Failed to fetch discounts:", error);
			set({ isLoading: false, error });
		}
	},
	createDiscount: async (data) => {
		try {
			await discountService.createDiscount(data);
			get().fetchDiscounts();
		} catch (error) {
			console.error("Failed to create discount:", error);
			// Optionally, set an error state
		}
	},
	updateDiscount: async (id, data) => {
		try {
			await discountService.updateDiscount(id, data);
			get().fetchDiscounts();
		} catch (error) {
			console.error("Failed to update discount:", error);
		}
	},
	deleteDiscount: async (id) => {
		try {
			await discountService.deleteDiscount(id);
			get().fetchDiscounts();
		} catch (error) {
			console.error("Failed to delete discount:", error);
		}
	},
});
