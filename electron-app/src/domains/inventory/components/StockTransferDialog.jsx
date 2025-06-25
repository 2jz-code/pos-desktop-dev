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
import { usePosStore } from "@/domains/pos/store/posStore";

const StockTransferDialog = ({ isOpen, onClose }) => {
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
	const { products, locations, transferStock, currentEditingProduct } =
		usePosStore((state) => ({
			products: state.products, // from productSlice
			locations: state.locations, // from inventorySlice
			transferStock: state.transferStock, // from inventorySlice
			currentEditingProduct: state.currentEditingProduct, // from inventorySlice
		}));

	useEffect(() => {
		if (isOpen) {
			if (currentEditingProduct) {
				setFormData((prev) => ({
					...prev,
					product_id: currentEditingProduct.id.toString(),
				}));
			}
		}
	}, [isOpen, currentEditingProduct]);

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
				handleClose();
			} else {
				setError(result.error || "Failed to transfer stock");
			}
		} catch (error) {
			console.error("Failed to transfer stock:", error);
			setError("Failed to transfer stock");
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
		onClose();
	};

	const selectedFromLocation = locations.find(
		(location) => location.id.toString() === formData.from_location_id
	);
	const selectedToLocation = locations.find(
		(location) => location.id.toString() === formData.to_location_id
	);

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
						<Select
							value={formData.product_id}
							onValueChange={(value) =>
								setFormData({ ...formData, product_id: value })
							}
							disabled={!!currentEditingProduct}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select a product" />
							</SelectTrigger>
							<SelectContent>
								{products.map((product) => (
									<SelectItem
										key={product.id}
										value={product.id.toString()}
									>
										{product.name} - ${product.price}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="grid grid-cols-1 gap-4">
						<div className="space-y-2">
							<Label htmlFor="from_location">From Location *</Label>
							<Select
								value={formData.from_location_id}
								onValueChange={(value) =>
									setFormData({ ...formData, from_location_id: value })
								}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select source location" />
								</SelectTrigger>
								<SelectContent>
									{locations.map((location) => (
										<SelectItem
											key={location.id}
											value={location.id.toString()}
										>
											{location.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Transfer Direction Indicator */}
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
							onChange={(e) =>
								setFormData({ ...formData, quantity: e.target.value })
							}
							placeholder="Enter quantity to transfer"
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
							disabled={loading}
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
