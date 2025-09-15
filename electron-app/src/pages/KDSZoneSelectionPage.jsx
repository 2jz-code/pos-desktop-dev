import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui";
import { ChefHat, ArrowLeft, Monitor } from "lucide-react";
import { useKitchenZones } from "@/domains/settings/hooks/useKitchenZones";
import FullScreenLoader from "@/shared/components/common/FullScreenLoader";

/**
 * KDS Zone Selection Page
 * Allows user to select which kitchen zone to display orders for
 */
export function KDSZoneSelectionPage() {
	const navigate = useNavigate();
	const [selectedZone, setSelectedZone] = useState("");
	const { data: kitchenZones = [], isLoading, error } = useKitchenZones();

	const handleZoneSelection = () => {
		if (selectedZone) {
			// Store selected zone in localStorage
			localStorage.setItem("kds-selected-zone", selectedZone);
			// Navigate to main KDS page
			navigate("/kds");
		}
	};

	const handleBackToModeSelection = () => {
		// Clear the app mode to force mode selection
		localStorage.removeItem("app-mode");
		navigate("/mode-selection");
	};

	const handleSwitchToPOS = () => {
		// Switch to POS mode and navigate to login
		localStorage.setItem("app-mode", "pos");
		navigate("/login");
	};

	if (isLoading) {
		return <FullScreenLoader />;
	}

	return (
		<div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
			<div className="w-full max-w-2xl">
				{/* Header */}
				<div className="text-center mb-8">
					<div className="mx-auto mb-4 p-4 bg-green-100 rounded-full w-fit">
						<ChefHat className="h-12 w-12 text-green-600" />
					</div>
					<h1 className="text-4xl font-bold text-gray-900 mb-2">
						Kitchen Display System
					</h1>
					<p className="text-xl text-gray-600">Select your kitchen zone</p>
				</div>

				{/* Zone Selection Card */}
				<Card className="shadow-lg">
					<CardHeader className="text-center">
						<CardTitle className="text-2xl">Kitchen Zone Selection</CardTitle>
						<CardDescription className="text-lg">
							Choose which kitchen zone you want to display orders for
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						{error ? (
							<div className="text-center py-8">
								<p className="text-red-600 mb-4">
									Error loading kitchen zones: {error.message}
								</p>
								<Button
									onClick={() => window.location.reload()}
									variant="outline"
								>
									Retry
								</Button>
							</div>
						) : kitchenZones.length === 0 ? (
							<div className="text-center py-8">
								<Monitor className="h-16 w-16 text-gray-400 mx-auto mb-4" />
								<p className="text-gray-600 mb-4">
									No kitchen zones configured yet.
								</p>
								<p className="text-sm text-gray-500 mb-6">
									You need to configure kitchen zones first in POS mode under Settings.
								</p>
								<Button
									onClick={handleSwitchToPOS}
									className="bg-blue-600 hover:bg-blue-700"
									size="lg"
								>
									Switch to POS Mode to Configure Zones
								</Button>
							</div>
						) : (
							<>
								{/* Zone Selector */}
								<div className="space-y-2">
									<label className="text-sm font-medium text-gray-700">
										Select Kitchen Zone
									</label>
									<Select
										value={selectedZone}
										onValueChange={setSelectedZone}
									>
										<SelectTrigger className="w-full text-lg py-6">
											<SelectValue placeholder="Choose a kitchen zone..." />
										</SelectTrigger>
										<SelectContent>
											{kitchenZones.map((zone) => (
												<SelectItem
													key={zone.name}
													value={zone.name}
													className="text-lg py-3"
												>
													<div className="flex items-center space-x-3">
														<ChefHat className="h-5 w-5 text-green-600" />
														<div>
															<div className="font-medium">{zone.name}</div>
															{zone.description && (
																<div className="text-sm text-gray-500">
																	{zone.description}
																</div>
															)}
														</div>
													</div>
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								{/* Zone Info */}
								{selectedZone && (
									<div className="bg-green-50 p-4 rounded-lg">
										<h4 className="font-medium text-green-800 mb-2">
											Zone: {selectedZone}
										</h4>
										<p className="text-sm text-green-700">
											You'll see all orders assigned to this kitchen zone. You
											can change zones anytime from the KDS interface.
										</p>
									</div>
								)}

								{/* Action Buttons */}
								<div className="flex space-x-4 pt-4">
									<Button
										onClick={handleBackToModeSelection}
										variant="outline"
										className="flex-1"
									>
										<ArrowLeft className="h-4 w-4 mr-2" />
										Back to Mode Selection
									</Button>
									<Button
										onClick={handleZoneSelection}
										disabled={!selectedZone}
										className="flex-1 bg-green-600 hover:bg-green-700"
										size="lg"
									>
										Enter KDS
									</Button>
								</div>
							</>
						)}
					</CardContent>
				</Card>

				{/* Available Zones Summary */}
				{kitchenZones.length > 0 && (
					<div className="text-center mt-6">
						<p className="text-sm text-gray-500">
							{kitchenZones.length} kitchen zone
							{kitchenZones.length !== 1 ? "s" : ""} available
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
