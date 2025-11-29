import * as discountService from "@/domains/discounts/services/discountService";

/**
 * Check if device is online
 */
const isOnline = () => typeof navigator !== 'undefined' ? navigator.onLine : true;

export const createDiscountSlice = (set, get) => ({
	discounts: [],
	isLoading: false,
	error: null,
	isDiscountDialogOpen: false, // <-- ADDED: State to manage dialog visibility

	setIsDiscountDialogOpen: (isOpen) => set({ isDiscountDialogOpen: isOpen }),

	fetchDiscounts: async (params) => {
		console.log("🔄 [DiscountSlice] fetchDiscounts - OFFLINE-FIRST VERSION");
		set({ isLoading: true, error: null });

		let discounts = null;
		let source = 'none';

		// Step 1: Try offline cache first
		if (window.offlineAPI?.getCachedDiscounts) {
			try {
				console.log("📦 [DiscountSlice] Trying discounts cache first...");
				const cachedDiscounts = await window.offlineAPI.getCachedDiscounts();

				if (Array.isArray(cachedDiscounts) && cachedDiscounts.length > 0) {
					discounts = cachedDiscounts;
					source = 'cache';
					console.log(`✅ [DiscountSlice] Loaded ${discounts.length} discounts from cache`);
				} else {
					console.log("⚠️ [DiscountSlice] Cache empty, will try API if online");
				}
			} catch (cacheError) {
				console.warn("⚠️ [DiscountSlice] Cache failed, falling back to API:", cacheError);
			}
		}

		// Step 2: Fall back to API if cache empty/failed AND we're online
		if (!discounts && isOnline()) {
			try {
				console.log("🌐 [DiscountSlice] Loading discounts from API...");
				const response = await discountService.getDiscounts(params);
				const apiDiscounts = response.data.results || response.data;

				if (Array.isArray(apiDiscounts)) {
					discounts = apiDiscounts;
					source = 'api';
					console.log(`✅ [DiscountSlice] Loaded ${discounts.length} discounts from API`);
				}
			} catch (apiError) {
				console.error("❌ [DiscountSlice] API request failed:", apiError);
				set({ isLoading: false, error: apiError });
				return;
			}
		}

		// Step 3: Handle no data scenario
		if (!discounts) {
			console.warn("⚠️ [DiscountSlice] No discounts available (cache empty, offline or API failed)");
			discounts = [];
		}

		console.log(`🎯 [DiscountSlice] Loaded ${discounts.length} discounts from ${source}`);
		set({ discounts, isLoading: false });
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
	archiveDiscount: async (id) => {
		try {
			await discountService.archiveDiscount(id);
			get().fetchDiscounts();
		} catch (error) {
			console.error("Failed to archive discount:", error);
			throw error;
		}
	},
	unarchiveDiscount: async (id) => {
		try {
			await discountService.unarchiveDiscount(id);
			get().fetchDiscounts();
		} catch (error) {
			console.error("Failed to unarchive discount:", error);
			throw error;
		}
	},
});
