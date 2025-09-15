import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Monitor, ChefHat } from "lucide-react";

/**
 * Mode Selection Page - First screen shown on app startup
 * Allows user to choose between POS mode and KDS mode
 */
export function ModeSelectionPage() {
	const navigate = useNavigate();

	const handleModeSelection = (mode) => {
		// Store the selected mode in localStorage
		localStorage.setItem("app-mode", mode);

		if (mode === "pos") {
			// Navigate to login for POS mode
			navigate("/login");
		} else if (mode === "kds") {
			// Navigate directly to KDS zone selection (no auth required)
			navigate("/kds-zone-selection");
		}
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
			<div className="w-full max-w-4xl">
				<div className="text-center mb-8">
					<h1 className="text-4xl font-bold text-gray-900 mb-2">
						Ajeen POS System
					</h1>
					<p className="text-xl text-gray-600">
						Select your operating mode
					</p>
				</div>

				<div className="grid md:grid-cols-2 gap-8">
					{/* POS Mode Option */}
					<Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border-2 hover:border-blue-500">
						<CardHeader className="text-center pb-4">
							<div className="mx-auto mb-4 p-4 bg-blue-100 rounded-full w-fit">
								<Monitor className="h-12 w-12 text-blue-600" />
							</div>
							<CardTitle className="text-2xl">POS Mode</CardTitle>
							<CardDescription className="text-lg">
								Point of Sale Terminal
							</CardDescription>
						</CardHeader>
						<CardContent className="text-center">
							<p className="text-gray-600 mb-6">
								Process orders, handle payments, manage inventory, and access all system features.
							</p>
							<ul className="text-sm text-gray-500 mb-6 space-y-1">
								<li>• Order management</li>
								<li>• Payment processing</li>
								<li>• Inventory tracking</li>
								<li>• Reports and analytics</li>
								<li>• User management</li>
							</ul>
							<Button
								onClick={() => handleModeSelection("pos")}
								className="w-full text-lg py-6"
								size="lg"
							>
								Enter POS Mode
							</Button>
						</CardContent>
					</Card>

					{/* KDS Mode Option */}
					<Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border-2 hover:border-green-500">
						<CardHeader className="text-center pb-4">
							<div className="mx-auto mb-4 p-4 bg-green-100 rounded-full w-fit">
								<ChefHat className="h-12 w-12 text-green-600" />
							</div>
							<CardTitle className="text-2xl">KDS Mode</CardTitle>
							<CardDescription className="text-lg">
								Kitchen Display System
							</CardDescription>
						</CardHeader>
						<CardContent className="text-center">
							<p className="text-gray-600 mb-6">
								View and manage kitchen orders by zone. Track order status and preparation times.
							</p>
							<ul className="text-sm text-gray-500 mb-6 space-y-1">
								<li>• Real-time order display</li>
								<li>• Order status tracking</li>
								<li>• Kitchen zone filtering</li>
								<li>• Preparation timing</li>
								<li>• No login required</li>
							</ul>
							<Button
								onClick={() => handleModeSelection("kds")}
								className="w-full text-lg py-6 bg-green-600 hover:bg-green-700"
								size="lg"
							>
								Enter KDS Mode
							</Button>
						</CardContent>
					</Card>
				</div>

				<div className="text-center mt-8">
					<p className="text-sm text-gray-500">
						You can change modes by restarting the application
					</p>
				</div>
			</div>
		</div>
	);
}