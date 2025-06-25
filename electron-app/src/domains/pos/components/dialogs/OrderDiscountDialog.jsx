import React, { useState } from "react";
import { usePosStore } from "@/domains/pos/store/posStore";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";

const OrderDiscountDialog = ({ open, onOpenChange }) => {
	const applyOrderDiscountViaSocket = usePosStore(
		(state) => state.applyOrderDiscountViaSocket
	);
	// In a real app, you would fetch these discounts.
	// For now, let's assume we have a discount with ID 1.
	const [discountId, setDiscountId] = useState(1);

	const handleSave = () => {
		applyOrderDiscountViaSocket(Number(discountId));
		onOpenChange(false); // Close the dialog
	};

	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
		>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Apply Order Discount</DialogTitle>
					<DialogDescription>
						Select a discount to apply to the entire order.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4 py-4">
					<div className="grid grid-cols-4 items-center gap-4">
						<Label
							htmlFor="discount"
							className="text-right"
						>
							Discount ID
						</Label>
						<Input
							id="discount"
							type="number"
							value={discountId}
							onChange={(e) => setDiscountId(e.target.value)}
							className="col-span-3"
						/>
					</div>
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						type="submit"
						onClick={handleSave}
					>
						Save Discount
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

export default OrderDiscountDialog;
