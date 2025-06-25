import React, { useState } from "react";
import { Package, Plus, Minus, RotateCcw } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "../../../shared/components/ui/dialog";
import { Button } from "../../../shared/components/ui/button";
import { Input } from "../../../shared/components/ui/input";
import { Label } from "../../../shared/components/ui/label";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "../../../shared/components/ui/card";
import { Badge } from "../../../shared/components/ui/badge";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "../../../shared/components/ui/tabs";
import BarcodeScanner from "../../../shared/components/common/BarcodeScanner";
import { useInventoryBarcodeOperations } from "../../../shared/hooks";

const BarcodeManagementDialog = ({ isOpen, onClose }) => {
	const [adjustmentQuantity, setAdjustmentQuantity] = useState("");
	const [activeTab, setActiveTab] = useState("lookup");

	const {
		lookupStock,
		adjustStock,
		clearBarcode,

		stockInfo,
		isLoadingStock,
		stockError,
		isAdjustingStock,
		hasStockResult,
	} = useInventoryBarcodeOperations();

	const handleScan = (barcode) => {
		lookupStock(barcode);
	};

	const handleStockAdjustment = (adjustmentType) => {
		if (!adjustmentQuantity || parseFloat(adjustmentQuantity) <= 0) {
			return;
		}

		adjustStock(parseFloat(adjustmentQuantity), adjustmentType);
		setAdjustmentQuantity("");
	};

	const handleClose = () => {
		clearBarcode();
		setAdjustmentQuantity("");
		setActiveTab("lookup");
		onClose();
	};

	const handleReset = () => {
		clearBarcode();
		setAdjustmentQuantity("");
	};

	return (
		<Dialog
			open={isOpen}
			onOpenChange={handleClose}
		>
			<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Package className="h-5 w-5" />
						Inventory Barcode Management
					</DialogTitle>
				</DialogHeader>

				<Tabs
					value={activeTab}
					onValueChange={setActiveTab}
					className="w-full"
				>
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="lookup">Stock Lookup</TabsTrigger>
						<TabsTrigger
							value="adjust"
							disabled={!hasStockResult}
						>
							Stock Adjustment
						</TabsTrigger>
					</TabsList>

					<TabsContent
						value="lookup"
						className="space-y-4"
					>
						{/* Barcode Scanner */}
						<BarcodeScanner
							onScan={handleScan}
							placeholder="Scan or enter product barcode"
							title="Stock Lookup Scanner"
							isLoading={isLoadingStock}
							autoFocus={isOpen}
						/>

						{/* Error State */}
						{stockError && (
							<Card className="border-destructive/50 bg-destructive/5">
								<CardContent className="pt-4">
									<p className="text-sm text-destructive">{stockError}</p>
								</CardContent>
							</Card>
						)}

						{/* Stock Information */}
						{hasStockResult && stockInfo && (
							<Card>
								<CardHeader>
									<CardTitle className="text-lg">Stock Information</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									{/* Product Info */}
									<div className="space-y-2">
										<h3 className="font-semibold">{stockInfo.product.name}</h3>
										<div className="flex gap-2 text-sm">
											<Badge variant="outline">
												Barcode: {stockInfo.product.barcode}
											</Badge>
											{stockInfo.product.track_inventory ? (
												<Badge variant="default">Tracked</Badge>
											) : (
												<Badge variant="secondary">Not Tracked</Badge>
											)}
										</div>
									</div>

									{/* Stock Details */}
									<div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
										<div>
											<Label className="text-sm text-muted-foreground">
												Location
											</Label>
											<p className="font-medium">{stockInfo.stock.location}</p>
										</div>
										<div>
											<Label className="text-sm text-muted-foreground">
												Current Stock
											</Label>
											<p
												className={`font-bold text-lg ${
													stockInfo.stock.quantity > 0
														? "text-green-600"
														: "text-red-600"
												}`}
											>
												{stockInfo.stock.quantity}
											</p>
										</div>
									</div>

									{/* Available Status */}
									<div className="flex items-center gap-2">
										<Badge
											variant={
												stockInfo.stock.is_available ? "default" : "destructive"
											}
										>
											{stockInfo.stock.is_available
												? "Available"
												: "Out of Stock"}
										</Badge>
									</div>

									{/* Action Buttons */}
									<div className="flex gap-2 pt-2">
										<Button
											onClick={() => setActiveTab("adjust")}
											disabled={!stockInfo.product.track_inventory}
										>
											Adjust Stock
										</Button>
										<Button
											variant="outline"
											onClick={handleReset}
										>
											<RotateCcw className="h-4 w-4 mr-2" />
											Scan Another
										</Button>
									</div>
								</CardContent>
							</Card>
						)}

						{/* Instructions when no scan yet */}
						{!hasStockResult && !stockError && !isLoadingStock && (
							<Card className="bg-muted/30">
								<CardContent className="pt-4">
									<p className="text-sm text-muted-foreground text-center">
										Scan a product barcode to view current stock levels
									</p>
								</CardContent>
							</Card>
						)}
					</TabsContent>

					<TabsContent
						value="adjust"
						className="space-y-4"
					>
						{hasStockResult && stockInfo && (
							<Card>
								<CardHeader>
									<CardTitle className="text-lg">
										Adjust Stock for {stockInfo.product.name}
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									{/* Current Stock Display */}
									<div className="p-4 bg-muted/30 rounded-lg">
										<Label className="text-sm text-muted-foreground">
											Current Stock
										</Label>
										<p className="font-bold text-xl">
											{stockInfo.stock.quantity}
										</p>
									</div>

									{/* Quantity Input */}
									<div className="space-y-2">
										<Label htmlFor="quantity">Adjustment Quantity</Label>
										<Input
											id="quantity"
											type="number"
											value={adjustmentQuantity}
											onChange={(e) => setAdjustmentQuantity(e.target.value)}
											placeholder="Enter quantity to add or subtract"
											min="0"
											step="0.01"
										/>
									</div>

									{/* Adjustment Buttons */}
									<div className="grid grid-cols-2 gap-4">
										<Button
											onClick={() => handleStockAdjustment("add")}
											disabled={!adjustmentQuantity || isAdjustingStock}
											className="bg-green-600 hover:bg-green-700"
										>
											<Plus className="h-4 w-4 mr-2" />
											Add Stock
										</Button>
										<Button
											onClick={() => handleStockAdjustment("subtract")}
											disabled={!adjustmentQuantity || isAdjustingStock}
											variant="destructive"
										>
											<Minus className="h-4 w-4 mr-2" />
											Remove Stock
										</Button>
									</div>

									{/* Back to Lookup */}
									<Button
										variant="outline"
										onClick={() => setActiveTab("lookup")}
										className="w-full"
									>
										Back to Lookup
									</Button>
								</CardContent>
							</Card>
						)}
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
};

export default BarcodeManagementDialog;
