"use client";

import { useState, useEffect } from "react";
import { usePosStore } from "@/domains/pos/store/posStore";
import { shallow } from "zustand/shallow";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { X, Plus, Minus, Edit3, ChevronDown, ChevronUp } from "lucide-react";
import { useDebouncedCallback } from "use-debounce";
import ProductModifierSelector from "../ProductModifierSelector";

export default function CartItem({ item }) {
	const { removeItemViaSocket, updateItemQuantityViaSocket, updateItemViaSocket, isUpdating } =
		usePosStore(
			(state) => ({
				removeItemViaSocket: state.removeItemViaSocket,
				updateItemQuantityViaSocket: state.updateItemQuantityViaSocket,
				updateItemViaSocket: state.updateItemViaSocket,
				isUpdating: state.updatingItems?.includes(item.id) ?? false,
			}),
			shallow
		);

	const [displayQuantity, setDisplayQuantity] = useState(item.quantity);
	const [showModifierEditor, setShowModifierEditor] = useState(false);
	const [showModifierDetails, setShowModifierDetails] = useState(false);

	const debouncedUpdate = useDebouncedCallback((newQuantity) => {
		if (newQuantity < 1) {
			removeItemViaSocket(item.id);
		} else {
			updateItemQuantityViaSocket(item.id, newQuantity);
		}
	}, 300);

	const handleQuantityChange = (newQuantity) => {
		setDisplayQuantity(newQuantity);
		debouncedUpdate(newQuantity);
	};

	const increment = () => {
		handleQuantityChange(displayQuantity + 1);
	};

	const decrement = () => {
		if (displayQuantity <= 0) return;
		handleQuantityChange(displayQuantity - 1);
	};

	useEffect(() => {
		setDisplayQuantity(item.quantity);
	}, [item.quantity]);

	const handleRemoveItem = () => {
		removeItemViaSocket(item.id);
	};

	const handleUpdateModifiers = (updatedItemData) => {
		// Update the item with new modifier selections
		updateItemViaSocket(item.id, {
			...updatedItemData,
			quantity: displayQuantity // Preserve current quantity
		});
	};

	if (!item.product) {
		return null;
	}

	// Helper function to check if item has modifiers
	const hasModifiers = item.selected_modifiers_snapshot && item.selected_modifiers_snapshot.length > 0;
	const hasModifierGroups = item.product.modifier_groups && item.product.modifier_groups.length > 0;
	const modifierTotalPrice = item.total_modifier_price ? parseFloat(item.total_modifier_price) : 0;

	return (
		<li
			className={`
        transition-all duration-200 rounded-lg border border-transparent overflow-hidden
        ${
					isUpdating
						? "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
						: "hover:bg-slate-50 dark:hover:bg-slate-800/30 hover:border-slate-200 dark:hover:border-slate-700"
				}
        ${showModifierDetails ? "border-slate-200 dark:border-slate-700 shadow-sm" : ""}
      `}
		>
			{/* Main Item Row */}
			<div className="p-3 flex items-center gap-3">
				{/* Product Image */}
				<div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0">
					<img
						src={
							item.product.image_url ||
							item.product.image ||
							`https://avatar.vercel.sh/${item.product.name}.png`
						}
						alt={item.product.name}
						className="w-full h-full object-cover"
					/>
				</div>

				{/* Product Info */}
				<div className="flex-grow min-w-0">
					<div className="flex items-center gap-2">
						<h4 className="font-medium text-slate-900 dark:text-slate-100 truncate">
							{item.product.name}
						</h4>
						
						{/* Modifier Indicator - Clean visual cue */}
						{hasModifiers && (
							<div className="flex items-center gap-1">
								<div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
								<span className="text-xs text-slate-500 dark:text-slate-400">
									{item.selected_modifiers_snapshot.length} mod{item.selected_modifiers_snapshot.length > 1 ? 's' : ''}
								</span>
							</div>
						)}
					</div>
					
					{/* Price Breakdown - Compact and clear */}
					<div className="flex items-center gap-3 mt-0.5">
						<span className="text-sm text-slate-600 dark:text-slate-400">
							${Number.parseFloat(item.product.price).toFixed(2)}
						</span>
						{modifierTotalPrice !== 0 && (
							<span className="text-sm text-blue-600 dark:text-blue-400">
								{modifierTotalPrice >= 0 ? '+' : ''}${modifierTotalPrice.toFixed(2)}
							</span>
						)}
					</div>
				</div>

				{/* Expand/Collapse Button - For items with modifiers */}
				{hasModifiers && (
					<Button
						variant="ghost"
						size="sm"
						className={`h-7 px-2 text-xs transition-colors duration-200 ${
							showModifierDetails 
								? "text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-950/20" 
								: "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
						}`}
						onClick={() => setShowModifierDetails(!showModifierDetails)}
					>
						{showModifierDetails ? (
							<><ChevronUp className="h-3 w-3 mr-1" />Hide</>
						) : (
							<><ChevronDown className="h-3 w-3 mr-1" />Show</>
						)}
					</Button>
				)}

				{/* Quantity Controls - Tighter spacing */}
				<div className="flex items-center gap-1">
					<Button
						variant="outline"
						size="icon"
						className="h-7 w-7 border-slate-300 dark:border-slate-600"
						onClick={decrement}
						disabled={isUpdating}
					>
						<Minus className="h-3 w-3" />
					</Button>

					<div className="w-8 text-center">
						<span
							className={`font-medium text-sm text-slate-900 dark:text-slate-100 ${
								isUpdating ? "opacity-50" : ""
							}`}
						>
							{displayQuantity}
						</span>
					</div>

					<Button
						variant="outline"
						size="icon"
						className="h-7 w-7 border-slate-300 dark:border-slate-600"
						onClick={increment}
						disabled={isUpdating}
					>
						<Plus className="h-3 w-3" />
					</Button>
				</div>

				{/* Total Price - Prominent */}
				<div className="w-16 text-right">
					<p className="font-semibold text-slate-900 dark:text-slate-100">
						${(displayQuantity * item.price_at_sale).toFixed(2)}
					</p>
				</div>

				{/* Remove Button */}
				<Button
					variant="ghost"
					size="icon"
					className="h-7 w-7 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
					onClick={handleRemoveItem}
					disabled={isUpdating}
				>
					<X className="h-3.5 w-3.5" />
				</Button>
			</div>

			{/* Expandable Modifier Details - Full Dropdown */}
			{showModifierDetails && hasModifiers && (
				<div className="border-t border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/30 animate-in slide-in-from-top-2 duration-200">
					<div className="p-4">
						{/* Modifier Grid */}
						<div className="mb-4">
							<div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
								Selected Modifiers:
							</div>
							<div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-1.5">
								{item.selected_modifiers_snapshot.map((modifier, index) => (
									<div 
										key={index} 
										className="bg-white dark:bg-slate-700 rounded p-1.5 border border-slate-200 dark:border-slate-600"
									>
										{/* Modifier Set Header within card */}
										<div className="text-xs text-slate-400 dark:text-slate-500 mb-0.5 uppercase tracking-wide font-medium">
											{modifier.modifier_set_name || 'Other'}
										</div>
										<div className="space-y-0.5">
											<div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
												{modifier.option_name}
											</div>
											<div className="flex items-center justify-between">
												{modifier.quantity > 1 && (
													<div className="text-xs text-slate-500 dark:text-slate-400">
														Qty: {modifier.quantity}
													</div>
												)}
												{parseFloat(modifier.price_at_sale) !== 0 && (
													<div className="text-xs font-medium text-blue-600 dark:text-blue-400">
														{parseFloat(modifier.price_at_sale) >= 0 ? '+' : ''}
														${parseFloat(modifier.price_at_sale).toFixed(2)}
													</div>
												)}
											</div>
										</div>
									</div>
								))}
							</div>
						</div>
						
						{/* Actions Row */}
						<div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-600">
							<div className="text-xs text-slate-500 dark:text-slate-400">
								{item.selected_modifiers_snapshot.length} modifier{item.selected_modifiers_snapshot.length > 1 ? 's' : ''} selected
							</div>
							
							{/* Edit Button - Now in the dropdown */}
							{hasModifierGroups && (
								<Button
									variant="outline"
									size="sm"
									className="h-8 px-3 text-xs border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700"
									onClick={() => setShowModifierEditor(true)}
									disabled={isUpdating}
								>
									<Edit3 className="h-3 w-3 mr-1.5" />
									Edit Modifiers
								</Button>
							)}
						</div>
					</div>
				</div>
			)}
			
			{/* Modifier Editor Dialog */}
			{showModifierEditor && (
				<ProductModifierSelector
					product={item.product}
					open={showModifierEditor}
					onOpenChange={setShowModifierEditor}
					onAddToCart={handleUpdateModifiers}
					initialQuantity={displayQuantity}
					editMode={true}
					existingSelections={item.selected_modifiers_snapshot}
				/>
			)}
		</li>
	);
}
