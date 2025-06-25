import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard } from "lucide-react";

const CheckoutPage = () => {
	return (
		<div className="min-h-screen bg-gray-50">
			<div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
				<h1 className="text-3xl font-bold text-gray-900 mb-8">Checkout</h1>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center">
							<CreditCard className="mr-2 h-5 w-5" />
							Payment & Delivery
						</CardTitle>
					</CardHeader>
					<CardContent className="text-center py-12">
						<div className="text-gray-500 mb-4">
							<CreditCard className="h-16 w-16 mx-auto mb-4 opacity-50" />
							<h3 className="text-lg font-medium mb-2">Checkout Coming Soon</h3>
							<p className="mb-6">
								We're building a secure checkout process with guest support,
								Stripe payments, and more.
							</p>
						</div>
						<div className="space-y-2 text-sm text-gray-600">
							<p>• Guest checkout support</p>
							<p>• Secure payment processing</p>
							<p>• Order confirmation & tracking</p>
							<p>• Email receipts</p>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
};

export default CheckoutPage;
