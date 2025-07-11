"use client";

import { useState, useEffect } from "react";
import { usePosStore } from "@/domains/pos/store/posStore";
import { shallow } from "zustand/shallow";
import { Button } from "@/shared/components/ui/button";
import { X, Plus, Minus } from "lucide-react";
import { useDebouncedCallback } from "use-debounce";

export default function CartItem({ item }) {
	const { removeItemViaSocket, updateItemQuantityViaSocket, isUpdating } =
		usePosStore(
			(state) => ({
				removeItemViaSocket: state.removeItemViaSocket,
				updateItemQuantityViaSocket: state.updateItemQuantityViaSocket,
				isUpdating: state.updatingItems?.includes(item.id) ?? false,
			}),
			shallow
		);

	const [displayQuantity, setDisplayQuantity] = useState(item.quantity);

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

	if (!item.product) {
		return null;
	}

	return (
		<li
			className={`
        transition-all duration-200 rounded-lg
        ${
					isUpdating
						? "bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
						: "hover:bg-slate-50 dark:hover:bg-slate-800/30"
				}
      `}
		>
			<div className="p-4 flex items-center gap-4">
				{/* Product Image */}
				<div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0">
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
					<h4 className="font-semibold text-slate-900 dark:text-slate-100 truncate">
						{item.product.name}
					</h4>
					<p className="text-sm text-slate-600 dark:text-slate-400">
						${Number.parseFloat(item.product.price).toFixed(2)} each
					</p>
				</div>

				{/* Quantity Controls */}
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="icon"
						className="h-8 w-8 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 bg-transparent"
						onClick={decrement}
						disabled={isUpdating}
					>
						<Minus className="h-3 w-3" />
					</Button>

					<div className="w-12 text-center">
						<span
							className={`font-semibold text-slate-900 dark:text-slate-100 ${
								isUpdating ? "opacity-50" : ""
							}`}
						>
							{displayQuantity}
						</span>
					</div>

					<Button
						variant="outline"
						size="icon"
						className="h-8 w-8 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 bg-transparent"
						onClick={increment}
						disabled={isUpdating}
					>
						<Plus className="h-3 w-3" />
					</Button>
				</div>

				{/* Total Price */}
				<div className="w-20 text-right">
					<p className="font-bold text-slate-900 dark:text-slate-100">
						${(displayQuantity * item.price_at_sale).toFixed(2)}
					</p>
				</div>

				{/* Remove Button */}
				<Button
					variant="ghost"
					size="icon"
					className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
					onClick={handleRemoveItem}
					disabled={isUpdating}
				>
					<X className="h-4 w-4" />
				</Button>
			</div>
		</li>
	);
}
