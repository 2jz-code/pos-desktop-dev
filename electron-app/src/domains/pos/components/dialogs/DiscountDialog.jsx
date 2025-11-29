import { useState, useEffect } from "react";
import { getAvailableDiscounts } from "@/domains/discounts/services/discountService";
import { usePosStore } from "@/domains/pos/store/posStore";
import { Loader2, WifiOff } from "lucide-react";
import { shallow } from "zustand/shallow";

/**
 * Check if device is online
 */
const isOnline = () => typeof navigator !== 'undefined' ? navigator.onLine : true;
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
	const [isFromCache, setIsFromCache] = useState(false);

	useEffect(() => {
		if (isDiscountDialogOpen) {
			const fetchDiscounts = async () => {
				setIsLoading(true);
				setError(null);
				setIsFromCache(false);

				let discounts = null;

				// Step 1: Try offline cache first
				if (window.offlineAPI?.getCachedDiscounts) {
					try {
						console.log("📦 [DiscountDialog] Trying discounts cache first...");
						const cachedDiscounts = await window.offlineAPI.getCachedDiscounts();

						if (Array.isArray(cachedDiscounts) && cachedDiscounts.length > 0) {
							// Filter for promotional discounts (no code, is_active)
							discounts = cachedDiscounts.filter((d) => !d.code && d.is_active);
							setIsFromCache(true);
							console.log(`✅ [DiscountDialog] Loaded ${discounts.length} promotional discounts from cache`);
						}
					} catch (cacheError) {
						console.warn("⚠️ [DiscountDialog] Cache failed:", cacheError);
					}
				}

				// Step 2: Fall back to API if cache empty/failed AND we're online
				if (!discounts && isOnline()) {
					try {
						console.log("🌐 [DiscountDialog] Loading discounts from API...");
						const response = await getAvailableDiscounts();
						const apiDiscounts = response.data?.results || response.data || [];
						discounts = apiDiscounts.filter((d) => !d.code);
						console.log(`✅ [DiscountDialog] Loaded ${discounts.length} promotional discounts from API`);
					} catch (err) {
						console.error("❌ [DiscountDialog] API request failed:", err);
						if (!discounts) {
							setError("Failed to fetch discounts. Please try again.");
						}
					}
				}

				// Step 3: Handle no data scenario
				if (!discounts) {
					console.warn("⚠️ [DiscountDialog] No discounts available");
					discounts = [];
					if (!isOnline()) {
						setError("Offline - no cached discounts available");
					}
				}

				setPromotionalDiscounts(discounts);
				setIsLoading(false);
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
					<DialogTitle className="flex items-center gap-2">
						Apply a Discount
						{isFromCache && (
							<span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
								<WifiOff className="h-3 w-3" />
								offline
							</span>
						)}
					</DialogTitle>
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
