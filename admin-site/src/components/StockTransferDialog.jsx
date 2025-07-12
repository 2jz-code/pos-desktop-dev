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

const StockTransferDialog = ({
	isOpen,
	onClose,
	product = null,
	onSuccess,
}) => {
	const [formData, setFormData] = useState({
		product_id: "",
		from_location_id: "",
		to_location_id: "",
		quantity: "",
		reason: "",
	});
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [products, setProducts] = useState([]);
	const [locations, setLocations] = useState([]);
	const [loadingData, setLoadingData] = useState(false);

	useEffect(() => {
		if (isOpen) {
			loadInitialData();
			if (product) {
				setFormData((prev) => ({
					...prev,
					product_id: product.id?.toString() || "",
				}));
			}
		}
	}, [isOpen, product]);

	const loadInitialData = async () => {
		setLoadingData(true);
		try {
			const [productsResponse, locationsResponse] = await Promise.all([
				productService.getProducts(),
				inventoryService.getLocations(),
			]);

			// Ensure products is always an array
			const productsData =
				productsResponse?.data ||
				productsResponse?.results ||
				productsResponse ||
				[];
			const locationsData =
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

		setLoading(true);
		setError("");

		try {
			await inventoryService.transferStock(
				parseInt(formData.product_id),
				parseInt(formData.from_location_id),
				parseInt(formData.to_location_id),
				parseFloat(formData.quantity),
				formData.reason
			);

			const selectedProduct = Array.isArray(products)
				? products.find((p) => p.id === parseInt(formData.product_id))
				: null;
			const selectedFromLocation = Array.isArray(locations)
				? locations.find((l) => l.id === parseInt(formData.from_location_id))
				: null;
			const selectedToLocation = Array.isArray(locations)
				? locations.find((l) => l.id === parseInt(formData.to_location_id))
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
			reason: "",
		});
		setError("");
		onClose();
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

	if (loadingData || !Array.isArray(products) || !Array.isArray(locations)) {
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
						<Select
							value={formData.product_id}
							onValueChange={(value) =>
								setFormData({ ...formData, product_id: value })
							}
							disabled={!!product}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select a product" />
							</SelectTrigger>
							<SelectContent>
								{Array.isArray(products) &&
									products.map((product) => (
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
