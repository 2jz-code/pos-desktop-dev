import { useState, useEffect } from "react";
import { getAvailableDiscounts } from "@/domains/discounts/services/discountService";
import { usePosStore } from "@/domains/pos/store/posStore";
import { Loader2 } from "lucide-react";
import { shallow } from "zustand/shallow";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/shared/components/ui/dialog";
import {
	Tabs,
	TabsList,
	TabsTrigger,
	TabsContent,
} from "@/shared/components/ui/tabs";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { ScrollArea } from "@/shared/components/ui/scroll-area";

const DiscountDialog = () => {
	const {
		isDiscountDialogOpen,
		setIsDiscountDialogOpen,
		applyDiscount,
		applyDiscountCode,
	} = usePosStore(
		(state) => ({
			isDiscountDialogOpen: state.isDiscountDialogOpen,
			setIsDiscountDialogOpen: state.setIsDiscountDialogOpen,
			applyDiscount: state.applyDiscountViaSocket,
			applyDiscountCode: state.applyDiscountCodeViaSocket,
		}),
		shallow
	);

	const [promotionalDiscounts, setPromotionalDiscounts] = useState([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);
	const [discountCodeInput, setDiscountCodeInput] = useState("");

	useEffect(() => {
		if (isDiscountDialogOpen) {
			const fetchDiscounts = async () => {
				setIsLoading(true);
				setError(null);
				try {
					const response = await getAvailableDiscounts();
					setPromotionalDiscounts(response.data.filter((d) => !d.code));
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

	const handleApplyPromotionalDiscount = (discountId) => {
		applyDiscount(discountId);
		setIsDiscountDialogOpen(false);
	};

	const handleApplyCode = () => {
		if (!discountCodeInput.trim()) return;
		applyDiscountCode(discountCodeInput);
		setDiscountCodeInput("");
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
						Select a promotion or enter a code to apply a discount.
					</DialogDescription>
				</DialogHeader>

				<Tabs
					defaultValue="promotions"
					className="py-4"
				>
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="promotions">Promotions</TabsTrigger>
						<TabsTrigger value="code">Enter Code</TabsTrigger>
					</TabsList>

					<TabsContent value="promotions">
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
										{promotionalDiscounts.length > 0 ? (
											promotionalDiscounts.map((discount) => (
												<Button
													key={discount.id}
													variant="outline"
													className="w-full justify-start p-4 h-auto"
													onClick={() =>
														handleApplyPromotionalDiscount(discount.id)
													}
												>
													<div className="flex flex-col items-start">
														<span className="font-semibold">
															{discount.name}
														</span>
														<span className="text-xs text-muted-foreground">
															{discount.description}
														</span>
													</div>
												</Button>
											))
										) : (
											<div className="flex items-center justify-center h-72">
												<p>No promotional discounts available.</p>
											</div>
										)}
									</div>
								</ScrollArea>
							)}
						</div>
					</TabsContent>

					<TabsContent value="code">
						<div className="py-4 h-[22.5rem] flex flex-col justify-center">
							<div className="space-y-4">
								<Label htmlFor="discount-code">Discount Code</Label>
								<Input
									id="discount-code"
									placeholder="Enter code, e.g., SUMMER20"
									value={discountCodeInput}
									onChange={(e) => setDiscountCodeInput(e.target.value)}
								/>
								<Button
									onClick={handleApplyCode}
									className="w-full"
								>
									Apply Code
								</Button>
							</div>
						</div>
					</TabsContent>
				</Tabs>

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
