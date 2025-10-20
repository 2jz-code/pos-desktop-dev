import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { storeMarkerIcon, userLocationIcon } from '@/utils/mapIcons';
import 'leaflet/dist/leaflet.css';
import '@/styles/map.css';

/**
 * Component to handle map centering when location changes
 */
const MapCenterController = ({ center, zoom }) => {
	const map = useMap();

	React.useEffect(() => {
		if (center) {
			map.setView(center, zoom, { animate: true });
		}
	}, [center, zoom, map]);

	return null;
};

/**
 * SingleLocationMap Component
 *
 * Displays a single store location on an interactive map
 * Used on homepage and individual location pages
 *
 * @param {Object} location - Location object with latitude, longitude, name, address, etc.
 * @param {Object} userLocation - Optional user's coordinates to show on map
 * @param {number} height - Map height in pixels (default: 400)
 * @param {number} zoom - Initial zoom level (default: 15)
 * @param {Function} onGetDirections - Callback when "Get Directions" is clicked
 */
const SingleLocationMap = ({
	location,
	userLocation = null,
	height = 400,
	zoom = 15,
	onGetDirections,
	className = '',
}) => {
	if (!location || !location.latitude || !location.longitude) {
		return (
			<div
				className={`flex items-center justify-center bg-accent-subtle-gray/20 rounded-xl ${className}`}
				style={{ height: `${height}px` }}
			>
				<p className="text-accent-subtle-gray">Map unavailable - location coordinates not set</p>
			</div>
		);
	}

	const center = [location.latitude, location.longitude];

	const handleGetDirections = () => {
		const url = `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`;
		window.open(url, '_blank');

		if (onGetDirections) {
			onGetDirections(location);
		}
	};

	const formatAddress = () => {
		const parts = [];
		if (location.address_line1) parts.push(location.address_line1);
		if (location.city && location.state) {
			parts.push(`${location.city}, ${location.state} ${location.postal_code || ''}`.trim());
		}
		return parts.join('<br/>');
	};

	return (
		<div className={`rounded-xl overflow-hidden shadow-xl ${className}`} style={{ height: `${height}px` }}>
			<MapContainer
				center={center}
				zoom={zoom}
				scrollWheelZoom={true}
				className="h-full w-full"
				zoomControl={true}
			>
				{/* Map tiles from OpenStreetMap */}
				<TileLayer
					attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
					url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
				/>

				{/* Center controller */}
				<MapCenterController center={center} zoom={zoom} />

				{/* Store location marker */}
				<Marker position={center} icon={storeMarkerIcon}>
					<Popup className="custom-popup">
						<div className="p-2 min-w-[200px]">
							<h3 className="font-bold text-accent-dark-green text-lg mb-2">
								{location.name}
							</h3>
							<p
								className="text-accent-dark-brown text-sm mb-3"
								dangerouslySetInnerHTML={{ __html: formatAddress() }}
							/>
							{location.phone && (
								<p className="text-accent-dark-brown text-sm mb-1">
									📞 <a href={`tel:${location.phone}`} className="hover:text-primary-green">
										{location.phone}
									</a>
								</p>
							)}
							{location.distance && (
								<p className="text-primary-green text-sm font-medium mb-3">
									📍 {location.distance.toFixed(1)} miles away
								</p>
							)}
							<button
								onClick={handleGetDirections}
								className="w-full bg-primary-green text-white px-4 py-2 rounded-md hover:bg-opacity-90 transition-colors text-sm font-medium"
							>
								Get Directions →
							</button>
						</div>
					</Popup>
				</Marker>

				{/* User location marker (if provided) */}
				{userLocation && userLocation.latitude && userLocation.longitude && (
					<Marker
						position={[userLocation.latitude, userLocation.longitude]}
						icon={userLocationIcon}
					>
						<Popup>
							<div className="p-2">
								<p className="font-medium text-blue-600">Your Location</p>
							</div>
						</Popup>
					</Marker>
				)}
			</MapContainer>
		</div>
	);
};

export default SingleLocationMap;
