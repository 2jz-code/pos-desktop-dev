import inventoryService from "@/domains/inventory/services/inventoryService";
import { toast } from "@/shared/components/ui/use-toast";

export const createInventorySlice = (set, get) => ({
	// === STATE ===
	dashboardData: null,
	stockData: [],
	locations: [],
	recipes: [],
	isLoading: false,
	error: null,

	// === DIALOG STATES ===
	isStockAdjustmentDialogOpen: false,
	isLocationDialogOpen: false,
	isStockTransferDialogOpen: false,
	isRecipeDialogOpen: false,

	// Current editing data
	currentEditingProduct: null,
	currentEditingLocation: null,
	currentLocationMode: "create", // 'create' or 'edit'

	// === DIALOG ACTIONS ===
	setStockAdjustmentDialog: (isOpen, product = null) => {
		set({
			isStockAdjustmentDialogOpen: isOpen,
			currentEditingProduct: product,
		});
	},

	setLocationDialog: (isOpen, location = null, mode = "create") => {
		set({
			isLocationDialogOpen: isOpen,
			currentEditingLocation: location,
			currentLocationMode: mode,
		});
	},

	setStockTransferDialog: (isOpen, product = null) => {
		set({
			isStockTransferDialogOpen: isOpen,
			currentEditingProduct: product,
		});
	},

	setRecipeDialog: (isOpen) => {
		set({ isRecipeDialogOpen: isOpen });
	},

	// === DATA FETCHING ACTIONS ===
	fetchDashboardData: async () => {
		set({ isLoading: true, error: null });
		try {
			const dashboard = await inventoryService.getDashboardData();
			set({ dashboardData: dashboard, isLoading: false });
		} catch (error) {
			console.error("Failed to fetch dashboard data:", error);
			set({
				isLoading: false,
				error: "Failed to load dashboard data: " + error.message,
			});
		}
	},

	fetchStockData: async () => {
		try {
			const stock = await inventoryService.getAllStock();
			set({ stockData: stock });
		} catch (error) {
			console.error("Failed to fetch stock data:", error);
			set({ error: "Failed to load stock data: " + error.message });
		}
	},

	fetchLocations: async () => {
		try {
			const locations = await inventoryService.getLocations();
			set({ locations });
		} catch (error) {
			console.error("Failed to fetch locations:", error);
			set({ error: "Failed to load locations: " + error.message });
		}
	},

	fetchRecipes: async () => {
		try {
			const recipes = await inventoryService.getRecipes();
			set({ recipes });
		} catch (error) {
			console.error("Failed to fetch recipes:", error);
			set({ error: "Failed to load recipes: " + error.message });
		}
	},

	// Load all inventory data
	loadInventoryData: async () => {
		set({ isLoading: true, error: null });
		try {
			const [dashboard, stock, locations] = await Promise.all([
				inventoryService.getDashboardData(),
				inventoryService.getAllStock(),
				inventoryService.getLocations(),
			]);

			set({
				dashboardData: dashboard,
				stockData: stock,
				locations,
				isLoading: false,
				error: null,
			});
		} catch (error) {
			console.error("Failed to load inventory data:", error);
			set({
				isLoading: false,
				error: "Failed to load inventory data: " + error.message,
			});
		}
	},

	// === STOCK MANAGEMENT ACTIONS ===
	adjustStock: async (productId, locationId, quantity) => {
		try {
			await inventoryService.adjustStock(productId, locationId, quantity);

			toast({
				title: "Stock Adjusted",
				description: `Stock ${quantity > 0 ? "added" : "removed"} successfully`,
				variant: "default",
			});

			// Refresh data
			await get().loadInventoryData();
			return { success: true };
		} catch (error) {
			console.error("Failed to adjust stock:", error);
			const message = error.response?.data?.message || "Failed to adjust stock";

			toast({
				title: "Stock Adjustment Failed",
				description: message,
				variant: "destructive",
			});

			return { success: false, error: message };
		}
	},

	transferStock: async (productId, fromLocationId, toLocationId, quantity) => {
		try {
			await inventoryService.transferStock(
				productId,
				fromLocationId,
				toLocationId,
				quantity
			);

			toast({
				title: "Stock Transferred",
				description: "Stock transferred successfully between locations",
				variant: "default",
			});

			// Refresh data
			await get().loadInventoryData();
			return { success: true };
		} catch (error) {
			console.error("Failed to transfer stock:", error);
			const message =
				error.response?.data?.message || "Failed to transfer stock";

			toast({
				title: "Stock Transfer Failed",
				description: message,
				variant: "destructive",
			});

			return { success: false, error: message };
		}
	},

	quickStockAdjustment: async (
		productId,
		quantity,
		reason = "Found during service"
	) => {
		try {
			await inventoryService.quickStockAdjustment(productId, quantity, reason);

			toast({
				title: "Stock Updated",
				description: `Added ${quantity} units to inventory`,
				variant: "default",
			});

			// Refresh data
			await get().loadInventoryData();
			return { success: true };
		} catch (error) {
			console.error("Failed to perform quick stock adjustment:", error);
			const message = error.response?.data?.message || "Failed to update stock";

			toast({
				title: "Stock Update Failed",
				description: message,
				variant: "destructive",
			});

			return { success: false, error: message };
		}
	},

	// === LOCATION MANAGEMENT ACTIONS ===
	createLocation: async (locationData) => {
		try {
			await inventoryService.createLocation(locationData);

			toast({
				title: "Location Created",
				description: `Location "${locationData.name}" created successfully`,
				variant: "default",
			});

			// Refresh locations
			await get().fetchLocations();
			return { success: true };
		} catch (error) {
			console.error("Failed to create location:", error);
			const message =
				error.response?.data?.message || "Failed to create location";

			toast({
				title: "Location Creation Failed",
				description: message,
				variant: "destructive",
			});

			return { success: false, error: message };
		}
	},

	updateLocation: async (locationId, locationData) => {
		try {
			await inventoryService.updateLocation(locationId, locationData);

			toast({
				title: "Location Updated",
				description: `Location "${locationData.name}" updated successfully`,
				variant: "default",
			});

			// Refresh locations
			await get().fetchLocations();
			return { success: true };
		} catch (error) {
			console.error("Failed to update location:", error);
			const message =
				error.response?.data?.message || "Failed to update location";

			toast({
				title: "Location Update Failed",
				description: message,
				variant: "destructive",
			});

			return { success: false, error: message };
		}
	},

	deleteLocation: async (locationId) => {
		try {
			await inventoryService.deleteLocation(locationId);

			toast({
				title: "Location Deleted",
				description: "Location deleted successfully",
				variant: "default",
			});

			// Refresh data
			await get().loadInventoryData();
			return { success: true };
		} catch (error) {
			console.error("Failed to delete location:", error);
			const message =
				error.response?.data?.message || "Failed to delete location";

			toast({
				title: "Location Deletion Failed",
				description: message,
				variant: "destructive",
			});

			return { success: false, error: message };
		}
	},

	// === RECIPE MANAGEMENT ACTIONS ===
	createRecipe: async (recipeData) => {
		try {
			await inventoryService.createRecipe(recipeData);

			toast({
				title: "Recipe Created",
				description: `Recipe "${recipeData.name}" created successfully`,
				variant: "default",
			});

			// Refresh recipes
			await get().fetchRecipes();
			return { success: true };
		} catch (error) {
			console.error("Failed to create recipe:", error);
			const message =
				error.response?.data?.message || "Failed to create recipe";

			toast({
				title: "Recipe Creation Failed",
				description: message,
				variant: "destructive",
			});

			return { success: false, error: message };
		}
	},

	updateRecipe: async (recipeId, recipeData) => {
		try {
			await inventoryService.updateRecipe(recipeId, recipeData);

			toast({
				title: "Recipe Updated",
				description: `Recipe "${recipeData.name}" updated successfully`,
				variant: "default",
			});

			// Refresh recipes
			await get().fetchRecipes();
			return { success: true };
		} catch (error) {
			console.error("Failed to update recipe:", error);
			const message =
				error.response?.data?.message || "Failed to update recipe";

			toast({
				title: "Recipe Update Failed",
				description: message,
				variant: "destructive",
			});

			return { success: false, error: message };
		}
	},

	deleteRecipe: async (recipeId) => {
		try {
			await inventoryService.deleteRecipe(recipeId);

			toast({
				title: "Recipe Deleted",
				description: "Recipe deleted successfully",
				variant: "default",
			});

			// Refresh recipes
			await get().fetchRecipes();
			return { success: true };
		} catch (error) {
			console.error("Failed to delete recipe:", error);
			const message =
				error.response?.data?.message || "Failed to delete recipe";

			toast({
				title: "Recipe Deletion Failed",
				description: message,
				variant: "destructive",
			});

			return { success: false, error: message };
		}
	},

	// === UTILITY ACTIONS ===
	clearError: () => set({ error: null }),

	refreshData: async () => {
		await get().loadInventoryData();
	},
});
