/**
 * LocationSelector Component
 *
 * Smart location selector for checkout flow:
 * - Shows selectable locations if multiple exist
 * - Auto-selects and displays read-only if only 1 location
 * - Integrates with cart to persist selection
 */

import React from "react";
import { Store, MapPin, Check, Lock } from "lucide-react";
import { useLocationSelector } from "@/hooks/useLocationSelector";

const LocationSelector = ({ className = "" }) => {
	const {
		locations,
		selectedLocationId,
		selectedLocation,
		isLoading,
		error,
		selectLocation,
		selectionRequired,
		isLocked,
		formatAddress,
		isSettingLocation,
	} = useLocationSelector();

	if (isLoading) {
		return (
			<div className={`bg-white rounded-lg border border-accent-subtle-gray/30 p-6 ${className}`}>
				<div className="flex items-center justify-center">
					<div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-green"></div>
					<span className="ml-3 text-accent-dark-brown">Loading locations...</span>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className={`bg-red-50 border border-red-200 rounded-lg p-6 ${className}`}>
				<div className="flex items-center text-red-700">
					<Store className="h-5 w-5 mr-2" />
					<span className="font-medium">Unable to load locations</span>
				</div>
				<p className="mt-2 text-sm text-red-600">
					Please refresh the page or contact support if the issue persists.
				</p>
			</div>
		);
	}

	if (locations.length === 0) {
		return (
			<div className={`bg-yellow-50 border border-yellow-200 rounded-lg p-6 ${className}`}>
				<div className="flex items-center text-yellow-700">
					<Store className="h-5 w-5 mr-2" />
					<span className="font-medium">No locations available</span>
				</div>
				<p className="mt-2 text-sm text-yellow-600">
					Online ordering is currently unavailable. Please check back later.
				</p>
			</div>
		);
	}

	return (
		<div className={`bg-white rounded-lg border border-accent-subtle-gray/30 ${className}`}>
			{/* Header */}
			<div className="p-4 border-b border-accent-subtle-gray/30 bg-accent-light-beige/30">
				<h3 className="text-lg font-semibold text-accent-dark-green flex items-center">
					<Store className="h-5 w-5 mr-2 text-primary-green" />
					{isLocked ? "Pickup Location" : "Select Pickup Location"}
				</h3>
				{isLocked && (
					<p className="mt-1 text-sm text-accent-dark-brown flex items-center">
						<Lock className="h-3 w-3 mr-1" />
						Only one location available
					</p>
				)}
			</div>

			{/* Location List */}
			<div className="p-4">
				{isLocked ? (
					// Read-only display for single location
					<div className="flex items-start p-4 bg-accent-light-beige/50 rounded-lg border border-primary-green/30">
						<div className="flex-shrink-0 mt-1">
							<div className="h-5 w-5 rounded-full bg-primary-green flex items-center justify-center">
								<Check className="h-3 w-3 text-white" />
							</div>
						</div>
						<div className="ml-3 flex-grow">
							<p className="text-base font-medium text-accent-dark-green">
								{selectedLocation?.name}
							</p>
							{formatAddress(selectedLocation) && (
								<div className="mt-1 flex items-start text-sm text-accent-dark-brown">
									<MapPin className="h-4 w-4 mr-1 mt-0.5 flex-shrink-0 text-primary-green" />
									<span>{formatAddress(selectedLocation)}</span>
								</div>
							)}
							{selectedLocation?.phone && (
								<p className="mt-1 text-sm text-accent-dark-brown">
									{selectedLocation.phone}
								</p>
							)}
						</div>
					</div>
				) : (
					// Selectable list for multiple locations
					<div className="space-y-3">
						{locations.map((location) => {
							// Convert both to strings for reliable UUID comparison
							const isSelected = String(selectedLocationId) === String(location.id);
							return (
								<button
									key={location.id}
									onClick={() => selectLocation(location.id)}
									disabled={isSettingLocation}
									className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
										isSelected
											? "border-primary-green bg-accent-light-beige/50"
											: "border-accent-subtle-gray/30 hover:border-primary-green/50 hover:bg-accent-light-beige/30"
									} ${isSettingLocation ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
								>
									<div className="flex items-start">
										<div className="flex-shrink-0 mt-1">
											<div
												className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
													isSelected
														? "border-primary-green bg-primary-green"
														: "border-accent-subtle-gray"
												}`}
											>
												{isSelected && <Check className="h-3 w-3 text-white" />}
											</div>
										</div>
										<div className="ml-3 flex-grow">
											<p className={`text-base font-medium ${
												isSelected ? "text-accent-dark-green" : "text-accent-dark-brown"
											}`}>
												{location.name}
											</p>
											{formatAddress(location) && (
												<div className="mt-1 flex items-start text-sm text-accent-dark-brown">
													<MapPin className={`h-4 w-4 mr-1 mt-0.5 flex-shrink-0 ${
														isSelected ? "text-primary-green" : "text-accent-subtle-gray"
													}`} />
													<span>{formatAddress(location)}</span>
												</div>
											)}
											{location.phone && (
												<p className="mt-1 text-sm text-accent-dark-brown">
													{location.phone}
												</p>
											)}
											{location.web_order_lead_time_minutes && (
												<p className="mt-2 text-xs text-accent-subtle-gray">
													Lead time: {location.web_order_lead_time_minutes} minutes
												</p>
											)}
										</div>
									</div>
								</button>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
};

export default LocationSelector;
