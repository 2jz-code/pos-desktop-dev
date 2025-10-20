/**
 * LocationSelector Component
 *
 * Smart location selector for checkout flow:
 * - Shows selectable locations if multiple exist
 * - Auto-selects and displays read-only if only 1 location
 * - Integrates with cart to persist selection
 */

import React, { useMemo } from "react";
import {
	Store,
	MapPin,
	Check,
	Lock,
	CheckCircle,
	XCircle,
	Clock,
} from "lucide-react";
import { useLocationSelector } from "@/hooks/useLocationSelector";
import { useQuery } from "@tanstack/react-query";
import apiClient from "@/api/client";
import { formatTime } from "@/hooks/useSettings";

// Helper hook to get business hours status for a location
const useLocationStatus = (location) => {
	const { data: schedule } = useQuery({
		queryKey: ["business-hours-schedule", location?.business_hours?.id],
		queryFn: async () => {
			const response = await apiClient.get(
				`/business-hours/schedule/${location.business_hours.id}/`
			);
			return response.data;
		},
		enabled:
			!!location?.business_hours?.id && location.business_hours?.is_active,
		staleTime: 2 * 60 * 1000, // 2 minutes (more frequent checks for checkout)
		cacheTime: 5 * 60 * 1000, // 5 minutes
	});

	// Calculate if location is currently open
	const status = useMemo(() => {
		if (!schedule || !location?.business_hours?.is_active) {
			return { isOpen: false, hours: "Hours not available", canOrder: false };
		}

		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, "0");
		const day = String(now.getDate()).padStart(2, "0");
		const todayDate = `${year}-${month}-${day}`;

		const todaySchedule = schedule.schedule?.[todayDate];

		if (!todaySchedule || todaySchedule.is_closed) {
			return { isOpen: false, hours: "Closed Today", canOrder: false };
		}

		const firstSlot = todaySchedule.slots?.[0];
		if (!firstSlot) {
			return { isOpen: false, hours: "Closed Today", canOrder: false };
		}

		// Check if current time is within business hours
		const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(
			now.getMinutes()
		).padStart(2, "0")}:00`;
		const isCurrentlyOpen =
			currentTime >= firstSlot.opening_time &&
			currentTime <= firstSlot.closing_time;

		return {
			isOpen: isCurrentlyOpen,
			hours: `${formatTime(firstSlot.opening_time)} - ${formatTime(
				firstSlot.closing_time
			)}`,
			canOrder: isCurrentlyOpen,
		};
	}, [schedule, location]);

	return status;
};

// Component for individual location card with status
const LocationCard = ({
	location,
	isSelected,
	isSettingLocation,
	onSelect,
	formatAddress,
}) => {
	const status = useLocationStatus(location);
	const isClosed = !status.canOrder;

	return (
		<button
			onClick={() => !isClosed && onSelect(location.id)}
			disabled={isSettingLocation || isClosed}
			className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
				isClosed
					? "border-red-200 bg-red-50/30 opacity-60 cursor-not-allowed"
					: isSelected
					? "border-primary-green bg-accent-light-beige/50"
					: "border-accent-subtle-gray/30 hover:border-primary-green/50 hover:bg-accent-light-beige/30 cursor-pointer"
			} ${
				isSettingLocation && !isClosed ? "opacity-50 cursor-not-allowed" : ""
			}`}
		>
			<div className="flex items-start">
				<div className="flex-shrink-0 mt-1">
					<div
						className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
							isClosed
								? "border-red-300 bg-red-100"
								: isSelected
								? "border-primary-green bg-primary-green"
								: "border-accent-subtle-gray"
						}`}
					>
						{isClosed ? (
							<XCircle className="h-3 w-3 text-red-500" />
						) : (
							isSelected && <Check className="h-3 w-3 text-white" />
						)}
					</div>
				</div>
				<div className="ml-3 flex-grow">
					<div className="flex items-center justify-between">
						<p
							className={`text-base font-medium ${
								isClosed
									? "text-red-600"
									: isSelected
									? "text-accent-dark-green"
									: "text-accent-dark-brown"
							}`}
						>
							{location.name}
						</p>
						{/* Status badge */}
						<div
							className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${
								status.isOpen
									? "bg-green-100 text-green-700"
									: "bg-red-100 text-red-700"
							}`}
						>
							{status.isOpen ? (
								<>
									<CheckCircle className="h-3 w-3" />
									<span>Open</span>
								</>
							) : (
								<>
									<XCircle className="h-3 w-3" />
									<span>Closed</span>
								</>
							)}
						</div>
					</div>

					{formatAddress(location) && (
						<div className="mt-1 flex items-start text-sm text-accent-dark-brown">
							<MapPin
								className={`h-4 w-4 mr-1 mt-0.5 flex-shrink-0 ${
									isClosed
										? "text-red-400"
										: isSelected
										? "text-primary-green"
										: "text-accent-subtle-gray"
								}`}
							/>
							<span>{formatAddress(location)}</span>
						</div>
					)}
					{location.phone && (
						<p className="mt-1 text-sm text-accent-dark-brown">
							{location.phone}
						</p>
					)}

					{/* Hours display */}
					<div className="mt-2 flex items-center space-x-1 text-sm">
						<Clock
							className={`h-4 w-4 ${
								status.isOpen ? "text-green-600" : "text-red-600"
							}`}
						/>
						<span
							className={`font-medium ${
								status.isOpen ? "text-green-700" : "text-red-700"
							}`}
						>
							{status.hours}
						</span>
					</div>

					{location.web_order_lead_time_minutes && !isClosed && (
						<p className="mt-2 text-xs text-accent-subtle-gray">
							Lead time: {location.web_order_lead_time_minutes} minutes
						</p>
					)}
					{isClosed && (
						<p className="mt-2 text-xs text-red-600 font-medium">
							Cannot place orders while closed
						</p>
					)}
				</div>
			</div>
		</button>
	);
};

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
			<div
				className={`bg-white rounded-lg border border-accent-subtle-gray/30 p-6 ${className}`}
			>
				<div className="flex items-center justify-center">
					<div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-green"></div>
					<span className="ml-3 text-accent-dark-brown">
						Loading locations...
					</span>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div
				className={`bg-red-50 border border-red-200 rounded-lg p-6 ${className}`}
			>
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
			<div
				className={`bg-yellow-50 border border-yellow-200 rounded-lg p-6 ${className}`}
			>
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
		<div
			className={`bg-white rounded-lg border border-accent-subtle-gray/30 ${className}`}
		>
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
							const isSelected =
								String(selectedLocationId) === String(location.id);
							return (
								<LocationCard
									key={location.id}
									location={location}
									isSelected={isSelected}
									isSettingLocation={isSettingLocation}
									onSelect={selectLocation}
									formatAddress={formatAddress}
								/>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
};

export default LocationSelector;
