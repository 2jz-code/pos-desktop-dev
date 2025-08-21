import { Truck, Car } from "lucide-react";

/**
 * Configuration for delivery platforms
 * This should match the OrderType choices in the backend for delivery platforms
 */
export const DELIVERY_PLATFORMS = [
	{
		id: "DOORDASH",
		name: "DoorDash", 
		displayName: "DoorDash",
		icon: Truck,
		color: "#FF6B35",
		enabled: true,
		description: "DoorDash delivery orders"
	},
	{
		id: "UBER_EATS",
		name: "Uber Eats",
		displayName: "Uber Eats", 
		icon: Car,
		color: "#000000",
		enabled: true,
		description: "Uber Eats delivery orders"
	}
];

/**
 * Get all enabled delivery platforms
 */
export const getEnabledPlatforms = () => {
	return DELIVERY_PLATFORMS.filter(platform => platform.enabled);
};

/**
 * Get platform by ID
 */
export const getPlatformById = (id) => {
	return DELIVERY_PLATFORMS.find(platform => platform.id === id);
};

/**
 * Check if an order type is a delivery platform
 */
export const isDeliveryPlatform = (orderType) => {
	return DELIVERY_PLATFORMS.some(platform => platform.id === orderType);
};

/**
 * Get all delivery platform IDs
 */
export const getDeliveryPlatformIds = () => {
	return DELIVERY_PLATFORMS.map(platform => platform.id);
};