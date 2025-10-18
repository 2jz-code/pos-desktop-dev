/**
 * LocationHeader Component
 *
 * Always-visible location display in checkout header.
 * Shows selected location with option to change it.
 * Clicking triggers a modal/dropdown to re-select location.
 */

import React, { useState } from "react";
import { Store, MapPin, ChevronDown, X } from "lucide-react";
import { useLocationSelector } from "@/hooks/useLocationSelector";
import LocationSelector from "./LocationSelector";

const LocationHeader = ({ className = "" }) => {
	const [showLocationPicker, setShowLocationPicker] = useState(false);
	const {
		selectedLocation,
		isLoading,
		formatAddress,
		selectionRequired,
		isLocked,
	} = useLocationSelector();

	if (isLoading) {
		return (
			<div className={`bg-accent-light-beige/50 border-b border-accent-subtle-gray/30 p-3 ${className}`}>
				<div className="max-w-4xl mx-auto flex items-center">
					<Store className="h-4 w-4 mr-2 text-primary-green" />
					<span className="text-sm text-accent-dark-brown">Loading location...</span>
				</div>
			</div>
		);
	}

	if (!selectedLocation) {
		return null;
	}

	return (
		<>
			{/* Location Header Bar */}
			<div className={`bg-accent-light-beige/50 border-b border-accent-subtle-gray/30 p-3 ${className}`}>
				<div className="max-w-4xl mx-auto">
					<button
						onClick={() => selectionRequired && setShowLocationPicker(true)}
						disabled={isLocked}
						className={`w-full flex items-center justify-between text-left ${
							selectionRequired && !isLocked
								? "hover:bg-accent-light-beige/80 rounded-lg p-2 -m-2 transition-colors"
								: ""
						}`}
					>
						<div className="flex items-start flex-grow">
							<Store className="h-4 w-4 mr-2 mt-0.5 text-primary-green flex-shrink-0" />
							<div className="flex-grow min-w-0">
								<div className="flex items-center">
									<span className="text-sm font-medium text-accent-dark-green">
										Pickup at: {selectedLocation.name}
									</span>
								</div>
								{formatAddress(selectedLocation) && (
									<div className="flex items-start text-xs text-accent-dark-brown mt-0.5">
										<MapPin className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0 text-accent-subtle-gray" />
										<span className="truncate">{formatAddress(selectedLocation)}</span>
									</div>
								)}
							</div>
						</div>
						{selectionRequired && !isLocked && (
							<ChevronDown className="h-4 w-4 ml-2 text-accent-dark-brown flex-shrink-0" />
						)}
					</button>
				</div>
			</div>

			{/* Location Picker Modal */}
			{showLocationPicker && (
				<div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/40">
					<div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mt-20 max-h-[80vh] overflow-hidden flex flex-col">
						{/* Modal Header */}
						<div className="flex items-center justify-between p-4 border-b border-accent-subtle-gray/30">
							<h3 className="text-lg font-semibold text-accent-dark-green">
								Change Pickup Location
							</h3>
							<button
								onClick={() => setShowLocationPicker(false)}
								className="p-1 rounded-full hover:bg-accent-light-beige transition-colors"
								aria-label="Close"
							>
								<X className="h-5 w-5 text-accent-dark-brown" />
							</button>
						</div>

						{/* Modal Body */}
						<div className="flex-grow overflow-y-auto p-4">
							<LocationSelector />
						</div>

						{/* Modal Footer */}
						<div className="p-4 border-t border-accent-subtle-gray/30 bg-accent-light-beige/30">
							<button
								onClick={() => setShowLocationPicker(false)}
								className="w-full py-2 px-4 bg-primary-green text-white rounded-lg font-medium hover:bg-accent-dark-green transition-colors"
							>
								Done
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
};

export default LocationHeader;
