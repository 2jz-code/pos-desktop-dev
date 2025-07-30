"use client";

import { useState } from "react";
import { usePosStore } from "@/domains/pos/store/posStore";
import { shallow } from "zustand/shallow";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { X, Plus, Minus, Edit3, ChevronDown, ChevronRight } from "lucide-react";
import ProductModifierSelector from "../ProductModifierSelector";

export default function GroupedCartItem({ baseProduct, items }) {
	const {
		removeItemViaSocket,
		updateItemQuantityViaSocket,
		updateItemViaSocket,
		isUpdating,
	} = usePosStore(
		(state) => ({
			removeItemViaSocket: state.removeItemViaSocket,
			updateItemQuantityViaSocket: state.updateItemQuantityViaSocket,
			updateItemViaSocket: state.updateItemViaSocket,
			isUpdating: items.some(
				(item) => state.updatingItems?.includes(item.id) ?? false
			),
		}),
		shallow
	);

	const [expanded, setExpanded] = useState(false);
	const [showModifierEditor, setShowModifierEditor] = useState(false);
	const [editingItem, setEditingItem] = useState(null);

	// Calculate totals with proper type conversion
	const totalPrice = items.reduce(
		(sum, item) => sum + item.quantity * parseFloat(item.price_at_sale || 0),
		0
	);

	const handleEditItem = (item) => {
		setEditingItem(item);
		setShowModifierEditor(true);
	};

	const handleUpdateModifiers = (updatedItemData) => {
		if (editingItem) {
			updateItemViaSocket(editingItem.id, {
				...updatedItemData,
				quantity: editingItem.quantity, // Preserve current quantity
			});
		}
		setShowModifierEditor(false);
		setEditingItem(null);
	};

	const handleRemoveItem = (item) => {
		removeItemViaSocket(item.id);
	};

	// If only one item, render as individual item (but with grouping styling)
	if (items.length === 1) {
		const item = items[0];
		const hasItemModifiers =
			item.selected_modifiers_snapshot &&
			item.selected_modifiers_snapshot.length > 0;

		return (
			<li className="transition-all duration-200 rounded-lg border border-transparent overflow-hidden hover:bg-slate-50 dark:hover:bg-slate-800/30 hover:border-slate-200 dark:hover:border-slate-700">
				<div
					className={`p-3 flex items-center gap-3 ${
						hasItemModifiers ? "cursor-pointer" : ""
					}`}
					onClick={() => hasItemModifiers && setExpanded(!expanded)}
				>
					{/* Chevron Indicator - Only for items with modifiers */}
					{hasItemModifiers && (
						<div className="flex-shrink-0">
							{expanded ? (
								<ChevronDown className="h-4 w-4 text-slate-400" />
							) : (
								<ChevronRight className="h-4 w-4 text-slate-400" />
							)}
						</div>
					)}

					{/* Product Image */}
					<div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0">
						<img
							src={
								baseProduct.image_url ||
								baseProduct.image ||
								`https://avatar.vercel.sh/${baseProduct.name}.png`
							}
							alt={baseProduct.name}
							className="w-full h-full object-cover"
						/>
					</div>

					{/* Product Info */}
					<div className="flex-grow min-w-0">
						<div className="flex items-center gap-2">
							<h4 className="font-medium text-slate-900 dark:text-slate-100 truncate">
								{baseProduct.name}
							</h4>
							{hasItemModifiers && (
								<div className="flex items-center gap-1">
									<div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
									<span className="text-xs text-slate-500 dark:text-slate-400">
										{item.selected_modifiers_snapshot.length} mod
										{item.selected_modifiers_snapshot.length > 1 ? "s" : ""}
									</span>
								</div>
							)}
						</div>

						<div className="flex items-center gap-3 mt-0.5">
							<span className="text-sm text-slate-600 dark:text-slate-400">
								${Number.parseFloat(baseProduct.price).toFixed(2)}
							</span>
							{item.total_modifier_price &&
								parseFloat(item.total_modifier_price) !== 0 && (
									<span className="text-sm text-blue-600 dark:text-blue-400">
										{parseFloat(item.total_modifier_price) >= 0 ? "+" : ""}$
										{parseFloat(item.total_modifier_price).toFixed(2)}
									</span>
								)}
						</div>
					</div>

					{/* Quantity Controls */}
					<div
						className="flex items-center gap-1"
						onClick={(e) => e.stopPropagation()}
					>
						<Button
							variant="outline"
							size="icon"
							className="h-7 w-7 border-slate-300 dark:border-slate-600"
							onClick={() =>
								updateItemQuantityViaSocket(
									item.id,
									Math.max(0, item.quantity - 1)
								)
							}
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
								{item.quantity}
							</span>
						</div>

						<Button
							variant="outline"
							size="icon"
							className="h-7 w-7 border-slate-300 dark:border-slate-600"
							onClick={() =>
								updateItemQuantityViaSocket(item.id, item.quantity + 1)
							}
							disabled={isUpdating}
						>
							<Plus className="h-3 w-3" />
						</Button>
					</div>

					{/* Total Price */}
					<div className="w-16 text-right">
						<p className="font-semibold text-slate-900 dark:text-slate-100">
							$
							{(item.quantity * parseFloat(item.price_at_sale || 0)).toFixed(2)}
						</p>
					</div>

					{/* Remove Button */}
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
						onClick={(e) => {
							e.stopPropagation();
							handleRemoveItem(item);
						}}
						disabled={isUpdating}
					>
						<X className="h-3.5 w-3.5" />
					</Button>
				</div>

				{/* Expandable Modifier Details */}
				{expanded && hasItemModifiers && (
					<div className="border-t border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/30 animate-in slide-in-from-top-2 duration-200">
						<div className="p-4">
							<div className="mb-4">
								<div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
									Selected Modifiers:
								</div>
								<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
									{item.selected_modifiers_snapshot.map((modifier, index) => (
										<div
											key={index}
											className="bg-white dark:bg-slate-700 rounded-lg p-2.5 border border-slate-200 dark:border-slate-600"
										>
											{/* Modifier Set Header within card */}
											<div className="text-xs text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-wide">
												{modifier.modifier_set_name || 'Other'}
											</div>
											<div className="flex items-center justify-between">
												<div className="flex-grow min-w-0">
													<div className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">
														{modifier.option_name}
													</div>
													{modifier.quantity > 1 && (
														<div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
															Quantity: {modifier.quantity}
														</div>
													)}
												</div>
												{parseFloat(modifier.price_at_sale) !== 0 && (
													<div className="text-sm font-medium text-blue-600 dark:text-blue-400 ml-2">
														{parseFloat(modifier.price_at_sale) >= 0 ? "+" : ""}
														${parseFloat(modifier.price_at_sale).toFixed(2)}
													</div>
												)}
											</div>
										</div>
									))}
								</div>
							</div>

							<div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-600">
								<div className="text-xs text-slate-500 dark:text-slate-400">
									{item.selected_modifiers_snapshot.length} modifier
									{item.selected_modifiers_snapshot.length > 1 ? "s" : ""}{" "}
									selected
								</div>

								<Button
									variant="outline"
									size="sm"
									className="h-8 px-3 text-xs border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700"
									onClick={() => handleEditItem(item)}
									disabled={isUpdating}
								>
									<Edit3 className="h-3 w-3 mr-1.5" />
									Edit Modifiers
								</Button>
							</div>
						</div>
					</div>
				)}

				{/* Modifier Editor Dialog */}
				{showModifierEditor && editingItem && (
					<ProductModifierSelector
						product={baseProduct}
						open={showModifierEditor}
						onOpenChange={setShowModifierEditor}
						onAddToCart={handleUpdateModifiers}
						initialQuantity={editingItem.quantity}
						editMode={true}
						existingSelections={editingItem.selected_modifiers_snapshot}
					/>
				)}
			</li>
		);
	}

	// Multiple items - show grouped view
	return (
		<li
			className={`
			transition-all duration-200 rounded-lg border border-transparent overflow-hidden
			${
				isUpdating
					? "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
					: "hover:bg-slate-50 dark:hover:bg-slate-800/30 hover:border-slate-200 dark:hover:border-slate-700"
			}
			${expanded ? "border-slate-200 dark:border-slate-700 shadow-sm" : ""}
		`}
		>
			{/* Grouped Header */}
			<div
				className="p-3 flex items-center gap-3 cursor-pointer"
				onClick={() => setExpanded(!expanded)}
			>
				{/* Chevron Indicator */}
				<div className="flex-shrink-0">
					{expanded ? (
						<ChevronDown className="h-4 w-4 text-slate-400" />
					) : (
						<ChevronRight className="h-4 w-4 text-slate-400" />
					)}
				</div>

				{/* Product Image */}
				<div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0">
					<img
						src={
							baseProduct.image_url ||
							baseProduct.image ||
							`https://avatar.vercel.sh/${baseProduct.name}.png`
						}
						alt={baseProduct.name}
						className="w-full h-full object-cover"
					/>
				</div>

				{/* Product Info */}
				<div className="flex-grow min-w-0">
					<div className="flex items-center gap-2">
						<h4 className="font-medium text-slate-900 dark:text-slate-100">
							{baseProduct.name}
						</h4>
					</div>
					<p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
						<Badge
							variant="secondary"
							className="text-xs"
						>
							{items.length} variations
						</Badge>{" "}
					</p>
				</div>

				{/* Total Price */}
				<div className="text-right">
					<p className="font-semibold text-slate-900 dark:text-slate-100">
						${totalPrice.toFixed(2)}
					</p>
				</div>
			</div>

			{/* Individual Variations */}
			{expanded && (
				<div className="border-t bg-slate-50/50 dark:bg-slate-800/30 animate-in slide-in-from-top-2 duration-200">
					{items.map((item, index) => (
						<div
							key={item.id}
							className="p-3 border-b last:border-b-0 border-slate-100 dark:border-slate-700/50"
						>
							<div className="flex items-center gap-3">
								{/* Sequence Number */}
								<span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded font-medium">
									#{item.item_sequence || index + 1}
								</span>

								{/* Modifier Details */}
								<div className="flex-grow">
									{item.selected_modifiers_snapshot &&
									item.selected_modifiers_snapshot.length > 0 ? (
										<div className="flex flex-wrap gap-1">
											{item.selected_modifiers_snapshot.map((mod, i) => (
												<span
													key={i}
													className="text-xs bg-white dark:bg-slate-700 px-2 py-1 rounded border border-slate-200 dark:border-slate-600"
												>
													{mod.option_name}
													{parseFloat(mod.price_at_sale) !== 0 && (
														<span className="text-blue-600 dark:text-blue-400 ml-1">
															{parseFloat(mod.price_at_sale) >= 0 ? "+" : ""}$
															{parseFloat(mod.price_at_sale).toFixed(2)}
														</span>
													)}
												</span>
											))}
										</div>
									) : (
										<span className="text-slate-500 dark:text-slate-400 text-xs">
											Standard
										</span>
									)}
								</div>

								{/* Item Controls */}
								<div className="flex items-center gap-2">
									{/* Edit Button */}
									<Button
										variant="outline"
										size="sm"
										className="h-7 px-2 text-xs"
										onClick={() => handleEditItem(item)}
									>
										<Edit3 className="h-3 w-3 mr-1" />
										Edit
									</Button>

									{/* Remove Button */}
									<Button
										variant="ghost"
										size="sm"
										onClick={() => handleRemoveItem(item)}
										className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
									>
										<X className="h-3 w-3" />
									</Button>

									{/* Price */}
									<div className="text-right min-w-[60px]">
										<p className="font-medium text-sm text-slate-900 dark:text-slate-100">
											${parseFloat(item.price_at_sale || 0).toFixed(2)}
										</p>
									</div>
								</div>
							</div>
						</div>
					))}
				</div>
			)}

			{/* Modifier Editor Dialog */}
			{showModifierEditor && editingItem && (
				<ProductModifierSelector
					product={baseProduct}
					open={showModifierEditor}
					onOpenChange={setShowModifierEditor}
					onAddToCart={handleUpdateModifiers}
					initialQuantity={editingItem.quantity}
					editMode={true}
					existingSelections={editingItem.selected_modifiers_snapshot}
				/>
			)}
		</li>
	);
}
