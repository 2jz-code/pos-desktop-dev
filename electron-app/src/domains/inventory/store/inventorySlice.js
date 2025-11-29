import inventoryService from "@/domains/inventory/services/inventoryService";
import { getProducts, getAllProducts, getAllActiveProducts } from "@/domains/products/services/productService";
import { toast } from "@/shared/components/ui/use-toast";

/**
 * Check if device is online
 */
const isOnline = () => typeof navigator !== 'undefined' ? navigator.onLine : true;

export const createInventorySlice = (set, get) => ({
	// === STATE ===
	dashboardData: null,
	stockData: [],
	locations: [],
	recipes: [],
	products: [],
	stockLevels: {},
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
		console.log("🔄 [InventorySlice] fetchStockData - OFFLINE-FIRST VERSION");

		let stockData = null;
		let source = 'none';

		// Step 1: Try offline cache first
		if (window.offlineAPI?.getCachedInventory) {
			try {
				console.log("📦 [InventorySlice] Trying inventory cache first...");
				const cachedStock = await window.offlineAPI.getCachedInventory();

				if (Array.isArray(cachedStock) && cachedStock.length > 0) {
					stockData = cachedStock;
					source = 'cache';
					console.log(`✅ [InventorySlice] Loaded ${stockData.length} stock records from cache`);
				} else {
					console.log("⚠️ [InventorySlice] Cache empty, will try API if online");
				}
			} catch (cacheError) {
				console.warn("⚠️ [InventorySlice] Cache failed, falling back to API:", cacheError);
			}
		}

		// Step 2: Fall back to API if cache empty/failed AND we're online
		if (!stockData && isOnline()) {
			try {
				console.log("🌐 [InventorySlice] Loading stock data from API...");
				const apiStock = await inventoryService.getAllStock();

				if (Array.isArray(apiStock)) {
					stockData = apiStock;
					source = 'api';
					console.log(`✅ [InventorySlice] Loaded ${stockData.length} stock records from API`);
				}
			} catch (apiError) {
				console.error("❌ [InventorySlice] API request failed:", apiError);
				set({ error: "Failed to load stock data: " + apiError.message });
				return;
			}
		}

		if (!stockData) {
			console.warn("⚠️ [InventorySlice] No stock data available (cache empty, offline or API failed)");
			stockData = [];
		}

		console.log(`🎯 [InventorySlice] Stock data loaded from ${source}: ${stockData.length} records`);
		set({ stockData });
	},

	fetchLocations: async () => {
		console.log("🔄 [InventorySlice] fetchLocations - OFFLINE-FIRST VERSION");

		let locations = null;
		let source = 'none';

		// Step 1: Try offline cache first
		if (window.offlineAPI?.getCachedInventoryLocations) {
			try {
				console.log("📦 [InventorySlice] Trying locations cache first...");
				const cachedLocations = await window.offlineAPI.getCachedInventoryLocations();

				if (Array.isArray(cachedLocations) && cachedLocations.length > 0) {
					locations = cachedLocations;
					source = 'cache';
					console.log(`✅ [InventorySlice] Loaded ${locations.length} locations from cache`);
				} else {
					console.log("⚠️ [InventorySlice] Cache empty, will try API if online");
				}
			} catch (cacheError) {
				console.warn("⚠️ [InventorySlice] Cache failed, falling back to API:", cacheError);
			}
		}

		// Step 2: Fall back to API if cache empty/failed AND we're online
		if (!locations && isOnline()) {
			try {
				console.log("🌐 [InventorySlice] Loading locations from API...");
				const apiLocations = await inventoryService.getLocations();

				if (Array.isArray(apiLocations)) {
					locations = apiLocations;
					source = 'api';
					console.log(`✅ [InventorySlice] Loaded ${locations.length} locations from API`);
				}
			} catch (apiError) {
				console.error("❌ [InventorySlice] API request failed:", apiError);
				set({ error: "Failed to load locations: " + apiError.message });
				return;
			}
		}

		if (!locations) {
			console.warn("⚠️ [InventorySlice] No locations available (cache empty, offline or API failed)");
			locations = [];
		}

		console.log(`🎯 [InventorySlice] Locations loaded from ${source}: ${locations.length}`);
		set({ locations });
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

	// NOTE: Named fetchInventoryProducts to avoid collision with productSlice.fetchProducts
	// POS uses productSlice.fetchProducts which includes sorting, filtering, and relation hydration
	fetchInventoryProducts: async () => {
		console.log("🔄 [InventorySlice] fetchInventoryProducts - OFFLINE-FIRST VERSION");

		let products = null;
		let source = 'none';

		// Step 1: Try offline cache first
		if (window.offlineAPI?.getCachedProducts) {
			try {
				console.log("📦 [InventorySlice] Trying products cache first...");
				const cachedProducts = await window.offlineAPI.getCachedProducts({ includeArchived: false });

				if (Array.isArray(cachedProducts) && cachedProducts.length > 0) {
					products = cachedProducts;
					source = 'cache';
					console.log(`✅ [InventorySlice] Loaded ${products.length} products from cache`);
				} else {
					console.log("⚠️ [InventorySlice] Cache empty, will try API if online");
				}
			} catch (cacheError) {
				console.warn("⚠️ [InventorySlice] Cache failed, falling back to API:", cacheError);
			}
		}

		// Step 2: Fall back to API if cache empty/failed AND we're online
		if (!products && isOnline()) {
			try {
				console.log("🌐 [InventorySlice] Loading products from API...");
				const response = await getAllActiveProducts();
				const apiProducts = Array.isArray(response.data) ? response.data : response.data.results || [];

				if (Array.isArray(apiProducts)) {
					products = apiProducts;
					source = 'api';
					console.log(`✅ [InventorySlice] Loaded ${products.length} products from API`);
				}
			} catch (apiError) {
				console.error("❌ [InventorySlice] API request failed:", apiError);
				set({ error: "Failed to load products: " + apiError.message });
				return;
			}
		}

		if (!products) {
			console.warn("⚠️ [InventorySlice] No products available (cache empty, offline or API failed)");
			products = [];
		}

		console.log(`🎯 [InventorySlice] Products loaded from ${source}: ${products.length}`);
		set({ products });
	},

	fetchStockByProduct: async (productId) => {
		try {
			const response = await inventoryService.getStockByProduct(productId);
			const stockData = response.data?.results || response.data || response.results || response;
			const levels = stockData.reduce((acc, stock) => {
				acc[stock.location.id] = stock.quantity;
				return acc;
			}, {});
			set({ stockLevels: levels });
			return levels;
		} catch (error) {
			console.error("Failed to fetch stock by product:", error);
			set({ error: "Failed to load stock data: " + error.message });
			return {};
		}
	},

	// Load all inventory data
	loadInventoryData: async () => {
		console.log("🔄 [InventorySlice] loadInventoryData - OFFLINE-FIRST VERSION");
		set({ isLoading: true, error: null });

		let stockData = null;
		let locations = null;
		let products = null;
		let dashboard = null;

		// Step 1: Try to load from cache first
		if (window.offlineAPI) {
			try {
				console.log("📦 [InventorySlice] Trying to load all inventory data from cache...");

				const [cachedStock, cachedLocations, cachedProducts] = await Promise.all([
					window.offlineAPI.getCachedInventory?.() || null,
					window.offlineAPI.getCachedInventoryLocations?.() || null,
					window.offlineAPI.getCachedProducts?.({ includeArchived: false }) || null,
				]);

				if (Array.isArray(cachedStock) && cachedStock.length > 0) {
					stockData = cachedStock;
					console.log(`✅ [InventorySlice] Stock from cache: ${stockData.length} records`);
				}
				if (Array.isArray(cachedLocations) && cachedLocations.length > 0) {
					locations = cachedLocations;
					console.log(`✅ [InventorySlice] Locations from cache: ${locations.length}`);
				}
				if (Array.isArray(cachedProducts) && cachedProducts.length > 0) {
					products = cachedProducts;
					console.log(`✅ [InventorySlice] Products from cache: ${products.length}`);
				}
			} catch (cacheError) {
				console.warn("⚠️ [InventorySlice] Cache failed:", cacheError);
			}
		}

		// Step 2: Fall back to API for any missing data if online
		if (isOnline()) {
			try {
				const apiCalls = [];
				const apiCallNames = [];

				// Dashboard is always fetched from API (not cached)
				apiCalls.push(inventoryService.getDashboardData());
				apiCallNames.push('dashboard');

				if (!stockData) {
					apiCalls.push(inventoryService.getAllStock());
					apiCallNames.push('stock');
				}
				if (!locations) {
					apiCalls.push(inventoryService.getLocations());
					apiCallNames.push('locations');
				}
				if (!products) {
					apiCalls.push(getAllActiveProducts());
					apiCallNames.push('products');
				}

				if (apiCalls.length > 0) {
					console.log(`🌐 [InventorySlice] Loading from API: ${apiCallNames.join(', ')}`);
					const results = await Promise.all(apiCalls);

					let resultIndex = 0;
					for (const name of apiCallNames) {
						const result = results[resultIndex++];
						switch (name) {
							case 'dashboard':
								dashboard = result;
								break;
							case 'stock':
								stockData = result;
								break;
							case 'locations':
								locations = result;
								break;
							case 'products':
								products = result.data;
								break;
						}
					}
				}
			} catch (apiError) {
				console.error("❌ [InventorySlice] API request failed:", apiError);
				// Continue with cached data if available
			}
		}

		// Set defaults for any missing data
		stockData = stockData || [];
		locations = locations || [];
		products = products || [];

		console.log(`🎯 [InventorySlice] Loaded: stock=${stockData.length}, locations=${locations.length}, products=${products.length}`);

		set({
			dashboardData: dashboard,
			stockData,
			locations,
			products,
			isLoading: false,
			error: null,
		});
	},

	// === STOCK MANAGEMENT ACTIONS ===
	adjustStock: async (productId, locationId, quantity, expirationDate = null, lowStockThreshold = null, expirationThreshold = null) => {
		try {
			await inventoryService.adjustStock(productId, locationId, quantity, expirationDate, lowStockThreshold, expirationThreshold);

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
