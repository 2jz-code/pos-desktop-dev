import React, { useState, useMemo } from "react";
import SEO from "@/components/SEO";
import { useLocationSelector } from "@/hooks/useLocationSelector";
import { useGeolocation } from "@/hooks/useGeolocation";
import { calculateDistance } from "@/utils/distance";
import { formatTime, getDayName } from "@/hooks/useSettings";
import MultiLocationMap from "@/components/maps/MultiLocationMap";
import {
	MagnifyingGlassIcon,
	MapPinIcon,
	PhoneIcon,
	ClockIcon,
	EnvelopeIcon,
	CheckCircleIcon,
	XCircleIcon,
} from "@heroicons/react/24/outline";
import { generateBreadcrumbStructuredData } from "@/utils/structuredData";
import { useQuery } from "@tanstack/react-query";
import apiClient from "@/api/client";

// Generate LocalBusiness structured data for SEO
const generateLocalBusinessSchema = (locations) => {
	if (!locations || locations.length === 0) return null;

	const businesses = locations.map((location, index) => {
		const business = {
			"@type": "Restaurant",
			"@id": `https://bakeajeen.com/locations#${location.id}`,
			name: location.name || "Ajeen Bakery",
			image: location.image_url || "https://bakeajeen.com/logo.png",
			telephone: location.phone,
			email: location.email,
			priceRange: "$$",
			servesCuisine: "Middle Eastern",
			address: {
				"@type": "PostalAddress",
				streetAddress: [location.address_line1, location.address_line2]
					.filter(Boolean)
					.join(", "),
				addressLocality: location.city,
				addressRegion: location.state,
				postalCode: location.postal_code,
			},
			geo: {
				"@type": "GeoCoordinates",
				latitude: location.latitude,
				longitude: location.longitude,
			},
		};

		// Add opening hours if available
		if (location.business_hours?.is_active) {
			// We'll add opening hours specification when we have the schedule data
			// This would require querying the schedule for each location
			business.openingHoursSpecification = [];
		}

		return business;
	});

	// Return as @graph for multiple locations
	return {
		"@context": "https://schema.org",
		"@graph": businesses,
	};
};

// Component for individual location card with today's hours
const LocationCard = ({ location, index, selectedLocation, onClick }) => {
	// Fetch business hours schedule for this location
	const { data: schedule } = useQuery({
		queryKey: ["business-hours-schedule", location.business_hours?.id],
		queryFn: async () => {
			const response = await apiClient.get(
				`/business-hours/schedule/${location.business_hours.id}/`
			);
			return response.data;
		},
		enabled:
			!!location.business_hours?.id && location.business_hours?.is_active,
		staleTime: 5 * 60 * 1000, // 5 minutes
		cacheTime: 10 * 60 * 1000, // 10 minutes
	});

	// Get today's hours
	const getTodayHours = () => {
		if (!schedule || !location.business_hours?.is_active) {
			return { isOpen: false, hours: "Hours not available" };
		}

		// Get today's date in YYYY-MM-DD format (use local time, not UTC)
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, "0");
		const day = String(now.getDate()).padStart(2, "0");
		const todayDate = `${year}-${month}-${day}`;

		// Look up today in the schedule object
		const todaySchedule = schedule.schedule?.[todayDate];

		if (!todaySchedule || todaySchedule.is_closed) {
			return { isOpen: false, hours: "Closed Today" };
		}

		// Get the first slot's hours (most locations have one slot per day)
		const firstSlot = todaySchedule.slots?.[0];
		if (!firstSlot) {
			return { isOpen: false, hours: "Closed Today" };
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
		};
	};

	const todayHours = getTodayHours();

	// Format address inline
	const formatAddress = () => {
		const parts = [];
		if (location.address_line1) parts.push(location.address_line1);
		if (location.address_line2) parts.push(location.address_line2);
		if (location.city && location.state) {
			parts.push(
				`${location.city}, ${location.state} ${
					location.postal_code || ""
				}`.trim()
			);
		}
		return parts.join(", ");
	};

	return (
		<button
			onClick={onClick}
			className={`w-full text-left bg-white rounded-2xl shadow-lg p-6 transition-all duration-300 transform hover:scale-[1.02] hover:shadow-xl border-2 ${
				selectedLocation?.id === location.id
					? "border-primary-green ring-4 ring-primary-green/20"
					: "border-accent-subtle-gray/20 hover:border-primary-green/50"
			}`}
		>
			{/* Location Number Badge */}
			<div className="flex items-start justify-between mb-3">
				<div className="flex items-center space-x-3">
					<div className="bg-primary-green text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
						{index + 1}
					</div>
					<h3 className="font-bold text-accent-dark-green text-xl">
						{location.name}
					</h3>
				</div>
				{location.distance && (
					<div className="bg-primary-green/10 px-3 py-1 rounded-full">
						<p className="text-primary-green text-sm font-semibold">
							{location.distance.toFixed(1)} mi
						</p>
					</div>
				)}
			</div>

			{/* Address */}
			<div className="flex items-start space-x-2 text-accent-dark-brown/80 mb-3">
				<MapPinIcon className="w-5 h-5 flex-shrink-0 mt-0.5 text-primary-green" />
				<p className="text-sm">{formatAddress()}</p>
			</div>

			{/* Phone */}
			{location.phone && (
				<div className="flex items-center space-x-2 text-accent-dark-brown/80 mb-3">
					<PhoneIcon className="w-5 h-5 flex-shrink-0 text-primary-green" />
					<a
						href={`tel:${location.phone}`}
						onClick={(e) => e.stopPropagation()}
						className="text-sm hover:text-primary-green transition-colors"
					>
						{location.phone}
					</a>
				</div>
			)}

			{/* Today's Hours */}
			<div className="flex items-center space-x-2">
				<ClockIcon className="w-5 h-5 flex-shrink-0 text-primary-green" />
				<div className="flex items-center space-x-2">
					{todayHours.isOpen ? (
						<CheckCircleIcon className="w-4 h-4 text-green-600" />
					) : (
						<XCircleIcon className="w-4 h-4 text-red-600" />
					)}
					<p
						className={`text-sm font-medium ${
							todayHours.isOpen ? "text-green-700" : "text-red-700"
						}`}
					>
						{todayHours.hours}
					</p>
				</div>
			</div>

			{/* View on map hint */}
			<div className="mt-4 pt-4 border-t border-accent-subtle-gray/20">
				<p className="text-primary-green text-sm font-medium">
					Click to view on map →
				</p>
			</div>
		</button>
	);
};

// Component for detailed location information panel
const LocationDetailPanel = ({ location }) => {
	// Fetch full business hours schedule for this location
	const { data: schedule } = useQuery({
		queryKey: ["business-hours-schedule", location.business_hours?.id],
		queryFn: async () => {
			const response = await apiClient.get(
				`/business-hours/schedule/${location.business_hours.id}/`
			);
			return response.data;
		},
		enabled:
			!!location.business_hours?.id && location.business_hours?.is_active,
		staleTime: 5 * 60 * 1000, // 5 minutes
		cacheTime: 10 * 60 * 1000, // 10 minutes
	});

	const formatAddress = (loc) => {
		const parts = [];
		if (loc.address_line1) parts.push(loc.address_line1);
		if (loc.address_line2) parts.push(loc.address_line2);
		if (loc.city && loc.state) {
			parts.push(`${loc.city}, ${loc.state} ${loc.postal_code || ""}`.trim());
		}
		return parts.join(", ");
	};

	// Group schedule periods by consecutive days with same hours
	const groupSchedule = () => {
		if (!schedule || !schedule.schedule) return [];

		// Convert schedule object to array of [date, dayData] and sort by date
		const sortedDates = Object.entries(schedule.schedule).sort(
			([dateA], [dateB]) => new Date(dateA) - new Date(dateB)
		);

		// Convert dates to day of week and create periods array
		const periods = sortedDates.map(([date, dayData]) => {
			// JavaScript getDay(): 0=Sunday, 1=Monday, ..., 6=Saturday
			const jsDayOfWeek = new Date(date + "T00:00:00").getDay();
			// Backend convention: 0=Monday, 1=Tuesday, ..., 6=Sunday
			// Convert: (jsDayOfWeek + 6) % 7
			const backendDayOfWeek = (jsDayOfWeek + 6) % 7;
			const firstSlot = dayData.slots?.[0];

			return {
				day_of_week: backendDayOfWeek,
				is_closed: dayData.is_closed || !firstSlot,
				open_time: firstSlot?.opening_time,
				close_time: firstSlot?.closing_time,
			};
		});

		// Sort by day of week (0=Monday, 1=Tuesday, etc.)
		const sortedPeriods = [...periods].sort(
			(a, b) => a.day_of_week - b.day_of_week
		);

		// Group consecutive days with same hours
		const groups = [];
		let currentGroup = null;

		sortedPeriods.forEach((period) => {
			if (period.is_closed) {
				groups.push({
					days: [period.day_of_week],
					hours: "Closed",
					isOpen: false,
				});
			} else {
				const hours = `${formatTime(period.open_time)} - ${formatTime(
					period.close_time
				)}`;

				if (
					currentGroup &&
					currentGroup.hours === hours &&
					currentGroup.isOpen
				) {
					// Check if this day is consecutive to the last day in the group
					const lastDay = currentGroup.days[currentGroup.days.length - 1];
					if (
						period.day_of_week === (lastDay + 1) % 7 ||
						period.day_of_week === lastDay + 1
					) {
						currentGroup.days.push(period.day_of_week);
					} else {
						// Not consecutive, start a new group
						currentGroup = {
							days: [period.day_of_week],
							hours,
							isOpen: true,
						};
						groups.push(currentGroup);
					}
				} else {
					currentGroup = {
						days: [period.day_of_week],
						hours,
						isOpen: true,
					};
					groups.push(currentGroup);
				}
			}
		});

		return groups;
	};

	const scheduleGroups = groupSchedule();

	const formatDayRange = (days) => {
		// Convert backend day (0=Monday) to JS day (0=Sunday) for getDayName
		const toJSDay = (backendDay) => (backendDay + 1) % 7;

		if (days.length === 1) return getDayName(toJSDay(days[0]));
		if (days.length === 2)
			return `${getDayName(toJSDay(days[0]))} & ${getDayName(
				toJSDay(days[1])
			)}`;
		return `${getDayName(toJSDay(days[0]))} - ${getDayName(
			toJSDay(days[days.length - 1])
		)}`;
	};

	return (
		<div className="bg-gradient-to-br from-primary-green/5 to-accent-olive-green/5 rounded-2xl shadow-xl p-6 border-2 border-primary-green/20">
			<h3 className="font-bold text-accent-dark-green text-2xl mb-6 flex items-center space-x-3">
				<div className="bg-primary-green text-white w-10 h-10 rounded-full flex items-center justify-center">
					<MapPinIcon className="w-6 h-6" />
				</div>
				<span>{location.name}</span>
			</h3>

			<div className="space-y-4 mb-6">
				{/* Address */}
				<div className="flex items-start space-x-3 bg-white rounded-xl p-4">
					<MapPinIcon className="w-5 h-5 flex-shrink-0 mt-0.5 text-primary-green" />
					<div>
						<p className="font-semibold text-accent-dark-green text-sm mb-1">
							Address
						</p>
						<a
							href={(() => {
								// Build address from structured fields
								const addressParts = [];
								if (location.address_line1)
									addressParts.push(location.address_line1);
								if (location.address_line2)
									addressParts.push(location.address_line2);
								if (location.city) addressParts.push(location.city);
								if (location.state) addressParts.push(location.state);
								if (location.postal_code)
									addressParts.push(location.postal_code);

								if (addressParts.length > 0) {
									const address = addressParts.join(", ");
									return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
										address
									)}`;
								} else {
									return `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
								}
							})()}
							target="_blank"
							rel="noopener noreferrer"
							className="text-accent-dark-brown hover:text-primary-green transition-colors hover:underline"
						>
							{formatAddress(location)}
						</a>
					</div>
				</div>

				{/* Phone */}
				{location.phone && (
					<div className="flex items-start space-x-3 bg-white rounded-xl p-4">
						<PhoneIcon className="w-5 h-5 flex-shrink-0 mt-0.5 text-primary-green" />
						<div>
							<p className="font-semibold text-accent-dark-green text-sm mb-1">
								Phone
							</p>
							<a
								href={`tel:${location.phone}`}
								className="text-accent-dark-brown hover:text-primary-green transition-colors"
							>
								{location.phone}
							</a>
						</div>
					</div>
				)}

				{/* Email */}
				{location.email && (
					<div className="flex items-start space-x-3 bg-white rounded-xl p-4">
						<EnvelopeIcon className="w-5 h-5 flex-shrink-0 mt-0.5 text-primary-green" />
						<div>
							<p className="font-semibold text-accent-dark-green text-sm mb-1">
								Email
							</p>
							<a
								href={`mailto:${location.email}`}
								className="text-accent-dark-brown hover:text-primary-green transition-colors"
							>
								{location.email}
							</a>
						</div>
					</div>
				)}

				{/* Business Hours */}
				{schedule && scheduleGroups.length > 0 && (
					<div className="bg-white rounded-xl p-4">
						<div className="flex items-center space-x-2 mb-3">
							<ClockIcon className="w-5 h-5 text-primary-green" />
							<p className="font-semibold text-accent-dark-green text-sm">
								Business Hours
							</p>
						</div>
						<div className="space-y-2">
							{scheduleGroups.map((group, index) => (
								<div
									key={index}
									className="flex justify-between items-center py-1"
								>
									<span className="text-accent-dark-brown font-medium text-sm">
										{formatDayRange(group.days)}
									</span>
									<span
										className={`text-sm font-semibold ${
											group.isOpen ? "text-green-700" : "text-red-700"
										}`}
									>
										{group.hours}
									</span>
								</div>
							))}
						</div>
					</div>
				)}
			</div>

			{/* Action Buttons */}
			<div className="grid grid-cols-2 gap-4">
				<a
					href={(() => {
						// Build address from structured fields
						const addressParts = [];
						if (location.address_line1)
							addressParts.push(location.address_line1);
						if (location.address_line2)
							addressParts.push(location.address_line2);
						if (location.city) addressParts.push(location.city);
						if (location.state) addressParts.push(location.state);
						if (location.postal_code) addressParts.push(location.postal_code);

						if (addressParts.length > 0) {
							const address = addressParts.join(", ");
							return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
								address
							)}`;
						} else {
							return `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`;
						}
					})()}
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center justify-center space-x-2 bg-primary-green hover:bg-accent-dark-green text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg text-center"
				>
					<MapPinIcon className="w-5 h-5" />
					<span>Directions</span>
				</a>
				<a
					href={`tel:${location.phone}`}
					className="flex items-center justify-center space-x-2 bg-accent-warm-brown hover:bg-accent-dark-brown text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg text-center"
				>
					<PhoneIcon className="w-5 h-5" />
					<span>Call Now</span>
				</a>
			</div>
		</div>
	);
};

const LocationsPage = () => {
	const { locations, loading, error } = useLocationSelector();
	const { location: userLocation } = useGeolocation({ autoRequest: true });
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedLocation, setSelectedLocation] = useState(null);

	// Add distances to locations if user location is available
	const locationsWithDistance = useMemo(() => {
		if (!userLocation || !locations.length) return locations;

		return locations
			.map((loc) => ({
				...loc,
				distance: calculateDistance(
					userLocation.latitude,
					userLocation.longitude,
					loc.latitude,
					loc.longitude,
					"miles"
				),
			}))
			.sort((a, b) => a.distance - b.distance);
	}, [locations, userLocation]);

	// Filter locations based on search query
	const filteredLocations = useMemo(() => {
		if (!searchQuery.trim()) return locationsWithDistance;

		const query = searchQuery.toLowerCase();
		return locationsWithDistance.filter((location) => {
			return (
				location.name?.toLowerCase().includes(query) ||
				location.address_line1?.toLowerCase().includes(query) ||
				location.address_line2?.toLowerCase().includes(query) ||
				location.city?.toLowerCase().includes(query) ||
				location.state?.toLowerCase().includes(query) ||
				location.postal_code?.toLowerCase().includes(query) ||
				`${location.city} ${location.state}`.toLowerCase().includes(query)
			);
		});
	}, [locationsWithDistance, searchQuery]);

	// Combined structured data: breadcrumbs + LocalBusiness for each location
	const structuredData = useMemo(() => {
		const breadcrumbData = generateBreadcrumbStructuredData([
			{ name: "Home", url: "https://bakeajeen.com" },
			{ name: "Locations", url: "https://bakeajeen.com/locations" },
		]);

		const businessSchema = generateLocalBusinessSchema(locations);

		// Combine both schemas
		if (businessSchema) {
			return [breadcrumbData, businessSchema];
		}
		return breadcrumbData;
	}, [locations]);

	const handleLocationClick = (location) => {
		setSelectedLocation(location);
		// Smooth scroll to detail panel on mobile
		if (window.innerWidth < 1024) {
			setTimeout(() => {
				document.getElementById("location-detail-panel")?.scrollIntoView({
					behavior: "smooth",
					block: "nearest",
				});
			}, 100);
		}
	};

	if (loading) {
		return (
			<div className="min-h-screen bg-gradient-to-b from-accent-cream via-white to-accent-olive-green/5 flex items-center justify-center">
				<div className="text-center">
					<div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary-green mx-auto mb-4"></div>
					<p className="text-accent-dark-brown text-lg">Loading locations...</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="min-h-screen bg-gradient-to-b from-accent-cream via-white to-accent-olive-green/5 flex items-center justify-center">
				<div className="text-center">
					<p className="text-red-600 text-lg">
						Error loading locations: {error.message}
					</p>
				</div>
			</div>
		);
	}

	return (
		<>
			<SEO
				title="Our Locations - Ajeen Bakery | Find a Store Near You"
				description="Find an Ajeen Bakery location near you. Fresh Middle Eastern cuisine, manaeesh, and authentic flavors at multiple locations. View hours, directions, and contact information."
				keywords="ajeen bakery locations, middle eastern restaurant near me, manaeesh bakery, store locations, restaurant finder, ajeen near me"
				url="https://bakeajeen.com/locations"
				type="website"
				structuredData={structuredData}
			/>

			<div className="min-h-screen bg-gradient-to-b from-accent-cream via-white to-accent-olive-green/5">
				{/* Hero Section */}
				<div className="bg-gradient-to-r from-primary-green to-accent-dark-green text-white py-16">
					<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
						<div className="inline-block p-4 bg-white/20 rounded-2xl backdrop-blur-sm mb-6">
							<MapPinIcon className="w-16 h-16 mx-auto" />
						</div>
						<h1 className="text-4xl md:text-5xl font-black mb-4">
							Find an Ajeen Bakery Near You
						</h1>
						<p className="text-xl text-white/90 max-w-2xl mx-auto">
							Discover fresh-baked manaeesh and authentic Middle Eastern flavors
							at a location near you
						</p>
						{locations.length > 0 && (
							<p className="mt-4 text-white/80 text-lg">
								{locations.length}{" "}
								{locations.length === 1 ? "Location" : "Locations"} Available
							</p>
						)}
					</div>
				</div>

				{/* Main Content */}
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
					<div className="grid lg:grid-cols-5 gap-8">
						{/* Left Column - Search, Location List, and Detail Panel */}
						<div className="lg:col-span-2 space-y-6">
							{/* Search Bar */}
							<div className="bg-white rounded-2xl shadow-lg p-6 border-2 border-primary-green/20">
								<label
									htmlFor="location-search"
									className="block text-sm font-semibold text-accent-dark-green mb-2"
								>
									Search Locations
								</label>
								<div className="relative">
									<MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-accent-subtle-gray" />
									<input
										id="location-search"
										type="text"
										value={searchQuery}
										onChange={(e) => setSearchQuery(e.target.value)}
										placeholder="Search by name, city, or address..."
										className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-accent-subtle-gray/30 focus:border-primary-green focus:ring-4 focus:ring-primary-green/10 outline-none transition-all bg-white text-accent-dark-brown placeholder-accent-subtle-gray"
									/>
								</div>
								{searchQuery && (
									<p className="mt-2 text-sm text-accent-dark-brown/70">
										Found {filteredLocations.length}{" "}
										{filteredLocations.length === 1 ? "location" : "locations"}
									</p>
								)}
							</div>

							{/* Location List */}
							<div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
								{filteredLocations.length === 0 ? (
									<div className="bg-white rounded-2xl shadow-lg p-8 text-center border-2 border-accent-subtle-gray/20">
										<p className="text-accent-dark-brown">
											No locations found matching your search.
										</p>
									</div>
								) : (
									filteredLocations.map((location, index) => (
										<LocationCard
											key={location.id}
											location={location}
											index={index}
											selectedLocation={selectedLocation}
											onClick={() => handleLocationClick(location)}
										/>
									))
								)}
							</div>

							{/* Selected Location Detail Panel - Under List */}
							{selectedLocation && (
								<div id="location-detail-panel">
									<LocationDetailPanel location={selectedLocation} />
								</div>
							)}
						</div>

						{/* Right Column - Map */}
						<div className="lg:col-span-3">
							<div className="sticky top-24">
								<MultiLocationMap
									locations={filteredLocations}
									selectedLocation={selectedLocation}
									onLocationSelect={setSelectedLocation}
									height={700}
									showNumbers={true}
									className="border-4 border-white"
								/>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Custom scrollbar styles */}
			<style>{`
				.custom-scrollbar::-webkit-scrollbar {
					width: 8px;
				}
				.custom-scrollbar::-webkit-scrollbar-track {
					background: #f1f1f1;
					border-radius: 10px;
				}
				.custom-scrollbar::-webkit-scrollbar-thumb {
					background: #4A7C2C;
					border-radius: 10px;
				}
				.custom-scrollbar::-webkit-scrollbar-thumb:hover {
					background: #2D5016;
				}
			`}</style>
		</>
	);
};

export default LocationsPage;
