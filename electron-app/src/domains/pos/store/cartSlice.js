// desktop-combined/electron-app/src/store/slices/cartSlice.js
import * as orderService from "@/domains/orders/services/orderService";
import { toast } from "@/shared/components/ui/use-toast";
import { cartSocket } from "@/shared/lib/cartSocket";
import { cartGateway } from "@/shared/lib/cartGateway";
import { calculateCartTotals, getCalculationSettings } from "@/shared/lib/CartCalculator";
import { calculateDiscountAmount, isDiscountActive } from "@/shared/lib/DiscountCalculator";
import terminalRegistrationService from "@/services/TerminalRegistrationService";

// A helper function to safely parse numbers, defaulting to 0
const safeParseFloat = (value) => {
	const parsed = parseFloat(value);
	return isNaN(parsed) ? 0 : parsed;
};

// Helper function to find a modifier option by ID within a product's modifier sets
const findModifierOptionById = (product, optionId) => {
	if (!product.modifier_groups) return null;
	
	for (const modifierSet of product.modifier_groups) {
		if (!modifierSet.options) continue;
		
		const option = modifierSet.options.find(opt => opt.id === optionId);
		if (option) {
			// Add reference to modifier_set for convenience
			return { ...option, modifier_set: modifierSet };
		}
	}
	return null;
};

const getRandomOperationSuffix = () => {
	const globalCrypto = typeof globalThis !== "undefined" ? globalThis.crypto : null;
	if (globalCrypto && typeof globalCrypto.randomUUID === "function") {
		return globalCrypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const buildOperationId = (prefix, identifier) => {
	const suffix = getRandomOperationSuffix();
	if (identifier === undefined || identifier === null) {
		return `${prefix}-${suffix}`;
	}
	return `${prefix}-${identifier}-${suffix}`;
};

// Cache for calculation settings (loaded once from offline DB)
let cachedCalculationSettings = null;

/**
 * Get calculation settings from offline cache (async, but cached after first load)
 * Fetches settings, taxes, and product types for hierarchical tax lookup
 */
const getCalculationSettingsFromCache = async () => {
	if (cachedCalculationSettings) {
		return cachedCalculationSettings;
	}

	try {
		if (window.offlineAPI?.getCachedSettings) {
			// Fetch settings, taxes, and product types in parallel
			const [settings, taxes, productTypes] = await Promise.all([
				window.offlineAPI.getCachedSettings(),
				window.offlineAPI.getCachedTaxes?.() || [],
				window.offlineAPI.getCachedProductTypes?.() || [],
			]);

			// Log raw data for debugging
			console.log('[cartSlice] Raw cached data:', {
				settings: settings,
				storeLocationTaxRate: settings?.store_location?.tax_rate,
				globalDefaultTaxRate: settings?.global_settings?.default_tax_rate,
				taxesCount: taxes?.length || 0,
				taxes: taxes?.slice(0, 3), // Show first 3
				productTypesCount: productTypes?.length || 0,
				productTypes: productTypes?.slice(0, 3), // Show first 3
			});

			// Build calculation settings with tax lookup maps
			cachedCalculationSettings = getCalculationSettings(settings, taxes, productTypes);
			return cachedCalculationSettings;
		}
	} catch (error) {
		console.warn('[cartSlice] Failed to get calculation settings:', error);
	}

	// Fallback to zero rates if cache unavailable
	return {
		taxRate: 0,
		surchargePercentage: 0,
		surchargeEnabled: false,
		taxRateMap: new Map(),
		productTypeMap: new Map(),
	};
};

/**
 * Invalidate cached settings (call when settings are updated)
 */
export const invalidateCalculationSettingsCache = () => {
	cachedCalculationSettings = null;
};

/**
 * Preload calculation settings from offline cache
 * Call this during app initialization to ensure settings are available
 * before any cart operations
 */
export const preloadCalculationSettings = async () => {
	try {
		const settings = await getCalculationSettingsFromCache();
		// Divide by 2 because we store both original and string keys
		const uniqueTaxes = settings.taxRateMap ? settings.taxRateMap.size / 2 : 0;
		const uniqueProductTypes = settings.productTypeMap ? settings.productTypeMap.size / 2 : 0;

		// Log first few tax rates for debugging
		const taxRateSamples = [];
		let count = 0;
		for (const [key, value] of settings.taxRateMap.entries()) {
			if (count < 3 && typeof key === 'number') { // Only log original keys, not string duplicates
				taxRateSamples.push({ id: key, rate: value });
			}
			count++;
		}

		console.log('[cartSlice] Calculation settings preloaded:', {
			defaultTaxRate: settings.taxRate,
			surchargePercentage: settings.surchargePercentage,
			surchargeEnabled: settings.surchargeEnabled,
			taxesLoaded: uniqueTaxes,
			productTypesLoaded: uniqueProductTypes,
			taxRateSamples: taxRateSamples,
		});
		return settings;
	} catch (error) {
		console.warn('[cartSlice] Failed to preload calculation settings:', error);
		return null;
	}
};

/**
 * Calculate local totals using CartCalculator
 * This is the synchronous version that uses cached settings
 *
 * @param {Array} items - Cart items
 * @param {Array} adjustments - Order adjustments (one-off discounts, price overrides, etc.)
 * @param {Array} appliedDiscounts - Predefined/catalog discounts applied to order
 * @param {string} paymentMethod - Payment method for surcharge calculation
 * @param {number} tip - Tip amount
 */
const calculateLocalTotals = (items, adjustments = [], appliedDiscounts = [], paymentMethod = null, tip = 0) => {
	// Use cached settings synchronously (fallback to zero if not loaded)
	const settings = cachedCalculationSettings || {
		taxRate: 0,
		surchargePercentage: 0,
		surchargeEnabled: false,
		taxRateMap: new Map(),
		productTypeMap: new Map(),
	};

	const result = calculateCartTotals({
		items,
		adjustments,
		appliedDiscounts,
		settings,
		paymentMethod,
		tip,
		currency: 'USD',
	});

	return {
		subtotal: result.subtotal,
		taxAmount: result.tax,
		totalDiscountsAmount: result.discountTotal,
		predefinedDiscountTotal: result.predefinedDiscountTotal,
		oneOffDiscountTotal: result.oneOffDiscountTotal,
		total: result.total,
		surcharge: result.surcharge,
		itemCount: result.itemCount,
		discountBreakdown: result.discountBreakdown,
	};
};

// The single source of truth for the initial state of a cart.
// All financial values are initialized to 0.
export const defaultCartState = {
	orderId: null,
	orderNumber: null,
	orderStatus: "DRAFT",
	items: [],
	subtotal: 0,
	total: 0,
	taxAmount: 0,
	totalDiscountsAmount: 0,
	totalAdjustmentsAmount: 0,
	tip: 0, // Keep tip for now, might be used later
	isSocketConnected: false,
	isOfflineOrder: false, // Track if current order was created offline
	isTaxExempt: false, // Tax exemption flag
	isFeeExempt: false, // Fee/surcharge exemption flag
	addingItemId: null,
	updatingItems: [],
	appliedDiscounts: [],
	adjustments: [],
	customerFirstName: "",
	diningPreference: "TAKE_OUT", // Default to take-out
	pendingOperations: new Set(), // Track pending WebSocket operations
	stockOverrideDialog: {
		show: false,
		productId: null,
		message: "",
		lastPayload: null,
		actionType: null,
		itemId: null,
		currentQuantity: null,
		requestedQuantity: null,
	},
	approvalRequest: {
		show: false,
		approvalRequestId: null,
		message: "",
		actionType: null, // DISCOUNT, REFUND, VOID, etc.
		discountName: null,
		discountValue: null,
	},
};

const loadInitialCartState = () => {
	// This function can be simplified as we are not persisting cart state
	// across sessions anymore, but leaving it for potential future use.
	return { ...defaultCartState };
};

export const createCartSlice = (set, get) => {
	const initialState = loadInitialCartState();

	return {
		...initialState,

		addCustomItem: async (customItemData) => {
			const { name, price, quantity, notes, taxExempt } = customItemData;

			// Store original state for rollback
			const originalItems = [...get().items];
			const originalSubtotal = get().subtotal;
			const originalTotal = get().total;

			// Optimistically add custom item to UI
			const tempCustomItem = {
				id: `temp-custom-${Date.now()}`,
				product: null,
				custom_name: name,
				custom_price: price,
				quantity: quantity,
				price_at_sale: price,
				notes: notes,
				display_name: name,
				display_price: price.toString(),
			};

			const optimisticItems = [...get().items, tempCustomItem];
			const totals = calculateLocalTotals(optimisticItems, get().adjustments, get().appliedDiscounts);
			set({ items: optimisticItems, subtotal: totals.subtotal, total: totals.total, taxAmount: totals.taxAmount });

			try {
				let orderId = get().orderId;

				if (!orderId) {
					const orderData = {
						order_type: "POS",
						dining_preference: get().diningPreference,
						store_location: terminalRegistrationService.getTerminalConfig()?.location_id,
					};

					// Include customer name if provided
					const { customerFirstName } = get();
					if (customerFirstName) {
						orderData.guest_first_name = customerFirstName;
					}

					// Use CartGateway to create order (routes online/offline)
					const { orderId: newOrderId, isLocal } = await cartGateway.getOrCreateOrderId(
						orderData,
						orderService.createOrder
					);

					orderId = newOrderId;

					set({
						orderId: orderId,
						orderStatus: "DRAFT",
						orderNumber: isLocal ? `OFFLINE-${orderId.substring(6, 14)}` : null,
						isOfflineOrder: isLocal,
					});

					// Only connect WebSocket if online order
					if (!isLocal) {
						await cartGateway.initializeConnection(orderId);
					}
				}

				// Send custom item through CartGateway (routes online/offline)
				await cartGateway.sendCartOperation({
					type: "add_custom_item",
					payload: {
						name,
						price,
						quantity,
						notes,
						tax_exempt: taxExempt || false,
					},
				});

				get().showToast({
					title: "Custom Item Added",
					description: `Added ${quantity}x ${name} to order`,
				});

			} catch (error) {
				console.error("Error adding custom item:", error);
				// Rollback on error
				set({
					items: originalItems,
					subtotal: originalSubtotal,
					total: originalTotal,
				});
				get().showToast({
					title: "Error",
					description: "Failed to add custom item. Please try again.",
					variant: "destructive",
				});
			}
		},

		addItem: async (product) => {
			set({ addingItemId: product.id });

			// Store original state for rollback
			const originalItems = [...get().items];
			const originalSubtotal = get().subtotal;
			const originalTotal = get().total;

			try {
				let orderId = get().orderId;
				let isOfflineOrder = get().isOfflineOrder;

				// Create order through CartGateway (handles online/offline routing)
				if (!orderId) {
					const orderData = {
						order_type: "POS",
						dining_preference: get().diningPreference,
						store_location: terminalRegistrationService.getTerminalConfig()?.location_id,
					};

					// Include customer name if provided
					const { customerFirstName } = get();
					if (customerFirstName) {
						orderData.guest_first_name = customerFirstName;
					}

					// Use CartGateway to create order (routes online/offline)
					const { orderId: newOrderId, isLocal } = await cartGateway.getOrCreateOrderId(
						orderData,
						orderService.createOrder
					);

					orderId = newOrderId;
					isOfflineOrder = isLocal;

					set({
						orderId: orderId,
						orderStatus: "DRAFT",
						orderNumber: isLocal ? `OFFLINE-${orderId.substring(6, 14)}` : null,
						isOfflineOrder: isLocal,
					});

					// Only connect WebSocket if online order
					if (!isLocal) {
						console.log(`⏱️ [TIMING] Order created: ${orderId.substring(0, 8)}, connecting socket...`);
						await cartGateway.initializeConnection(orderId);
						console.log(`⏱️ [TIMING] Socket ready, sending item`);
					} else {
						console.log(`📡 [CartSlice] Offline order created: ${orderId.substring(0, 14)}`);
					}

					get().showToast({
						title: isLocal ? "Offline Order Started" : "New Order Started",
						description: isLocal ? "Order will sync when online" : `Order #${orderId.substring(0, 4)}...`,
					});
				}

				// Always do optimistic update for local state
				// For items without modifiers, we can merge with existing items of the same product
				// In offline mode, we also merge temp items since they won't be replaced by server response
				const isOffline = get().isOfflineOrder;
				const existingItemIndex = get().items.findIndex(
					(item) =>
						item.product && product && item.product.id === product.id &&
						// Don't merge items that have modifiers (they're unique variations)
						(!item.selected_modifiers_snapshot || item.selected_modifiers_snapshot.length === 0) &&
						// In online mode, skip temp items (they'll be replaced by server)
						// In offline mode, merge temp items too
						(isOffline || !item.id.toString().startsWith("temp-"))
				);
				let optimisticItems = [...get().items];

				if (existingItemIndex > -1) {
					optimisticItems[existingItemIndex] = {
						...optimisticItems[existingItemIndex],
						quantity: optimisticItems[existingItemIndex].quantity + 1,
					};
				} else {
					optimisticItems.push({
						id: `temp-${product.id}-${Date.now()}`,
						product: product,
						quantity: 1,
						price_at_sale: product.price,
					});
				}

				const totals = calculateLocalTotals(optimisticItems, get().adjustments, get().appliedDiscounts);
				set({ items: optimisticItems, subtotal: totals.subtotal, total: totals.total, taxAmount: totals.taxAmount });

				const payload = { product_id: product.id, quantity: 1 };
				const operationId = buildOperationId("add", product.id);

				// Track this operation as pending
				get().addPendingOperation(operationId);

				// Store the payload in case we need to retry with force_add
				set({
					stockOverrideDialog: {
						...get().stockOverrideDialog,
						lastPayload: payload,
					},
				});

				// Send operation through CartGateway (routes online/offline)
				await cartGateway.sendCartOperation({
					type: "add_item",
					operationId: operationId,
					payload: payload,
				});
			} catch (error) {
				console.error("Error during cart sync:", error);
				// Rollback optimistic update
				set({
					items: originalItems,
					subtotal: originalSubtotal,
					total: originalTotal,
				});
				get().showToast({
					title: "Failed to Sync Item",
					description:
						error.response?.data?.detail || "An unexpected error occurred.",
					variant: "destructive",
				});
			} finally {
				set({ addingItemId: null });
			}
		},

		addItemWithModifiers: async (itemData) => {
			const { product_id, quantity, selected_modifiers, notes } = itemData;

			set({ addingItemId: product_id });

			// Store original state for rollback
			const originalItems = [...get().items];
			const originalSubtotal = get().subtotal;
			const originalTotal = get().total;

			// For items with modifiers, we always create new items (no merging)
			const product = get().products?.find(p => p.id === product_id);
			if (!product) {
				console.error("Product not found:", product_id);
				set({ addingItemId: null });
				return;
			}

			try {
				let orderId = get().orderId;
				let isOfflineOrder = get().isOfflineOrder;

				// Create order through CartGateway (handles online/offline routing)
				if (!orderId) {
					const orderData = {
						order_type: "POS",
						dining_preference: get().diningPreference,
						store_location: terminalRegistrationService.getTerminalConfig()?.location_id,
					};

					// Include customer name if provided
					const { customerFirstName } = get();
					if (customerFirstName) {
						orderData.guest_first_name = customerFirstName;
					}

					// Use CartGateway to create order (routes online/offline)
					const { orderId: newOrderId, isLocal } = await cartGateway.getOrCreateOrderId(
						orderData,
						orderService.createOrder
					);

					orderId = newOrderId;
					isOfflineOrder = isLocal;

					set({
						orderId: orderId,
						orderStatus: "DRAFT",
						orderNumber: isLocal ? `OFFLINE-${orderId.substring(6, 14)}` : null,
						isOfflineOrder: isLocal,
					});

					// Only connect WebSocket if online order
					if (!isLocal) {
						console.log(`⏱️ [TIMING] Order created (with modifiers): ${orderId.substring(0, 8)}, connecting socket...`);
						await cartGateway.initializeConnection(orderId);
						console.log(`⏱️ [TIMING] Socket ready, sending item with modifiers`);
					} else {
						console.log(`📡 [CartSlice] Offline order created: ${orderId.substring(0, 14)}`);
					}

					get().showToast({
						title: isLocal ? "Offline Order Started" : "New Order Started",
						description: isLocal ? "Order will sync when online" : `Order #${orderId.substring(0, 4)}...`,
					});
				}

				// Always do optimistic update for local state
				let totalModifierPrice = 0;
				if (selected_modifiers) {
					selected_modifiers.forEach(modifier => {
						const option = findModifierOptionById(product, modifier.option_id);
						if (option) {
							totalModifierPrice += parseFloat(option.price_delta) * (modifier.quantity || 1);
						}
					});
				}

				const optimisticItem = {
					id: `temp-${product_id}-${Date.now()}`,
					product: product,
					quantity: quantity,
					price_at_sale: parseFloat(product.price) + totalModifierPrice,
					selected_modifiers_snapshot: selected_modifiers?.map(modifier => {
						const option = findModifierOptionById(product, modifier.option_id);
						return option ? {
							modifier_set_name: option.modifier_set?.name || "Unknown",
							option_name: option.name,
							price_at_sale: parseFloat(option.price_delta),
							quantity: modifier.quantity || 1
						} : null;
					}).filter(Boolean) || [],
					total_modifier_price: totalModifierPrice,
					notes: notes || ""
				};

				const optimisticItems = [...get().items, optimisticItem];
				const totals = calculateLocalTotals(optimisticItems, get().adjustments, get().appliedDiscounts);
				set({ items: optimisticItems, subtotal: totals.subtotal, total: totals.total, taxAmount: totals.taxAmount });

				const payload = {
					product_id: product_id,
					quantity: quantity,
					selected_modifiers: selected_modifiers || [],
					notes: notes || ""
				};
				const operationId = buildOperationId("add", product_id);

				// Track this operation as pending
				get().addPendingOperation(operationId);

				// Store the payload in case we need to retry with force_add
				set({
					stockOverrideDialog: {
						...get().stockOverrideDialog,
						lastPayload: payload,
					},
				});

				// Send operation through CartGateway (routes online/offline)
				await cartGateway.sendCartOperation({
					type: "add_item",
					operationId: operationId,
					payload: payload,
				});
			} catch (error) {
				console.error("Error during cart sync:", error);
				// Rollback optimistic update
				set({
					items: originalItems,
					subtotal: originalSubtotal,
					total: originalTotal,
				});
				get().showToast({
					title: "Failed to Sync Item",
					description:
						error.response?.data?.detail || "An unexpected error occurred.",
					variant: "destructive",
				});
			} finally {
				set({ addingItemId: null });
			}
		},

		// Add method to handle rollback from WebSocket errors
		rollbackOptimisticUpdate: (originalState) => {
			set({
				items: originalState.items,
				subtotal: originalState.subtotal,
				total: originalState.total,
			});
		},

		// Stock override dialog methods
		setStockOverrideDialog: (dialogState) => {
			set({ stockOverrideDialog: dialogState });
		},

		forceAddItem: async () => {
			const dialog = get().stockOverrideDialog;
			const { lastPayload, actionType, itemId, requestedQuantity } = dialog;

			if (actionType === "quantity_update" && itemId && requestedQuantity) {
				// Force quantity update through CartGateway
				const operationId = buildOperationId("force-update", itemId);
				get().addPendingOperation(operationId);

				await cartGateway.sendCartOperation({
					type: "update_item_quantity",
					operationId: operationId,
					payload: {
						item_id: itemId,
						quantity: requestedQuantity,
						force_update: true,
					},
				});

				get().showToast({
					title: "Quantity Updated",
					description:
						"Item quantity was updated despite low stock - remember to update inventory later",
					variant: "default",
				});
			} else if (lastPayload) {
				// Force add item through CartGateway
				const operationId = buildOperationId("force-add", lastPayload.product_id);
				get().addPendingOperation(operationId);

				await cartGateway.sendCartOperation({
					type: "add_item",
					operationId: operationId,
					payload: { ...lastPayload, force_add: true },
				});

				get().showToast({
					title: "Item Added",
					description:
						"Item was added despite low stock - remember to update inventory later",
					variant: "default",
				});
			}

			// Close the dialog
			get().setStockOverrideDialog({
				show: false,
				productId: null,
				message: "",
				lastPayload: null,
				actionType: null,
				itemId: null,
				currentQuantity: null,
				requestedQuantity: null,
			});
		},

		cancelStockOverride: () => {
			const dialog = get().stockOverrideDialog;
			const { lastPayload, actionType, itemId, currentQuantity } = dialog;

			if (
				actionType === "quantity_update" &&
				itemId &&
				currentQuantity !== null
			) {
				// Rollback quantity update - revert to original quantity
				const items = get().items.map((item) =>
					item.id === itemId ? { ...item, quantity: currentQuantity } : item
				);
				const totals = calculateLocalTotals(items, get().adjustments, get().appliedDiscounts);
				set({ items, subtotal: totals.subtotal, total: totals.total, taxAmount: totals.taxAmount });
			} else if (lastPayload) {
				// Rollback add item - remove optimistic add
				const productId = lastPayload.product_id;
				const items = get().items.filter(
					(item) =>
						!(
							item.id.toString().startsWith("temp-") &&
							item.product.id === productId
						)
				);
				const totals = calculateLocalTotals(items, get().adjustments, get().appliedDiscounts);
				set({ items, subtotal: totals.subtotal, total: totals.total, taxAmount: totals.taxAmount });
			}

			// Close the dialog
			get().setStockOverrideDialog({
				show: false,
				productId: null,
				message: "",
				lastPayload: null,
				actionType: null,
				itemId: null,
				currentQuantity: null,
				requestedQuantity: null,
			});
		},

		// Manager approval request methods
		setApprovalRequest: (requestState) => {
			set({ approvalRequest: requestState });
		},

		cancelApprovalRequest: () => {
			set({
				approvalRequest: {
					show: false,
					approvalRequestId: null,
					message: "",
					actionType: null,
					discountName: null,
					discountValue: null,
				},
			});
		},

		setCartFromSocket: (orderData) => {
			console.log(`⏱️ [TIMING] WebSocket update received, reconciling cart state (${orderData.items?.length || 0} items)`);
			console.log('📊 Adjustments from backend:', orderData.adjustments);
			console.log('📊 Total adjustments amount:', orderData.total_adjustments_amount);
			set({
				items: orderData.items || [],
				orderId: orderData.id,
				orderNumber: orderData.order_number,
				orderStatus: orderData.status,
				total: safeParseFloat(orderData.grand_total),
				subtotal: safeParseFloat(orderData.subtotal),
				taxAmount: safeParseFloat(orderData.tax_total),
				totalDiscountsAmount: safeParseFloat(orderData.total_discounts_amount),
				totalAdjustmentsAmount: safeParseFloat(orderData.total_adjustments_amount),
				appliedDiscounts: orderData.applied_discounts || [],
				adjustments: orderData.adjustments || [],
				addingItemId: null,
				updatingItems: [],
				isSyncing: false,
			});
		},

		updateItemQuantityViaSocket: async (itemId, quantity) => {
			// Optimistic update
			const originalItems = [...get().items];
			const items = get().items.map((item) =>
				item.id === itemId ? { ...item, quantity } : item
			);
			const totals = calculateLocalTotals(items, get().adjustments, get().appliedDiscounts);
			set({ items, subtotal: totals.subtotal, total: totals.total, taxAmount: totals.taxAmount });

			// Store for potential stock override
			set({
				stockOverrideDialog: {
					...get().stockOverrideDialog,
					actionType: "quantity_update",
					itemId: itemId,
					currentQuantity: originalItems.find(i => i.id === itemId)?.quantity,
					requestedQuantity: quantity,
				},
			});

			const operationId = buildOperationId("update-quantity", itemId);
			get().addPendingOperation(operationId);

			// Send through CartGateway (routes online/offline)
			await cartGateway.sendCartOperation({
				type: "update_item_quantity",
				operationId: operationId,
				payload: { item_id: itemId, quantity },
			});
		},

		updateItemViaSocket: async (itemId, updatedItemData) => {
			set((state) => ({
				updatingItems: [...state.updatingItems, itemId],
			}));

			const payload = {
				item_id: itemId,
				...updatedItemData
			};

			const operationId = buildOperationId("update-item", itemId);
			get().addPendingOperation(operationId);

			// Send through CartGateway (routes online/offline)
			await cartGateway.sendCartOperation({
				type: "update_item",
				operationId: operationId,
				payload: payload,
			});
		},

		setSocketConnected: (connected) => {
			set({ isSocketConnected: connected });
		},

		// Helper methods for managing pending operations
		addPendingOperation: (operationId) => {
			set((state) => ({
				pendingOperations: new Set([...state.pendingOperations, operationId])
			}));
		},

		removePendingOperation: (operationId) => {
			set((state) => {
				const newPending = new Set(state.pendingOperations);
				newPending.delete(operationId);
				return { pendingOperations: newPending };
			});
		},

		isPendingOperation: (operationId) => {
			return get().pendingOperations.has(operationId);
		},

		initializeCartSocket: async () => {
			const orderId = get().orderId;
			const isOfflineOrder = get().isOfflineOrder;

			// Skip socket connection for offline orders
			if (isOfflineOrder) {
				console.log("📡 [CartSlice] Skipping socket for offline order");
				return;
			}

			if (orderId) {
				try {
					// Use CartGateway for connection (handles offline check)
					const connected = await cartGateway.initializeConnection(orderId);
					if (!connected) {
						console.log("📡 [CartSlice] Socket connection skipped (offline or local order)");
					}
				} catch (error) {
					console.error("Failed to connect cart socket:", error);
					get().showToast({
						title: "Connection Error",
						description: "Could not connect to the order server.",
						variant: "destructive",
					});
					throw error;
				}
			} else {
				console.warn("Cannot initialize cart socket: orderId is null.");
			}
		},

		disconnectCartSocket: () => {
			cartSocket.disconnect();
		},

		removeItemViaSocket: async (itemId) => {
			// Optimistic update
			const items = get().items.filter((item) => item.id !== itemId);
			const totals = calculateLocalTotals(items, get().adjustments, get().appliedDiscounts);
			set({ items, subtotal: totals.subtotal, total: totals.total, taxAmount: totals.taxAmount });

			const operationId = buildOperationId("remove", itemId);
			get().addPendingOperation(operationId);

			// Send through CartGateway (routes online/offline)
			await cartGateway.sendCartOperation({
				type: "remove_item",
				operationId: operationId,
				payload: { item_id: itemId },
			});
		},

		applyDiscountViaSocket: async (discountId) => {
			const operationId = buildOperationId("apply-discount", discountId);
			get().addPendingOperation(operationId);

			// Check if offline - need to handle locally
			if (cartGateway.isOfflineMode()) {
				try {
					// Look up the discount from cache
					const cachedDiscounts = await window.offlineAPI?.getCachedDiscounts();
					const discount = cachedDiscounts?.find(d => d.id === discountId);

					if (!discount) {
						console.error('❌ [CartSlice] Discount not found in cache:', discountId);
						get().removePendingOperation(operationId);
						return;
					}

					// Check if already applied
					const existingDiscounts = get().appliedDiscounts || [];
					if (existingDiscounts.some(d => d.discount?.id === discountId || d.id === discountId)) {
						console.warn('⚠️ [CartSlice] Discount already applied:', discountId);
						get().removePendingOperation(operationId);
						return;
					}

					// Calculate the discount amount using DiscountCalculator (static import at top)
					const items = get().items;
					const subtotal = get().subtotal;
					const settings = await getCalculationSettingsFromCache();

					const discountAmountMinor = calculateDiscountAmount(
						discount,
						items,
						Math.round(subtotal * 100), // Convert to minor units
						settings.productTypeMap,
						'USD'
					);
					const discountAmount = discountAmountMinor / 100; // Convert back to decimal

					// Create the applied discount entry matching backend structure
					const appliedDiscount = {
						id: `local-${Date.now()}`, // Local ID for the OrderDiscount entry
						discount: discount,
						amount: discountAmount,
					};

					// Optimistically update state
					const newAppliedDiscounts = [...existingDiscounts, appliedDiscount];
					const totalDiscountsAmount = newAppliedDiscounts.reduce(
						(sum, d) => sum + parseFloat(d.amount || 0), 0
					);

					set({
						appliedDiscounts: newAppliedDiscounts,
						totalDiscountsAmount,
					});

					// Recalculate totals
					await get().recalculateTotals();

					console.log('✅ [CartSlice] Applied discount offline:', discount.name, 'Amount:', discountAmount);
				} catch (error) {
					console.error('❌ [CartSlice] Failed to apply discount offline:', error);
				}
				get().removePendingOperation(operationId);
				return;
			}

			// Online - Send through CartGateway via WebSocket
			await cartGateway.sendCartOperation({
				type: "apply_discount",
				operationId: operationId,
				payload: { discount_id: discountId },
			});
		},

		applyDiscountCodeViaSocket: async (code) => {
			const operationId = buildOperationId("apply-code", code);
			get().addPendingOperation(operationId);

			// Check if offline - need to handle locally
			if (cartGateway.isOfflineMode()) {
				try {
					// Look up the discount by code from cache
					const cachedDiscounts = await window.offlineAPI?.getCachedDiscounts();
					const discount = cachedDiscounts?.find(d => d.code?.toLowerCase() === code.toLowerCase());

					if (!discount) {
						toast({
							title: "Invalid Code",
							description: "Discount code not found.",
							variant: "destructive",
						});
						get().removePendingOperation(operationId);
						return;
					}

					// Check if active (using static import from top)
					if (!isDiscountActive(discount)) {
						toast({
							title: "Discount Inactive",
							description: "This discount is not currently active.",
							variant: "destructive",
						});
						get().removePendingOperation(operationId);
						return;
					}

					// Apply using the same logic as applyDiscountViaSocket
					get().removePendingOperation(operationId);
					await get().applyDiscountViaSocket(discount.id);
					return;
				} catch (error) {
					console.error('❌ [CartSlice] Failed to apply discount code offline:', error);
					toast({
						title: "Error",
						description: "Failed to apply discount code.",
						variant: "destructive",
					});
				}
				get().removePendingOperation(operationId);
				return;
			}

			// Online - Send through CartGateway via WebSocket
			await cartGateway.sendCartOperation({
				type: "apply_discount_code",
				operationId: operationId,
				payload: { code },
			});
		},

		removeDiscountViaSocket: async (discountId) => {
			// Optimistic update - remove from applied discounts
			// Handle both discount.id and appliedDiscount.id matching
			const appliedDiscounts = get().appliedDiscounts.filter(d => {
				const dDiscountId = d.discount?.id || d.id;
				return dDiscountId !== discountId;
			});

			const totalDiscountsAmount = appliedDiscounts.reduce(
				(sum, d) => sum + parseFloat(d.amount || 0), 0
			);

			set({ appliedDiscounts, totalDiscountsAmount });

			const operationId = buildOperationId("remove-discount", discountId);
			get().addPendingOperation(operationId);

			// Recalculate totals
			await get().recalculateTotals();

			// If offline, we're done (queued for sync)
			if (cartGateway.isOfflineMode()) {
				get().removePendingOperation(operationId);
				console.log('✅ [CartSlice] Removed discount offline:', discountId);
				return;
			}

			// Online - Send through CartGateway via WebSocket
			await cartGateway.sendCartOperation({
				type: "remove_discount",
				operationId: operationId,
				payload: { discount_id: discountId },
			});
		},

		/**
		 * Apply a one-off discount (order-level or item-level)
		 * Works both online (via API) and offline (local state)
		 */
		applyOneOffDiscount: async ({ discountType, discountValue, reason, orderItemId = null }) => {
			const orderId = get().orderId;
			if (!orderId) {
				throw new Error("No active order");
			}

			const operationId = buildOperationId("one-off-discount", Date.now());
			get().addPendingOperation(operationId);

			// Check if offline
			if (cartGateway.isOfflineMode()) {
				try {
					// Create local adjustment entry
					const adjustmentId = `local-adj-${Date.now()}`;
					const items = get().items;
					const subtotal = get().subtotal;

					// Calculate the actual discount amount
					let discountAmount;
					let baseAmount;

					if (orderItemId) {
						// Item-level discount
						const item = items.find(i => i.id === orderItemId);
						if (!item) throw new Error("Item not found");
						baseAmount = parseFloat(item.price_at_sale) * item.quantity;
					} else {
						// Order-level discount
						baseAmount = subtotal;
					}

					if (discountType === "PERCENTAGE") {
						discountAmount = (baseAmount * discountValue) / 100;
					} else {
						discountAmount = Math.min(discountValue, baseAmount);
					}

					const newAdjustment = {
						id: adjustmentId,
						adjustment_type: "ONE_OFF_DISCOUNT",
						discount_type: discountType === "PERCENTAGE" ? "PERCENTAGE" : "FIXED",
						discount_value: discountValue,
						amount: -discountAmount, // Negative for discounts
						reason: reason,
						order_item: orderItemId,
						created_at: new Date().toISOString(),
					};

					const currentAdjustments = get().adjustments || [];
					const newAdjustments = [...currentAdjustments, newAdjustment];
					const totalAdjustmentsAmount = newAdjustments.reduce(
						(sum, adj) => sum + parseFloat(adj.amount || 0), 0
					);

					set({
						adjustments: newAdjustments,
						totalAdjustmentsAmount: totalAdjustmentsAmount,
					});

					// Recalculate totals
					await get().recalculateTotals();

					get().removePendingOperation(operationId);
					console.log('✅ [CartSlice] Applied one-off discount offline:', newAdjustment);

					return { success: true, adjustment: newAdjustment };
				} catch (error) {
					get().removePendingOperation(operationId);
					console.error('❌ [CartSlice] Failed to apply one-off discount offline:', error);
					throw error;
				}
			}

			// Online - use API
			const { applyOneOffDiscount } = await import('@/domains/orders/services/orderService');
			try {
				const payload = {
					discount_type: discountType,
					discount_value: discountValue,
					reason: reason,
				};
				if (orderItemId) {
					payload.order_item_id = orderItemId;
				}

				const response = await applyOneOffDiscount(orderId, payload);
				get().removePendingOperation(operationId);
				return response;
			} catch (error) {
				get().removePendingOperation(operationId);
				throw error;
			}
		},

		/**
		 * Apply a price override to an item
		 * Works both online (via API) and offline (local state)
		 */
		applyPriceOverride: async ({ orderItemId, newPrice, reason }) => {
			const orderId = get().orderId;
			if (!orderId) {
				throw new Error("No active order");
			}

			const operationId = buildOperationId("price-override", orderItemId);
			get().addPendingOperation(operationId);

			// Check if offline
			if (cartGateway.isOfflineMode()) {
				try {
					const items = get().items;
					const item = items.find(i => i.id === orderItemId);
					if (!item) throw new Error("Item not found");

					const originalPrice = parseFloat(item.price_at_sale);
					const priceDiff = newPrice - originalPrice;

					// Create adjustment entry for the price override
					const adjustmentId = `local-adj-${Date.now()}`;
					const newAdjustment = {
						id: adjustmentId,
						adjustment_type: "PRICE_OVERRIDE",
						amount: priceDiff * item.quantity, // Positive if price increase, negative if decrease
						reason: reason,
						order_item: orderItemId,
						original_price: originalPrice,
						new_price: newPrice,
						created_at: new Date().toISOString(),
					};

					// Update the item's price_at_sale
					const updatedItems = items.map(i =>
						i.id === orderItemId ? { ...i, price_at_sale: newPrice.toString() } : i
					);

					const currentAdjustments = get().adjustments || [];
					const newAdjustments = [...currentAdjustments, newAdjustment];
					const totalAdjustmentsAmount = newAdjustments.reduce(
						(sum, adj) => sum + parseFloat(adj.amount || 0), 0
					);

					set({
						items: updatedItems,
						adjustments: newAdjustments,
						totalAdjustmentsAmount: totalAdjustmentsAmount,
					});

					// Recalculate totals
					await get().recalculateTotals();

					get().removePendingOperation(operationId);
					console.log('✅ [CartSlice] Applied price override offline:', newAdjustment);

					return { success: true, adjustment: newAdjustment };
				} catch (error) {
					get().removePendingOperation(operationId);
					console.error('❌ [CartSlice] Failed to apply price override offline:', error);
					throw error;
				}
			}

			// Online - use API
			const { applyPriceOverride } = await import('@/domains/orders/services/orderService');
			try {
				const response = await applyPriceOverride(orderId, {
					order_item_id: orderItemId,
					new_price: newPrice,
					reason: reason,
				});
				get().removePendingOperation(operationId);
				return response;
			} catch (error) {
				get().removePendingOperation(operationId);
				throw error;
			}
		},

		/**
		 * Apply tax exemption to the order
		 * Works both online (via API) and offline (local state)
		 */
		applyTaxExemption: async ({ reason }) => {
			const orderId = get().orderId;
			if (!orderId) {
				throw new Error("No active order");
			}

			const operationId = buildOperationId("tax-exempt", orderId);
			get().addPendingOperation(operationId);

			// Check if offline
			if (cartGateway.isOfflineMode()) {
				try {
					const taxAmount = get().taxAmount;

					// Create adjustment entry for tax exemption
					const adjustmentId = `local-adj-${Date.now()}`;
					const newAdjustment = {
						id: adjustmentId,
						adjustment_type: "TAX_EXEMPT",
						amount: -taxAmount, // Negate the tax
						reason: reason,
						order_item: null,
						created_at: new Date().toISOString(),
					};

					const currentAdjustments = get().adjustments || [];
					const newAdjustments = [...currentAdjustments, newAdjustment];

					// Set tax exempt flag and zero out tax
					set({
						adjustments: newAdjustments,
						isTaxExempt: true,
						taxAmount: 0,
					});

					// Recalculate totals (will respect isTaxExempt flag)
					await get().recalculateTotals();

					get().removePendingOperation(operationId);
					console.log('✅ [CartSlice] Applied tax exemption offline:', newAdjustment);

					return { success: true, adjustment: newAdjustment };
				} catch (error) {
					get().removePendingOperation(operationId);
					console.error('❌ [CartSlice] Failed to apply tax exemption offline:', error);
					throw error;
				}
			}

			// Online - use API
			const { applyTaxExempt } = await import('@/domains/orders/services/orderService');
			try {
				const response = await applyTaxExempt(orderId, reason);
				get().removePendingOperation(operationId);
				return response;
			} catch (error) {
				get().removePendingOperation(operationId);
				throw error;
			}
		},

		/**
		 * Apply fee exemption to the order (no surcharge)
		 * Works both online (via API) and offline (local state)
		 */
		applyFeeExemption: async ({ reason }) => {
			const orderId = get().orderId;
			if (!orderId) {
				throw new Error("No active order");
			}

			const operationId = buildOperationId("fee-exempt", orderId);
			get().addPendingOperation(operationId);

			// Check if offline
			if (cartGateway.isOfflineMode()) {
				try {
					// Create adjustment entry for fee exemption
					const adjustmentId = `local-adj-${Date.now()}`;
					const newAdjustment = {
						id: adjustmentId,
						adjustment_type: "FEE_EXEMPT",
						amount: 0, // Fee exemption doesn't change amount directly, it's a flag
						reason: reason || "Fee exemption requested",
						order_item: null,
						created_at: new Date().toISOString(),
					};

					const currentAdjustments = get().adjustments || [];
					const newAdjustments = [...currentAdjustments, newAdjustment];

					// Set fee exempt flag
					set({
						adjustments: newAdjustments,
						isFeeExempt: true,
					});

					// Recalculate totals (will respect isFeeExempt flag)
					await get().recalculateTotals();

					get().removePendingOperation(operationId);
					console.log('✅ [CartSlice] Applied fee exemption offline:', newAdjustment);

					return { success: true, adjustment: newAdjustment };
				} catch (error) {
					get().removePendingOperation(operationId);
					console.error('❌ [CartSlice] Failed to apply fee exemption offline:', error);
					throw error;
				}
			}

			// Online - use API
			const { applyFeeExempt } = await import('@/domains/orders/services/orderService');
			try {
				const response = await applyFeeExempt(orderId, reason || "Fee exemption requested");
				get().removePendingOperation(operationId);
				return response;
			} catch (error) {
				get().removePendingOperation(operationId);
				throw error;
			}
		},

		/**
		 * Remove an adjustment (one-off discount, price override, tax exempt, fee exempt)
		 * Works both online (via API) and offline (local state)
		 */
		removeAdjustment: async (adjustmentId) => {
			const orderId = get().orderId;
			if (!orderId) {
				throw new Error("No active order");
			}

			const operationId = buildOperationId("remove-adjustment", adjustmentId);
			get().addPendingOperation(operationId);

			// Check if offline
			if (cartGateway.isOfflineMode()) {
				try {
					const currentAdjustments = get().adjustments || [];
					const adjustmentToRemove = currentAdjustments.find(a => a.id === adjustmentId);

					if (!adjustmentToRemove) {
						get().removePendingOperation(operationId);
						console.warn('⚠️ [CartSlice] Adjustment not found:', adjustmentId);
						return { success: true }; // Already removed
					}

					// Remove the adjustment
					const newAdjustments = currentAdjustments.filter(a => a.id !== adjustmentId);

					// Handle special cases for exemptions
					const updates = {
						adjustments: newAdjustments,
					};

					// If removing a TAX_EXEMPT, reset the flag
					if (adjustmentToRemove.adjustment_type === "TAX_EXEMPT") {
						updates.isTaxExempt = false;
					}

					// If removing a FEE_EXEMPT, reset the flag
					if (adjustmentToRemove.adjustment_type === "FEE_EXEMPT") {
						updates.isFeeExempt = false;
					}

					// If removing a PRICE_OVERRIDE, revert the item price
					if (adjustmentToRemove.adjustment_type === "PRICE_OVERRIDE" && adjustmentToRemove.order_item) {
						const originalPrice = adjustmentToRemove.original_price;
						if (originalPrice !== undefined) {
							const items = get().items;
							updates.items = items.map(i =>
								i.id === adjustmentToRemove.order_item
									? { ...i, price_at_sale: originalPrice.toString() }
									: i
							);
						}
					}

					set(updates);

					// Recalculate totals
					await get().recalculateTotals();

					get().removePendingOperation(operationId);
					console.log('✅ [CartSlice] Removed adjustment offline:', adjustmentId);

					return { success: true };
				} catch (error) {
					get().removePendingOperation(operationId);
					console.error('❌ [CartSlice] Failed to remove adjustment offline:', error);
					throw error;
				}
			}

			// Online - use API
			const { removeAdjustment } = await import('@/domains/orders/services/orderService');
			try {
				const response = await removeAdjustment(orderId, adjustmentId);
				get().removePendingOperation(operationId);
				return response;
			} catch (error) {
				get().removePendingOperation(operationId);
				throw error;
			}
		},

		showToast: ({ title, description, variant = "default" }) => {
			toast({ title, description, variant });
		},

		clearCart: async () => {
			const orderId = get().orderId;
			if (!orderId) return;

			// Optimistic update
			set({
				items: [],
				subtotal: 0,
				total: 0,
				taxAmount: 0,
				appliedDiscounts: [],
				totalDiscountsAmount: 0,
				adjustments: [],
				totalAdjustmentsAmount: 0,
			});

			const operationId = buildOperationId("clear-cart", orderId);
			get().addPendingOperation(operationId);

			// Send through CartGateway (routes online/offline)
			await cartGateway.sendCartOperation({
				type: "clear_cart",
				operationId: operationId,
				payload: { order_id: orderId },
			});
		},

		holdOrder: async () => {
			const orderId = get().orderId;
			const isOfflineOrder = get().isOfflineOrder;

			if (!orderId || get().items.length === 0) {
				get().showToast({
					title: "Cannot Hold Order",
					description: "Cart is empty or no order is active.",
					variant: "default",
				});
				return;
			}

			// Cannot hold offline orders - they need to be completed or discarded
			if (isOfflineOrder || cartGateway.isOfflineMode()) {
				get().showToast({
					title: "Cannot Hold Offline Order",
					description: "Offline orders must be completed or discarded.",
					variant: "destructive",
				});
				return;
			}

			try {
				await orderService.holdOrder(orderId);
				get().showToast({
					title: "Order Held",
					description: `Order ${orderId.substring(0, 8)}... placed on hold.`,
				});
				get().resetCart();
			} catch (error) {
				console.error("Failed to hold order:", error);
				get().showToast({
					title: "Error Holding Order",
					description: "Could not place order on hold.",
					variant: "destructive",
				});
			}
		},

		resetCart: () => {
			get().disconnectCartSocket();
			// Clear local order ID in CartGateway
			cartGateway.clearLocalOrderId();
			// Also reset the tender state when starting a completely new cart
			if (get().resetTender) {
				get().resetTender();
			}
			set({
				...defaultCartState,
			});
			// No longer using localStorage for order ID.
		},

		loadCartFromOrderId: async (orderId) => {
			if (!orderId) {
				get().resetCart();
				return;
			}
			set({ isLoadingCart: true });
			try {
				const response = await orderService.getOrderById(orderId);
				const order = response.data;
				// Only resume if the order is in a workable state
				if (["PENDING", "HOLD", "DRAFT"].includes(order.status)) {
					await get().resumeCart(order);
					get().showToast({
						title: "Cart Loaded",
						description: `${order.order_number} loaded.`,
					});
				} else {
					// If order is completed or canceled, start a fresh cart
					get().showToast({
						title: "Order Already Processed",
						description: "Starting a new order instead.",
					});
					get().resetCart();
				}
			} catch (err) {
				console.error("Failed to load cart from orderId:", err);
				get().showToast({
					title: "Error Loading Order",
					description:
						"Could not fetch the specified order. Starting a new one.",
					variant: "destructive",
				});
				get().resetCart();
			} finally {
				set({ isLoadingCart: false });
			}
		},

		resumeCart: async (orderData) => {
			console.log(`⏱️ [TIMING] resumeCart called for order: ${orderData.id.substring(0, 8)}`);
			console.log(`⏱️ [TIMING] Disconnecting any existing socket...`);
			get().disconnectCartSocket(); // Disconnect from any previous socket
			console.log(`⏱️ [TIMING] Socket disconnected, setting cart state...`);

			set({
				items: orderData.items,
				orderId: orderData.id,
				orderStatus: orderData.status,
				total: safeParseFloat(orderData.grand_total),
				subtotal: safeParseFloat(orderData.subtotal),
				taxAmount: safeParseFloat(orderData.tax_total),
				totalDiscountsAmount: safeParseFloat(orderData.total_discounts_amount),
				appliedDiscounts: orderData.applied_discounts || [],
				adjustments: orderData.adjustments || [],
				customerFirstName: orderData.guest_first_name || "",
				diningPreference: orderData.dining_preference || "TAKE_OUT",
				isLoadingCart: false,
				socketConnected: false,
			});

			// Connect to the new order's socket and wait for it to be ready
			console.log(`⏱️ [TIMING] Resuming order: ${orderData.id.substring(0, 8)}, connecting socket...`);
			await get().initializeCartSocket();
			console.log(`⏱️ [TIMING] Socket ready for resumed order`);
		},

		// Customer name actions
		/**
		 * Recalculate cart totals using current state
		 * Used after modifying appliedDiscounts, items, or adjustments
		 */
		recalculateTotals: async () => {
			const items = get().items;
			const adjustments = get().adjustments || [];
			const appliedDiscounts = get().appliedDiscounts || [];

			// Ensure settings are loaded
			if (!cachedCalculationSettings) {
				await getCalculationSettingsFromCache();
			}

			const totals = calculateLocalTotals(items, adjustments, appliedDiscounts);

			set({
				subtotal: totals.subtotal,
				total: totals.total,
				taxAmount: totals.taxAmount,
				totalDiscountsAmount: totals.totalDiscountsAmount,
			});

			console.log('✅ [CartSlice] Totals recalculated:', {
				subtotal: totals.subtotal,
				total: totals.total,
				taxAmount: totals.taxAmount,
				discountTotal: totals.totalDiscountsAmount,
			});
		},

		setCustomerFirstName: async (firstName) => {
			set({ customerFirstName: firstName });

			// Update the backend if there's an active order (skip for offline orders)
			const orderId = get().orderId;
			const isOfflineOrder = get().isOfflineOrder;

			if (orderId && !isOfflineOrder && !cartGateway.isOfflineMode()) {
				try {
					await orderService.updateOrder(orderId, {
						guest_first_name: firstName || null
					});
				} catch (error) {
					console.error("Failed to update customer name in backend:", error);
					// Don't show toast error for this, as it's not critical for POS operation
				}
			}
			// For offline orders, the name is stored in local state and will be sent with the queued order
		},

		// Dining preference actions
		setDiningPreference: async (preference) => {
			set({ diningPreference: preference });

			// Update the backend if there's an active order (skip for offline orders)
			const orderId = get().orderId;
			const isOfflineOrder = get().isOfflineOrder;

			if (orderId && !isOfflineOrder && !cartGateway.isOfflineMode()) {
				try {
					await orderService.updateOrder(orderId, {
						dining_preference: preference
					});
				} catch (error) {
					console.error("Failed to update dining preference in backend:", error);
					// Don't show toast error for this, as it's not critical for POS operation
				}
			}
			// For offline orders, preference is stored in local state and will be sent with the queued order
		},
	};
};
