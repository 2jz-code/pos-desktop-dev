// desktop-combined/electron-app/src/features/pos/components/dialogs/DiscountDialog.jsx
import { useState, useEffect } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
	DialogDescription,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { getAvailableDiscounts } from "@/domains/discounts/services/discountService";
import { usePosStore } from "@/domains/pos/store/posStore";
import { Loader2 } from "lucide-react";
import { shallow } from "zustand/shallow";

const DiscountDialog = () => {
	const { isDiscountDialogOpen, setIsDiscountDialogOpen, applyDiscount } =
		usePosStore(
			(state) => ({
				isDiscountDialogOpen: state.isDiscountDialogOpen,
				setIsDiscountDialogOpen: state.setIsDiscountDialogOpen,
				applyDiscount: state.applyDiscountViaSocket,
			}),
			shallow
		);

	const [discounts, setDiscounts] = useState([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);

	useEffect(() => {
		if (isDiscountDialogOpen) {
			const fetchDiscounts = async () => {
				setIsLoading(true);
				setError(null);
				try {
					const response = await getAvailableDiscounts();
					setDiscounts(response.data);
				} catch (err) {
					setError("Failed to fetch discounts. Please try again.");
					console.error(err);
				} finally {
					setIsLoading(false);
				}
			};
			fetchDiscounts();
		}
	}, [isDiscountDialogOpen]);

	const handleApplyDiscount = (discountId) => {
		applyDiscount(discountId);
		setIsDiscountDialogOpen(false);
	};

	return (
		<Dialog
			open={isDiscountDialogOpen}
			onOpenChange={setIsDiscountDialogOpen}
		>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Apply a Discount</DialogTitle>
					<DialogDescription>
						Select a discount to apply to the entire order.
					</DialogDescription>
				</DialogHeader>
				<div className="py-4">
					{isLoading && (
						<div className="flex items-center justify-center h-72">
							<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
						</div>
					)}
					{error && <p className="text-red-500 h-72">{error}</p>}
					{!isLoading && !error && (
						<ScrollArea className="h-72">
							<div className="space-y-2 pr-4">
								{discounts.length > 0 ? (
									discounts.map((discount) => (
										<Button
											key={discount.id}
											variant="outline"
											className="w-full justify-start p-4 h-auto"
											onClick={() => handleApplyDiscount(discount.id)}
										>
											<div className="flex flex-col items-start">
												<span className="font-semibold">{discount.name}</span>
												<span className="text-xs text-muted-foreground">
													{discount.description}
												</span>
											</div>
										</Button>
									))
								) : (
									<div className="flex items-center justify-center h-72">
										<p>No discounts available.</p>
									</div>
								)}
							</div>
						</ScrollArea>
					)}
				</div>
				<DialogFooter>
					<Button
						variant="secondary"
						onClick={() => setIsDiscountDialogOpen(false)}
					>
						Cancel
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

export default DiscountDialog;
