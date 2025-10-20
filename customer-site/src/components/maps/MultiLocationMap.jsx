import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { storeMarkerIcon, selectedMarkerIcon, createNumberedMarker } from '@/utils/mapIcons';
import { useQuery } from '@tanstack/react-query';
import { formatTime } from '@/hooks/useSettings';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';
import apiClient from '@/api/client';
import 'leaflet/dist/leaflet.css';
import '@/styles/map.css';

/**
 * Component for popup content with business hours
 */
const LocationPopupContent = ({ location, onGetDirections }) => {
	// Fetch business hours schedule for this location
	const { data: schedule } = useQuery({
		queryKey: ['business-hours-schedule', location.business_hours?.id],
		queryFn: async () => {
			const response = await apiClient.get(`/business-hours/schedule/${location.business_hours.id}/`);
			return response.data;
		},
		enabled: !!location.business_hours?.id && location.business_hours?.is_active,
		staleTime: 5 * 60 * 1000,
		cacheTime: 10 * 60 * 1000,
	});

	// Get today's hours with open/closed status
	const getTodayHours = () => {
		if (!schedule || !location.business_hours?.is_active) {
			return { isOpen: false, hours: 'Hours not available' };
		}

		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const day = String(now.getDate()).padStart(2, '0');
		const todayDate = `${year}-${month}-${day}`;

		const todaySchedule = schedule.schedule?.[todayDate];

		if (!todaySchedule || todaySchedule.is_closed) {
			return { isOpen: false, hours: 'Closed Today' };
		}

		const firstSlot = todaySchedule.slots?.[0];
		if (!firstSlot) {
			return { isOpen: false, hours: 'Closed Today' };
		}

		const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
		const isCurrentlyOpen = currentTime >= firstSlot.opening_time && currentTime <= firstSlot.closing_time;

		return {
			isOpen: isCurrentlyOpen,
			hours: `${formatTime(firstSlot.opening_time)} - ${formatTime(firstSlot.closing_time)}`,
		};
	};

	const todayHours = getTodayHours();

	const formatAddress = () => {
		const parts = [];
		if (location.address_line1) parts.push(location.address_line1);
		if (location.address_line2) parts.push(location.address_line2);
		if (location.city && location.state) {
			parts.push(`${location.city}, ${location.state} ${location.postal_code || ''}`.trim());
		}
		return parts.join('<br/>');
	};

	return (
		<div className="p-2 min-w-[200px]">
			<h3 className="font-bold text-accent-dark-green text-lg mb-2">
				{location.name}
			</h3>
			<p
				className="text-accent-dark-brown text-sm mb-2"
				dangerouslySetInnerHTML={{ __html: formatAddress() }}
			/>
			{location.phone && (
				<p className="text-accent-dark-brown text-sm mb-2">
					📞 <a href={`tel:${location.phone}`} className="hover:text-primary-green">
						{location.phone}
					</a>
				</p>
			)}
			{/* Today's Hours */}
			<div className="flex items-center space-x-1 mb-2">
				{todayHours.isOpen ? (
					<CheckCircleIcon className="w-4 h-4 text-green-600" />
				) : (
					<XCircleIcon className="w-4 h-4 text-red-600" />
				)}
				<p className={`text-sm font-medium ${todayHours.isOpen ? 'text-green-700' : 'text-red-700'}`}>
					{todayHours.hours}
				</p>
			</div>
			{location.distance && (
				<p className="text-primary-green text-sm font-medium mb-3">
					📍 {location.distance.toFixed(1)} miles away
				</p>
			)}
			<button
				onClick={onGetDirections}
				className="w-full bg-primary-green text-white px-4 py-2 rounded-md hover:bg-opacity-90 transition-colors text-sm font-medium"
			>
				Get Directions →
			</button>
		</div>
	);
};

/**
 * Component to handle map bounds when locations change
 */
const MapBoundsController = ({ locations, selectedLocation }) => {
	const map = useMap();

	useEffect(() => {
		if (locations.length === 0) return;

		// Close any open popups before moving the map
		map.closePopup();

		if (selectedLocation) {
			// If a location is selected, center on it
			map.setView([selectedLocation.latitude, selectedLocation.longitude], 15, { animate: true });
		} else if (locations.length === 1) {
			// If only one location, center on it
			map.setView([locations[0].latitude, locations[0].longitude], 13);
		} else {
			// Multiple locations: fit bounds to show all
			const bounds = locations.map(loc => [loc.latitude, loc.longitude]);
			map.fitBounds(bounds, { padding: [50, 50] });
		}
	}, [locations, selectedLocation?.id, selectedLocation?.latitude, selectedLocation?.longitude, map]);

	return null;
};

/**
 * MultiLocationMap Component
 *
 * Displays multiple store locations on an interactive map
 * Used on the /locations page
 *
 * @param {Array} locations - Array of location objects with latitude, longitude, name, address, etc.
 * @param {Object} selectedLocation - Currently selected location (optional)
 * @param {Function} onLocationSelect - Callback when a location marker is clicked
 * @param {number} height - Map height in pixels (default: 600)
 * @param {boolean} showNumbers - Whether to show numbered markers instead of icons (default: false)
 */
const MultiLocationMap = ({
	locations = [],
	selectedLocation = null,
	onLocationSelect,
	height = 600,
	showNumbers = false,
	className = '',
}) => {
	const [mapKey, setMapKey] = useState(0);

	// Force re-render when locations change significantly
	useEffect(() => {
		setMapKey(prev => prev + 1);
	}, [locations.length]);

	if (locations.length === 0) {
		return (
			<div
				className={`flex items-center justify-center bg-accent-subtle-gray/20 rounded-xl ${className}`}
				style={{ height: `${height}px` }}
			>
				<p className="text-accent-subtle-gray">No locations available</p>
			</div>
		);
	}

	// Default center (first location or selected)
	const defaultCenter = selectedLocation
		? [selectedLocation.latitude, selectedLocation.longitude]
		: [locations[0].latitude, locations[0].longitude];

	const handleGetDirections = (location) => {
		// Build address from structured fields
		const addressParts = [];
		if (location.address_line1) addressParts.push(location.address_line1);
		if (location.address_line2) addressParts.push(location.address_line2);
		if (location.city) addressParts.push(location.city);
		if (location.state) addressParts.push(location.state);
		if (location.postal_code) addressParts.push(location.postal_code);

		let url;
		if (addressParts.length > 0) {
			// Use formatted address - Google will recognize the business
			const address = addressParts.join(', ');
			url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
		} else {
			// Fall back to coordinates if no address available
			url = `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`;
		}
		window.open(url, '_blank');
	};

	return (
		<div className={`rounded-xl overflow-hidden shadow-xl ${className}`} style={{ height: `${height}px` }}>
			<MapContainer
				key={mapKey}
				center={defaultCenter}
				zoom={13}
				scrollWheelZoom={true}
				className="h-full w-full"
				zoomControl={true}
			>
				{/* Map tiles from OpenStreetMap */}
				<TileLayer
					attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
					url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
				/>

				{/* Bounds controller */}
				<MapBoundsController locations={locations} selectedLocation={selectedLocation} />

				{/* Location markers */}
				{locations.map((location, index) => {
					const isSelected = selectedLocation?.id === location.id;
					const position = [location.latitude, location.longitude];

					// Choose marker icon
					let icon;
					if (showNumbers) {
						icon = createNumberedMarker(index + 1, isSelected);
					} else {
						icon = isSelected ? selectedMarkerIcon : storeMarkerIcon;
					}

					return (
						<Marker
							key={location.id}
							position={position}
							icon={icon}
							eventHandlers={{
								click: () => {
									if (onLocationSelect) {
										onLocationSelect(location);
									}
								},
							}}
						>
							<Popup className="custom-popup">
								<LocationPopupContent
									location={location}
									onGetDirections={() => handleGetDirections(location)}
								/>
							</Popup>
						</Marker>
					);
				})}
			</MapContainer>
		</div>
	);
};

export default MultiLocationMap;
