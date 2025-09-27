import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
	DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Calendar, Package, AlertTriangle, Clock } from "lucide-react";
import inventoryService from "@/services/api/inventoryService";
import productService from "@/services/api/productService";
import SearchableSelect from "./shared/SearchableSelect";

export function StockMetadataEditDialog({
	open,
	onOpenChange,
	stockItem,
	onSuccess
}) {
	const [formData, setFormData] = useState({
		product_id: "",
		location_id: "",
		expiration_date: "",
		low_stock_threshold: "",
		expiration_threshold: "",
	});
	const [isLoading, setIsLoading] = useState(false);
	const [loadingData, setLoadingData] = useState(false);
	const [products, setProducts] = useState([]);
	const [locations, setLocations] = useState([]);
	const [selectedStockRecord, setSelectedStockRecord] = useState(null);
	const { toast } = useToast();

	// Load initial data when dialog opens
	useEffect(() => {
		if (open) {
			if (stockItem) {
				// Editing a specific stock item
				setSelectedStockRecord(stockItem);
				setFormData({
					product_id: stockItem.product.id.toString(),
					location_id: stockItem.location.id.toString(),
					expiration_date: stockItem.expiration_date || "",
					low_stock_threshold: stockItem.low_stock_threshold || "",
					expiration_threshold: stockItem.expiration_threshold || "",
				});
			} else {
				// Search mode - load products and locations
				loadInitialData();
				setFormData({
					product_id: "",
					location_id: "",
					expiration_date: "",
					low_stock_threshold: "",
					expiration_threshold: "",
				});
				setSelectedStockRecord(null);
			}
		}
	}, [open, stockItem]);

	const loadInitialData = async () => {
		setLoadingData(true);
		try {
			const [productsResponse, locationsResponse] = await Promise.all([
				productService.getAllActiveProducts(),
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
			toast({
				title: "Error",
				description: "Failed to load products and locations.",
				variant: "destructive",
			});
		} finally {
			setLoadingData(false);
		}
	};

	const fetchStockRecord = async (productId, locationId) => {
		try {
			// Get all stock for the product
			const response = await inventoryService.getStockByProduct(productId);
			const stockData = response?.results || response || [];

			// Find the stock record for the specific location
			const stockRecord = stockData.find(
				stock => stock.location.id.toString() === locationId
			);

			if (stockRecord) {
				setSelectedStockRecord(stockRecord);
				setFormData((prev) => ({
					...prev,
					expiration_date: stockRecord.expiration_date || "",
					low_stock_threshold: stockRecord.low_stock_threshold || "",
					expiration_threshold: stockRecord.expiration_threshold || "",
				}));
			} else {
				toast({
					title: "Error",
					description: "No stock record found for this product at the selected location.",
					variant: "destructive",
				});
			}
		} catch (error) {
			console.error("Failed to fetch stock record:", error);
			toast({
				title: "Error",
				description: "Failed to fetch stock information.",
				variant: "destructive",
			});
		}
	};

	const handleProductChange = (productId) => {
		setFormData((prev) => ({ ...prev, product_id: productId, location_id: "" }));
		setSelectedStockRecord(null);
	};

	const handleLocationChange = (locationId) => {
		setFormData((prev) => {
			const updated = { ...prev, location_id: locationId };
			// Fetch stock record if both product and location are selected
			if (updated.product_id && locationId) {
				fetchStockRecord(updated.product_id, locationId);
			}
			return updated;
		});
	};

	const handleFormChange = (e) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
	};

	const handleSubmit = async (e) => {
		e.preventDefault();

		const stockRecordToUpdate = stockItem || selectedStockRecord;
		if (!stockRecordToUpdate) {
			toast({
				title: "Error",
				description: "Please select a product and location first.",
				variant: "destructive",
			});
			return;
		}

		setIsLoading(true);
		try {
			// Prepare payload with only the metadata fields
			const payload = {
				expiration_date: formData.expiration_date || null,
				low_stock_threshold: formData.low_stock_threshold ? parseFloat(formData.low_stock_threshold) : null,
				expiration_threshold: formData.expiration_threshold ? parseInt(formData.expiration_threshold) : null,
			};

			// Update using the stock management endpoint
			await inventoryService.updateStockRecord(stockRecordToUpdate.id, payload);

			toast({
				title: "Success",
				description: "Stock record updated successfully.",
			});

			// Notify parent component of success
			if (onSuccess) {
				onSuccess();
			}

			// Close dialog
			onOpenChange(false);
		} catch (error) {
			console.error("Failed to update stock record:", error);
			toast({
				title: "Error",
				description: error.response?.data?.message || "Failed to update stock record.",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
		}
	};

	const currentStock = stockItem || selectedStockRecord;
	const productOptions = products.map((p) => ({
		value: p.id.toString(),
		label: `${p.name} - ${p.barcode || "N/A"}`,
	}));

	if (loadingData) {
		return (
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Package className="h-5 w-5 text-blue-600" />
							Edit Stock Record
						</DialogTitle>
					</DialogHeader>
					<div className="flex items-center justify-center py-8">
						<div className="text-center">
							<Package className="h-8 w-8 animate-pulse mx-auto mb-2 text-slate-400" />
							<p className="text-slate-600">Loading products and locations...</p>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Package className="h-5 w-5 text-blue-600" />
						Edit Stock Metadata
					</DialogTitle>
					<DialogDescription>
						{currentStock ? (
							<>
								Update expiration dates and alert thresholds for{" "}
								<span className="font-medium">{currentStock.product?.name}</span>{" "}
								at <span className="font-medium">{currentStock.location?.name}</span>
							</>
						) : (
							"Search for a product and select a location to edit its stock record"
						)}
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-4">
					{/* Product Selection - only show if not editing a specific stock item */}
					{!stockItem && (
						<>
							<div className="space-y-2">
								<Label htmlFor="product">Product *</Label>
								<SearchableSelect
									options={productOptions}
									value={formData.product_id}
									onChange={handleProductChange}
									placeholder="Select a product"
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="location">Location *</Label>
								<Select
									value={formData.location_id}
									onValueChange={handleLocationChange}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select a location" />
									</SelectTrigger>
									<SelectContent>
										{locations.map((location) => (
											<SelectItem key={location.id} value={location.id.toString()}>
												{location.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</>
					)}

					{/* Current Quantity Display - only show if we have a stock record */}
					{currentStock && (
						<div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
							<div className="flex items-center justify-between">
								<span className="text-sm text-slate-600 dark:text-slate-400">Current Stock</span>
								<span className="font-medium">{currentStock.quantity}</span>
							</div>
						</div>
					)}

					{/* Expiration Date */}
					<div className="space-y-2">
						<Label htmlFor="expiration_date" className="flex items-center gap-2">
							<Calendar className="h-4 w-4 text-orange-600" />
							Expiration Date
						</Label>
						<Input
							id="expiration_date"
							name="expiration_date"
							type="date"
							value={formData.expiration_date}
							onChange={handleFormChange}
							placeholder="Leave empty if no expiration"
						/>
						<p className="text-xs text-slate-500">
							When this stock expires (leave empty for non-perishable items)
						</p>
					</div>

					{/* Low Stock Threshold */}
					<div className="space-y-2">
						<Label htmlFor="low_stock_threshold" className="flex items-center gap-2">
							<AlertTriangle className="h-4 w-4 text-yellow-600" />
							Low Stock Threshold
						</Label>
						<Input
							id="low_stock_threshold"
							name="low_stock_threshold"
							type="number"
							step="0.01"
							min="0"
							value={formData.low_stock_threshold}
							onChange={handleFormChange}
							placeholder={currentStock ? `Default: ${currentStock.effective_low_stock_threshold}` : "Default threshold"}
						/>
						<p className="text-xs text-slate-500">
							Alert when stock falls below this amount. Leave empty to use default{" "}
							{currentStock && `(${currentStock.effective_low_stock_threshold})`}
						</p>
					</div>

					{/* Expiration Threshold */}
					<div className="space-y-2">
						<Label htmlFor="expiration_threshold" className="flex items-center gap-2">
							<Clock className="h-4 w-4 text-red-600" />
							Expiration Alert (Days)
						</Label>
						<Input
							id="expiration_threshold"
							name="expiration_threshold"
							type="number"
							min="1"
							value={formData.expiration_threshold}
							onChange={handleFormChange}
							placeholder={currentStock ? `Default: ${currentStock.effective_expiration_threshold} days` : "Default threshold"}
						/>
						<p className="text-xs text-slate-500">
							Alert this many days before expiration. Leave empty to use default{" "}
							{currentStock && `(${currentStock.effective_expiration_threshold} days)`}
						</p>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={isLoading}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isLoading}>
							{isLoading ? "Saving..." : "Save Changes"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}