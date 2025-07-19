import { useState, useEffect } from "react";
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
import { Textarea } from "@/shared/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { ArrowRight, Package } from "lucide-react";
import { toast } from "sonner";
import { usePosStore } from "@/domains/pos/store/posStore";
import SearchableSelect from "@/shared/components/SearchableSelect";

const StockTransferDialog = ({ isOpen, onClose, onOpenChange, product = null, onSuccess }) => {
	const [formData, setFormData] = useState({
		product_id: "",
		from_location_id: "",
		to_location_id: "",
		quantity: "",
		reason: "",
	});
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	// Get data and actions from the store
	const { 
		products, 
		locations, 
		stockLevels, 
		isLoading, 
		transferStock, 
		loadInventoryData, 
		fetchStockByProduct 
	} = usePosStore((state) => ({
		products: state.products,
		locations: state.locations,
		stockLevels: state.stockLevels,
		isLoading: state.isLoading,
		transferStock: state.transferStock,
		loadInventoryData: state.loadInventoryData,
		fetchStockByProduct: state.fetchStockByProduct,
	}));

	useEffect(() => {
		if (isOpen) {
			// Load initial data if not already loaded
			if (!products.length || !locations.length) {
				loadInventoryData();
			}
			
			if (product) {
				setFormData((prev) => ({
					...prev,
					product_id: product.id?.toString() || "",
				}));
				fetchStockByProduct(product.id);
			}
		}
	}, [isOpen, product, products.length, locations.length, loadInventoryData, fetchStockByProduct]);

	const handleProductChange = (productId) => {
		setFormData({
			...formData,
			product_id: productId,
			from_location_id: "",
			to_location_id: "",
		});
		fetchStockByProduct(productId);
	};

	const handleQuantityChange = (e) => {
		const value = e.target.value;
		const fromLocationStock = stockLevels[formData.from_location_id] || 0;

		// Capping logic for decimal places
		const decimalRegex = /^\d*(\.\d{0,2})?$/;
		if (value !== "" && !decimalRegex.test(value)) {
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
			!formData.quantity
		) {
			setError("Please fill in all required fields");
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
			const result = await transferStock(
				parseInt(formData.product_id),
				parseInt(formData.from_location_id),
				parseInt(formData.to_location_id),
				parseFloat(formData.quantity)
			);

			if (result.success) {
				const selectedProduct = products.find((p) => p.id.toString() === formData.product_id);
				const selectedFromLocation = locations.find((l) => l.id.toString() === formData.from_location_id);
				const selectedToLocation = locations.find((l) => l.id.toString() === formData.to_location_id);

				toast.success("Stock Transferred", {
					description: `Transferred ${formData.quantity} units of ${selectedProduct?.name} from ${selectedFromLocation?.name} to ${selectedToLocation?.name}`,
				});

				if (onSuccess) {
					onSuccess();
				}

				handleClose();
			} else {
				const errorMessage = result.error || "Failed to transfer stock";
				setError(errorMessage);
				toast.error("Stock Transfer Failed", {
					description: errorMessage,
				});
			}
		} catch (error) {
			console.error("Failed to transfer stock:", error);
			const errorMessage = "Failed to transfer stock";
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
			reason: "",
		});
		setError("");
		if (onOpenChange) {
			onOpenChange(false);
		} else if (onClose) {
			onClose();
		}
	};

	const selectedFromLocation = locations.find(
		(location) => location.id.toString() === formData.from_location_id
	);
	const selectedToLocation = locations.find(
		(location) => location.id.toString() === formData.to_location_id
	);

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
				<DialogContent className="sm:max-w-lg">
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
			<DialogContent className="sm:max-w-lg">
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
									{locations.map((location) => (
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
									{locations
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

					<div className="space-y-2">
						<Label htmlFor="reason">Reason (Optional)</Label>
						<Textarea
							id="reason"
							value={formData.reason}
							onChange={(e) =>
								setFormData({ ...formData, reason: e.target.value })
							}
							placeholder="Reason for transfer (e.g., restocking, reorganization)"
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