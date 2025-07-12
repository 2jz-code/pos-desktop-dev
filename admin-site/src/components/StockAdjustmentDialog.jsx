import React, { useState, useEffect } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Alert, AlertDescription } from "./ui/alert";
import { Package, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import inventoryService from "../services/api/inventoryService";
import productService from "../services/api/productService";
import SearchableSelect from "./shared/SearchableSelect";

const StockAdjustmentDialog = ({
	isOpen,
	onClose,
	product = null,
	onSuccess,
}) => {
	const [formData, setFormData] = useState({
		product_id: "",
		location_id: "",
		quantity: "",
		adjustment_type: "add", // 'add' or 'remove'
		reason: "",
	});
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [products, setProducts] = useState([]);
	const [locations, setLocations] = useState([]);
	const [loadingData, setLoadingData] = useState(false);
	const [stockLevels, setStockLevels] = useState({});

	useEffect(() => {
		if (isOpen) {
			loadInitialData();
			if (product) {
				setFormData((prev) => ({
					...prev,
					product_id: product.id?.toString() || "",
				}));
				fetchStockLevels(product.id);
			}
		}
	}, [isOpen, product]);

	const fetchStockLevels = async (productId) => {
		if (!productId) {
			setStockLevels({});
			return;
		}
		try {
			const response = await inventoryService.getStockByProduct(productId);
			const levels = (
				response.data?.results ||
				response.data ||
				response.results ||
				response
			).reduce((acc, stock) => {
				acc[stock.location.id] = stock.quantity;
				return acc;
			}, {});
			setStockLevels(levels);
		} catch (error) {
			console.error("Failed to fetch stock levels:", error);
			setStockLevels({});
		}
	};

	const loadInitialData = async () => {
		setLoadingData(true);
		try {
			const [productsResponse, locationsResponse] = await Promise.all([
				productService.getProducts({ limit: 1000 }), // Fetch more products
				inventoryService.getLocations(),
			]);

			const productsData =
				productsResponse?.data?.results ||
				productsResponse?.data ||
				productsResponse?.results ||
				productsResponse ||
				[];
			const locationsData =
				locationsResponse?.data?.results ||
				locationsResponse?.data ||
				locationsResponse?.results ||
				locationsResponse ||
				[];

			setProducts(Array.isArray(productsData) ? productsData : []);
			setLocations(Array.isArray(locationsData) ? locationsData : []);
		} catch (error) {
			console.error("Failed to load initial data:", error);
			setError("Failed to load products and locations");
			setProducts([]);
			setLocations([]);
		} finally {
			setLoadingData(false);
		}
	};

	const handleProductChange = (productId) => {
		setFormData({
			...formData,
			product_id: productId,
			location_id: "",
		});
		fetchStockLevels(productId);
	};

	const handleQuantityChange = (e) => {
		const value = e.target.value;
		const fromLocationStock = stockLevels[formData.location_id] || 0;

		// Capping logic for decimal places
		const decimalRegex = /^\d*(\.\d{0,2})?$/;
		if (value !== "" && !decimalRegex.test(value)) {
			// If the input doesn't match the pattern (e.g., has > 2 decimal places),
			// we simply don't update the state, effectively ignoring the invalid character.
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

			await inventoryService.adjustStock(
				parseInt(formData.product_id),
				parseInt(formData.location_id),
				quantity,
				formData.reason
			);

			const selectedProduct = Array.isArray(products)
				? products.find((p) => p.id.toString() === formData.product_id)
				: null;
			const selectedLocation = Array.isArray(locations)
				? locations.find((l) => l.id.toString() === formData.location_id)
				: null;

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
			const errorMessage =
				error.response?.data?.message || "Failed to adjust stock";
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
		});
		setError("");
		setStockLevels({});
		onClose();
	};

	const productOptions = products.map((p) => ({
		value: p.id.toString(),
		label: `${p.name} - ${p.barcode || "N/A"}`,
	}));

	if (loadingData) {
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
								{Array.isArray(locations) &&
									locations.map((location) => (
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
