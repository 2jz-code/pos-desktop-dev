import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { AlertTriangle, Package, Plus } from "lucide-react";
import { usePosStore } from "@/domains/pos/store/posStore";
import { useState } from "react";
import inventoryService from "@/domains/inventory/services/inventoryService";

const StockOverrideDialog = () => {
	const { stockOverrideDialog, forceAddItem, cancelStockOverride, showToast } =
		usePosStore((state) => ({
			stockOverrideDialog: state.stockOverrideDialog,
			forceAddItem: state.forceAddItem,
			cancelStockOverride: state.cancelStockOverride,
			showToast: state.showToast,
		}));

	const isQuantityUpdate = stockOverrideDialog.actionType === "quantity_update";

	const [showQuickRestock, setShowQuickRestock] = useState(false);
	const [restockQuantity, setRestockQuantity] = useState("10");
	const [isRestocking, setIsRestocking] = useState(false);

	const handleQuickRestock = async () => {
		if (!stockOverrideDialog.productId || !restockQuantity) return;

		setIsRestocking(true);
		try {
			await inventoryService.quickStockAdjustment(
				stockOverrideDialog.productId,
				parseInt(restockQuantity),
				"Quick restock during service - found items on shelf"
			);

			showToast({
				title: "Stock Updated",
				description: `Added ${restockQuantity} units to inventory`,
				variant: "default",
			});

			// Now force add the item
			forceAddItem();
		} catch (error) {
			console.error("Failed to quick restock:", error);
			showToast({
				title: "Restock Failed",
				description:
					"Could not update stock levels, but you can still add the item manually",
				variant: "destructive",
			});
		} finally {
			setIsRestocking(false);
		}
	};

	if (!stockOverrideDialog.show) return null;

	return (
		<Dialog
			open={stockOverrideDialog.show}
			onOpenChange={(open) => {
				if (!open) {
					cancelStockOverride();
				}
			}}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<AlertTriangle className="h-5 w-5 text-orange-500" />
						{isQuantityUpdate
							? "Cannot Increase Quantity"
							: "Item Appears Out of Stock"}
					</DialogTitle>
					<DialogDescription>
						{isQuantityUpdate
							? `Cannot increase quantity from ${stockOverrideDialog.currentQuantity} to ${stockOverrideDialog.requestedQuantity} - not enough stock available.`
							: "The system shows this item is out of stock, but you may have restocked without updating the inventory."}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<Alert>
						<Package className="h-4 w-4" />
						<AlertDescription className="text-sm">
							{stockOverrideDialog.message}
						</AlertDescription>
					</Alert>

					<div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
						<h4 className="font-semibold text-amber-800 text-sm mb-1">
							What to do:
						</h4>
						<ul className="text-sm text-amber-700 space-y-1">
							{isQuantityUpdate ? (
								<>
									<li>
										• Check if you have enough items on the shelf for{" "}
										{stockOverrideDialog.requestedQuantity} total
									</li>
									<li>• If available, click "Update Anyway" to override</li>
									<li>• Remember to update stock levels later in Inventory</li>
								</>
							) : (
								<>
									<li>
										• Check if the item is actually available on the shelf
									</li>
									<li>• If available, click "Add Anyway" to override</li>
									<li>• Remember to update stock levels later in Inventory</li>
								</>
							)}
						</ul>
					</div>

					{showQuickRestock && (
						<div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-3">
							<h4 className="font-semibold text-blue-800 text-sm">
								Quick Stock Update
							</h4>
							<div className="space-y-2">
								<Label
									htmlFor="restock-quantity"
									className="text-sm"
								>
									How many units did you find?
								</Label>
								<Input
									id="restock-quantity"
									type="number"
									value={restockQuantity}
									onChange={(e) => setRestockQuantity(e.target.value)}
									placeholder="10"
									className="w-full"
								/>
							</div>
							<div className="flex gap-2 justify-end">
								<Button
									variant="outline"
									size="sm"
									onClick={() => setShowQuickRestock(false)}
								>
									Cancel
								</Button>
								<Button
									size="sm"
									onClick={handleQuickRestock}
									disabled={isRestocking || !restockQuantity}
									className="bg-blue-600 hover:bg-blue-700"
								>
									{isRestocking ? "Updating..." : "Update & Add"}
								</Button>
							</div>
						</div>
					)}

					<div className="flex gap-2 justify-end">
						<Button
							variant="outline"
							onClick={cancelStockOverride}
						>
							Cancel
						</Button>
						{!showQuickRestock && (
							<Button
								variant="outline"
								onClick={() => setShowQuickRestock(true)}
								className="border-blue-300 text-blue-700 hover:bg-blue-50"
							>
								<Plus className="h-4 w-4 mr-1" />
								Quick Restock
							</Button>
						)}
						<Button
							onClick={forceAddItem}
							className="bg-orange-600 hover:bg-orange-700"
						>
							{isQuantityUpdate ? "Update Anyway" : "Add Anyway"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};

export default StockOverrideDialog;
