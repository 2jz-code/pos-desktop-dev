import { useState, useEffect } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Minus, Package } from "lucide-react";
import { usePosStore } from "@/store/posStore";

const StockAdjustmentDialog = ({ isOpen, onClose }) => {
	const [formData, setFormData] = useState({
		product_id: "",
		location_id: "",
		quantity: "",
		adjustment_type: "add", // 'add' or 'remove'
		reason: "",
	});
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	// Get data and actions from the store
	const { products, locations, adjustStock, currentEditingProduct } =
		usePosStore((state) => ({
			products: state.products,
			locations: state.locations,
			adjustStock: state.adjustStock,
			currentEditingProduct: state.currentEditingProduct,
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
		if (!formData.product_id || !formData.location_id || !formData.quantity) {
			setError("Please fill in all required fields");
			return;
		}

		setLoading(true);
		setError("");

		try {
			const quantity =
				formData.adjustment_type === "add"
					? parseFloat(formData.quantity)
					: -parseFloat(formData.quantity);

			const result = await adjustStock(
				parseInt(formData.product_id),
				parseInt(formData.location_id),
				quantity
			);

			if (result.success) {
				handleClose();
			} else {
				setError(result.error || "Failed to adjust stock");
			}
		} catch (error) {
			console.error("Failed to adjust stock:", error);
			setError("Failed to adjust stock");
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
		onClose();
	};

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

					<div className="space-y-2">
						<Label htmlFor="location">Location *</Label>
						<Select
							value={formData.location_id}
							onValueChange={(value) =>
								setFormData({ ...formData, location_id: value })
							}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select a location" />
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
								onChange={(e) =>
									setFormData({ ...formData, quantity: e.target.value })
								}
								placeholder="Enter quantity"
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
