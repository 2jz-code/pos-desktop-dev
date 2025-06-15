import React, { useState, useEffect } from "react";
import { usePosStore } from "@/store/posStore";
import { shallow } from "zustand/shallow";
import { Button } from "@/components/ui/button";
import { X, Plus, Minus, Percent } from "lucide-react"; // Removed Loader2 from imports
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
			className={`py-3 flex flex-col transition-colors duration-300 ${
				isUpdating ? "bg-blue-50" : "bg-white"
			}`}
		>
			<div className="flex items-center justify-between p-3 rounded-lg">
				<div className="flex-grow">
					<p className="font-semibold">{item.product.name}</p>
					<p className="text-sm text-gray-600">
						${parseFloat(item.product.price).toFixed(2)}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="icon"
						className="h-7 w-7"
						onClick={decrement}
						disabled={isUpdating}
					>
						<Minus className="h-4 w-4" />
					</Button>
					{/* MODIFICATION: Removed the spinner and conditional opacity */}
					<span className="w-8 text-center font-bold">{displayQuantity}</span>
					<Button
						variant="outline"
						size="icon"
						className="h-7 w-7"
						onClick={increment}
						disabled={isUpdating}
					>
						<Plus className="h-4 w-4" />
					</Button>
				</div>
				<p className="font-bold w-20 text-right">
					${(displayQuantity * item.price_at_sale).toFixed(2)}
				</p>
				<Button
					variant="ghost"
					size="icon"
					className="h-7 w-7"
					onClick={handleRemoveItem}
				>
					<X className="h-4 w-4 text-red-500" />
				</Button>
			</div>
		</li>
	);
}
