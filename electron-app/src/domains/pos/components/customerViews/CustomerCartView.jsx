// desktop-combined/electron-app/src/features/pos/components/customerViews/CustomerCartView.jsx

import React from "react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";

// --- FIX: Change prop `balanceDue` to `total` for clarity ---
const CustomerCartView = ({ cart, total }) => {
	return (
		<Card className="w-full max-w-lg">
			<CardHeader>
				<CardTitle className="text-3xl text-center">Your Order</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="space-y-2">
					{cart.map((item) => (
						<div
							key={item.id}
							className="flex justify-between text-lg"
						>
							<span>
								{item.product.name} (x{item.quantity})
							</span>
							{/* --- FIX: Calculate item total price correctly --- */}
							<span>${(item.quantity * item.price_at_sale).toFixed(2)}</span>
						</div>
					))}
				</div>
				<hr className="my-4" />
				<div className="flex justify-between text-2xl font-bold">
					<span>Total Due</span>
					{/* --- FIX: Use the `total` prop --- */}
					<span>${total.toFixed(2)}</span>
				</div>
			</CardContent>
		</Card>
	);
};

export default CustomerCartView;
