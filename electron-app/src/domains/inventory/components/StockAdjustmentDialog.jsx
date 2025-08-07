import { useState, useEffect, useRef } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Plus, Minus, Package, Calendar } from "lucide-react";
import { toast } from "sonner";
import { usePosStore } from "@/domains/pos/store/posStore";
import SearchableSelect from "@/shared/components/SearchableSelect";
import { adjustStock as adjustStockAPI, getInventoryDefaults } from "@/domains/inventory/services/inventoryService";

const StockAdjustmentDialog = ({ isOpen, onClose, onOpenChange, product = null, onSuccess }) => {
	const [formData, setFormData] = useState({
		product_id: "",
		location_id: "",
		quantity: "",
		adjustment_type: "add", // 'add' or 'remove'
		reason: "",
		expiration_date: "",
		low_stock_threshold: "",
		expiration_threshold: "",
	});
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [defaults, setDefaults] = useState({
		default_low_stock_threshold: 10,
		default_expiration_threshold: 7
	});
	
	// Track if we've already initiated data loading to prevent duplicate calls
	const dataLoadInitiated = useRef(false);

	// Get data and actions from the store
	const { 
		products, 
		locations, 
		stockLevels, 
		isLoading, 
		adjustStock, 
		fetchLocations,
		fetchStockByProduct,
		fetchProducts
	} = usePosStore((state) => ({
		products: state.products,
		locations: state.locations,
		stockLevels: state.stockLevels,
		isLoading: state.isLoading,
		adjustStock: state.adjustStock,
		fetchLocations: state.fetchLocations,
		fetchStockByProduct: state.fetchStockByProduct,
		fetchProducts: state.fetchProducts,
	}));

	useEffect(() => {
		if (isOpen && !dataLoadInitiated.current) {
			dataLoadInitiated.current = true;
			
			// Load only missing data (reuse what's already in store)
			if (!products.length) {
				console.log("🔄 [StockAdjustmentDialog] Products not loaded, fetching products only");
				fetchProducts();
			} else {
				console.log("✅ [StockAdjustmentDialog] Products already loaded, reusing from store");
			}
			
			if (!locations.length) {
				console.log("🔄 [StockAdjustmentDialog] Locations not loaded, fetching locations only");
				fetchLocations();
			} else {
				console.log("✅ [StockAdjustmentDialog] Locations already loaded, reusing from store");
			}
			
			// Fetch global defaults (only if not already set)
			if (defaults.default_low_stock_threshold === 10 && defaults.default_expiration_threshold === 7) {
				console.log("🔄 [StockAdjustmentDialog] Defaults not loaded, fetching defaults only");
				const fetchDefaults = async () => {
					try {
						const defaultSettings = await getInventoryDefaults();
						setDefaults(defaultSettings);
					} catch (error) {
						console.error("Failed to fetch inventory defaults:", error);
					}
				};
				fetchDefaults();
			} else {
				console.log("✅ [StockAdjustmentDialog] Defaults already loaded, reusing existing values");
			}
		}
		
		// Handle product-specific logic separately (can change during dialog lifecycle)
		if (isOpen && product) {
			setFormData((prev) => ({
				...prev,
				product_id: product.id?.toString() || "",
			}));
			fetchStockByProduct(product.id);
		}
		
		// Reset the flag when dialog closes
		if (!isOpen) {
			dataLoadInitiated.current = false;
		}
	}, [isOpen, product]);

	const handleProductChange = (productId) => {
		setFormData({
			...formData,
			product_id: productId,
			location_id: "",
		});
		fetchStockByProduct(productId);
	};

	const handleQuantityChange = (e) => {
		const value = e.target.value;
		const fromLocationStock = stockLevels[formData.location_id] || 0;

		// Capping logic for decimal places
		const decimalRegex = /^\d*(\.\d{0,2})?$/;
		if (value !== "" && !decimalRegex.test(value)) {
			return;
		}

		const numericValue = Number.parseFloat(value);

		// Cap the total value if it exceeds the maximum available stock
		if (
			formData.adjustment_type === "remove" &&
			!isNaN(numericValue) &&
			numericValue > fromLocationStock
		) {
			setFormData({ ...formData, quantity: fromLocationStock.toString() });
			toast.info("Quantity adjusted to maximum available stock.");
		} else {
			setFormData({ ...formData, quantity: value });
		}
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (!formData.product_id || !formData.location_id || !formData.quantity) {
			setError("Please fill in all required fields");
			return;
		}

		if (parseFloat(formData.quantity) <= 0) {
			setError("Quantity must be greater than 0");
			return;
		}

		setLoading(true);
		setError("");

		try {
			const quantity =
				formData.adjustment_type === "add"
					? parseFloat(formData.quantity)
					: -parseFloat(formData.quantity);

			// Prepare the API payload with new fields
			const payload = {
				product_id: parseInt(formData.product_id),
				location_id: parseInt(formData.location_id),
				quantity: quantity,
			};

			// Add optional fields if provided
			if (formData.expiration_date) {
				payload.expiration_date = formData.expiration_date;
			}
			if (formData.low_stock_threshold) {
				payload.low_stock_threshold = parseFloat(formData.low_stock_threshold);
			}
			if (formData.expiration_threshold) {
				payload.expiration_threshold = parseInt(formData.expiration_threshold);
			}

			// Use the direct API call that supports the new fields
			const result = await adjustStockAPI(
				payload.product_id,
				payload.location_id,
				payload.quantity,
				payload.expiration_date,
				payload.low_stock_threshold,
				payload.expiration_threshold
			);

			const selectedProduct = products.find((p) => p.id.toString() === formData.product_id);
			const selectedLocation = (locations?.results || locations || []).find((l) => l.id.toString() === formData.location_id);

			toast.success("Stock Adjusted", {
				description: `${
					formData.adjustment_type === "add" ? "Added" : "Removed"
				} ${Math.abs(quantity)} units of ${selectedProduct?.name} at ${
					selectedLocation?.name
				}`,
			});

			if (onSuccess) {
				onSuccess();
			}

			handleClose();
		} catch (error) {
			console.error("Failed to adjust stock:", error);
			const errorMessage = "Failed to adjust stock";
			setError(errorMessage);
			toast.error("Stock Adjustment Failed", {
				description: errorMessage,
			});
		} finally {
			setLoading(false);
		}
	};

	const handleClose = () => {
		setFormData({
			product_id: "",
			location_id: "",
			quantity: "",
			adjustment_type: "add",
			reason: "",
			expiration_date: "",
			low_stock_threshold: "",
			expiration_threshold: "",
		});
		setError("");
		if (onOpenChange) {
			onOpenChange(false);
		} else if (onClose) {
			onClose();
		}
	};

	const productOptions = products.map((p) => ({
		value: p.id.toString(),
		label: `${p.name} - ${p.barcode || "N/A"}`,
	}));

	if (isLoading) {
		return (
			<Dialog
				open={isOpen}
				onOpenChange={handleClose}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Package className="h-5 w-5" />
							Adjust Stock
						</DialogTitle>
					</DialogHeader>
					<div className="flex items-center justify-center py-8">
						<div className="text-center">
							<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
							<p className="mt-2 text-sm text-muted-foreground">Loading...</p>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog
			open={isOpen}
			onOpenChange={handleClose}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Package className="h-5 w-5" />
						Adjust Stock
					</DialogTitle>
					<DialogDescription>
						Add or remove stock for a product at a specific location
					</DialogDescription>
				</DialogHeader>

				<form
					onSubmit={handleSubmit}
					className="space-y-4"
				>
					{error && (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<div className="space-y-2">
						<Label htmlFor="product">Product *</Label>
						<SearchableSelect
							options={productOptions}
							value={formData.product_id}
							onChange={handleProductChange}
							placeholder="Select a product"
							disabled={!!product}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="location">Location *</Label>
						<Select
							value={formData.location_id}
							onValueChange={(value) =>
								setFormData({ ...formData, location_id: value })
							}
							disabled={!formData.product_id}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select a location" />
							</SelectTrigger>
							<SelectContent>
								{(locations?.results || locations || []).map((location) => (
									<SelectItem
										key={location.id}
										value={location.id.toString()}
									>
										{location.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{formData.location_id && (
							<p className="text-xs text-gray-500">
								Available: {stockLevels[formData.location_id] || 0}
							</p>
						)}
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label>Adjustment Type *</Label>
							<Select
								value={formData.adjustment_type}
								onValueChange={(value) =>
									setFormData({ ...formData, adjustment_type: value })
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="add">
										<div className="flex items-center gap-2">
											<Plus className="h-4 w-4 text-green-600" />
											Add Stock
										</div>
									</SelectItem>
									<SelectItem value="remove">
										<div className="flex items-center gap-2">
											<Minus className="h-4 w-4 text-red-600" />
											Remove Stock
										</div>
									</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="quantity">Quantity *</Label>
							<Input
								id="quantity"
								type="number"
								min="0"
								step="0.01"
								value={formData.quantity}
								onChange={handleQuantityChange}
								placeholder="Enter quantity"
								disabled={!formData.location_id}
							/>
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor="reason">Reason (Optional)</Label>
						<Textarea
							id="reason"
							value={formData.reason}
							onChange={(e) =>
								setFormData({ ...formData, reason: e.target.value })
							}
							placeholder="Reason for adjustment (e.g., damaged goods, found extra stock)"
							rows={3}
						/>
					</div>

					<div className="space-y-4 border-t pt-4">
						<div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
							<Calendar className="h-4 w-4" />
							Expiration & Threshold Settings
						</div>
						
						<div className="space-y-2">
							<Label htmlFor="expiration_date">Expiration Date (Optional)</Label>
							<Input
								id="expiration_date"
								type="date"
								value={formData.expiration_date}
								onChange={(e) =>
									setFormData({ ...formData, expiration_date: e.target.value })
								}
								placeholder="Select expiration date"
							/>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="low_stock_threshold">Low Stock Threshold</Label>
								<Input
									id="low_stock_threshold"
									type="number"
									min="0"
									step="0.01"
									value={formData.low_stock_threshold}
									onChange={(e) =>
										setFormData({ ...formData, low_stock_threshold: e.target.value })
									}
									placeholder={`Default: ${defaults.default_low_stock_threshold}`}
								/>
								<p className="text-xs text-muted-foreground">
									Warn when stock falls below this level (leave empty for global default: {defaults.default_low_stock_threshold})
								</p>
							</div>

							<div className="space-y-2">
								<Label htmlFor="expiration_threshold">Expiration Warning (Days)</Label>
								<Input
									id="expiration_threshold"
									type="number"
									min="1"
									value={formData.expiration_threshold}
									onChange={(e) =>
										setFormData({ ...formData, expiration_threshold: e.target.value })
									}
									placeholder={`Default: ${defaults.default_expiration_threshold}`}
								/>
								<p className="text-xs text-muted-foreground">
									Warn this many days before expiration (leave empty for global default: {defaults.default_expiration_threshold})
								</p>
							</div>
						</div>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={handleClose}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={loading}
						>
							{loading ? "Adjusting..." : "Adjust Stock"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
};

export default StockAdjustmentDialog;