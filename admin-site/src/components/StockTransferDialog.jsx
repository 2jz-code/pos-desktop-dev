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
import { Textarea } from "./ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";
import { Alert, AlertDescription } from "./ui/alert";
import { ArrowRight, Package } from "lucide-react";
import { toast } from "sonner";
import inventoryService from "../services/api/inventoryService";
import productService from "../services/api/productService";
import SearchableSelect from "./shared/SearchableSelect";
import { ReasonInput } from "./inventory/ReasonInput";

const StockTransferDialog = ({
	isOpen,
	onOpenChange,
	product = null,
	onSuccess,
}) => {
	const [formData, setFormData] = useState({
		product_id: "",
		from_location_id: "",
		to_location_id: "",
		quantity: "",
		reason_id: "",
		detailed_reason: "",
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
				productService.getAllActiveProducts(), // Fetch all active products
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
			from_location_id: "",
			to_location_id: "",
		});
		fetchStockLevels(productId);
	};

	const handleQuantityChange = (e) => {
		const value = e.target.value;
		const fromLocationStock = stockLevels[formData.from_location_id] || 0;

		// Capping logic for decimal places
		const decimalRegex = /^\d*(\.\d{0,2})?$/;
		if (value !== "" && !decimalRegex.test(value)) {
			// If the input doesn't match the pattern (e.g., has > 2 decimal places),
			// we simply don't update the state, effectively ignoring the invalid character.
			return;
		}

		const numericValue = Number.parseFloat(value);

		// Cap the total value if it exceeds the maximum available stock
		if (!isNaN(numericValue) && numericValue > fromLocationStock) {
			setFormData({ ...formData, quantity: fromLocationStock.toString() });
			toast.info("Quantity adjusted to maximum available stock.");
		} else {
			setFormData({ ...formData, quantity: value });
		}
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (
			!formData.product_id ||
			!formData.from_location_id ||
			!formData.to_location_id ||
			!formData.quantity ||
			!formData.reason_id
		) {
			setError("Please fill in all required fields including reason");
			return;
		}

		if (formData.from_location_id === formData.to_location_id) {
			setError("Source and destination locations must be different");
			return;
		}

		if (parseFloat(formData.quantity) <= 0) {
			setError("Quantity must be greater than 0");
			return;
		}

		const fromLocationStock = stockLevels[formData.from_location_id] || 0;
		if (parseFloat(formData.quantity) > fromLocationStock) {
			setError(
				"Transfer quantity cannot exceed available stock at the source location."
			);
			return;
		}

		setLoading(true);
		setError("");

		try {
			const transferData = {
				product_id: parseInt(formData.product_id),
				from_location_id: parseInt(formData.from_location_id),
				to_location_id: parseInt(formData.to_location_id),
				quantity: parseFloat(formData.quantity),
				reason_id: parseInt(formData.reason_id),
				detailed_reason: formData.detailed_reason || "",
			};

			await inventoryService.transferStockWithReasons(transferData);

			const selectedProduct = Array.isArray(products)
				? products.find((p) => p.id.toString() === formData.product_id)
				: null;
			const selectedFromLocation = Array.isArray(locations)
				? locations.find((l) => l.id.toString() === formData.from_location_id)
				: null;
			const selectedToLocation = Array.isArray(locations)
				? locations.find((l) => l.id.toString() === formData.to_location_id)
				: null;

			toast.success("Stock Transferred", {
				description: `Transferred ${formData.quantity} units of ${selectedProduct?.name} from ${selectedFromLocation?.name} to ${selectedToLocation?.name}`,
			});

			if (onSuccess) {
				onSuccess();
			}

			handleClose();
		} catch (error) {
			console.error("Failed to transfer stock:", error);
			const errorMessage =
				error.response?.data?.message || "Failed to transfer stock";
			setError(errorMessage);
			toast.error("Stock Transfer Failed", {
				description: errorMessage,
			});
		} finally {
			setLoading(false);
		}
	};

	const handleClose = () => {
		setFormData({
			product_id: "",
			from_location_id: "",
			to_location_id: "",
			quantity: "",
			reason_id: "",
			detailed_reason: "",
		});
		setError("");
		setStockLevels({});
		onOpenChange(false);
	};

	const selectedFromLocation = Array.isArray(locations)
		? locations.find(
				(location) => location.id.toString() === formData.from_location_id
		  )
		: null;
	const selectedToLocation = Array.isArray(locations)
		? locations.find(
				(location) => location.id.toString() === formData.to_location_id
		  )
		: null;

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
				<DialogContent className="sm:max-w-4xl">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Package className="h-5 w-5" />
							Transfer Stock
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
			<DialogContent className="sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Package className="h-5 w-5" />
						Transfer Stock
					</DialogTitle>
					<DialogDescription>
						Move inventory between storage locations
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

					<div className="grid grid-cols-1 gap-4">
						<div className="space-y-2">
							<Label htmlFor="from_location">From Location *</Label>
							<Select
								value={formData.from_location_id}
								onValueChange={(value) =>
									setFormData({ ...formData, from_location_id: value })
								}
								disabled={!formData.product_id}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select source location" />
								</SelectTrigger>
								<SelectContent>
									{Array.isArray(locations) &&
										locations.map((location) => (
											<SelectItem
												key={location.id}
												value={location.id.toString()}
												disabled={
													!stockLevels[location.id] ||
													stockLevels[location.id] <= 0
												}
											>
												{location.name}
											</SelectItem>
										))}
								</SelectContent>
							</Select>
							{formData.from_location_id && (
								<p className="text-xs text-gray-500">
									Available: {stockLevels[formData.from_location_id] || 0}
								</p>
							)}
						</div>

						{selectedFromLocation && selectedToLocation && (
							<div className="flex items-center justify-center py-2">
								<div className="flex items-center gap-3 text-sm text-muted-foreground">
									<span className="font-medium">
										{selectedFromLocation.name}
									</span>
									<ArrowRight className="h-4 w-4" />
									<span className="font-medium">{selectedToLocation.name}</span>
								</div>
							</div>
						)}

						<div className="space-y-2">
							<Label htmlFor="to_location">To Location *</Label>
							<Select
								value={formData.to_location_id}
								onValueChange={(value) =>
									setFormData({ ...formData, to_location_id: value })
								}
								disabled={!formData.product_id}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select destination location" />
								</SelectTrigger>
								<SelectContent>
									{Array.isArray(locations) &&
										locations
											.filter(
												(location) =>
													location.id.toString() !== formData.from_location_id
											)
											.map((location) => (
												<SelectItem
													key={location.id}
													value={location.id.toString()}
												>
													{location.name}
												</SelectItem>
											))}
								</SelectContent>
							</Select>
							{formData.to_location_id && (
								<p className="text-xs text-gray-500">
									Current Stock: {stockLevels[formData.to_location_id] || 0}
								</p>
							)}
						</div>
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
							placeholder="Enter quantity to transfer"
							disabled={!formData.from_location_id}
						/>
					</div>

					<ReasonInput
						reasonValue={formData.reason_id}
						onReasonChange={(value) => setFormData({ ...formData, reason_id: value })}
						detailedReasonValue={formData.detailed_reason}
						onDetailedReasonChange={(value) => setFormData({ ...formData, detailed_reason: value })}
						categoryFilter="TRANSFER"
						reasonPlaceholder="Select reason for this stock transfer..."
						detailedReasonPlaceholder="Optional: Add more details about this transfer..."
						required={true}
						reasonLabel="Transfer Reason"
						detailedReasonLabel="Additional Details"
						reasonDescription="Select the primary reason for this stock transfer."
						detailedReasonDescription="Provide additional context about this transfer operation."
						layout="stacked"
						className="space-y-4"
					/>

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
							disabled={
								loading ||
								!formData.from_location_id ||
								!formData.to_location_id
							}
						>
							{loading ? "Transferring..." : "Transfer Stock"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
};

export default StockTransferDialog;
