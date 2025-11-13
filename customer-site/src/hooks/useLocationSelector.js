/**
 * useLocationSelector Hook
 *
 * Smart location selection logic:
 * - Fetches locations that accept web orders
 * - Auto-selects if only 1 location exists
 * - Integrates with cart to set selected location
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import locationsAPI from "@/api/locations";
import cartAPI from "@/api/cart";
import { cartKeys } from "@/hooks/useCart";

export const locationKeys = {
	all: ["locations"],
	webOrders: () => [...locationKeys.all, "web-orders"],
};

export const useLocationSelector = () => {
	const queryClient = useQueryClient();
	const [selectedLocationId, setSelectedLocationId] = useState(null);

	// Get current cart to check if location is already set (for initialization only)
	const cartData = queryClient.getQueryData(cartKeys.current());

	// Initialize selectedLocationId from cart on mount (only if not already set)
	useEffect(() => {
		if (cartData?.store_location_id && !selectedLocationId) {
			setSelectedLocationId(cartData.store_location_id);
		}
	}, [cartData?.store_location_id]);

	// Fetch locations that accept web orders
	const {
		data: locations = [],
		isLoading,
		error
	} = useQuery({
		queryKey: locationKeys.webOrders(),
		queryFn: locationsAPI.getWebOrderLocations,
		staleTime: 5 * 60 * 1000, // 5 minutes
		cacheTime: 10 * 60 * 1000, // 10 minutes
	});

	// Mutation to set location in cart
	const setCartLocationMutation = useMutation({
		mutationFn: (locationId) => cartAPI.setLocation(locationId),
		onSuccess: () => {
			// Invalidate cart query to refresh with new location and tax calculation
			queryClient.invalidateQueries({ queryKey: cartKeys.current() });
		},
		onError: (error) => {
			console.error("Failed to set cart location:", error);
		},
	});

	// Smart auto-selection: if only 1 location, auto-select it
	useEffect(() => {
		if (!isLoading && locations.length === 1 && !selectedLocationId) {
			const autoSelectedId = locations[0].id;
			setSelectedLocationId(autoSelectedId);
			// Automatically set in cart when auto-selected
			setCartLocationMutation.mutate(autoSelectedId);
		}
	}, [locations, isLoading, selectedLocationId]);

	/**
	 * Select a location and update cart
	 */
	const selectLocation = async (locationId) => {
		setSelectedLocationId(locationId);
		await setCartLocationMutation.mutateAsync(locationId);
	};

	/**
	 * Get the currently selected location object
	 */
	const selectedLocation = selectedLocationId
		? locations.find(loc => loc.id === selectedLocationId)
		: null;

	/**
	 * Check if selection is required (multiple locations available)
	 */
	const selectionRequired = locations.length > 1;

	/**
	 * Check if location is locked (only 1 location, auto-selected)
	 */
	const isLocked = locations.length === 1;

	/**
	 * Format address for display
	 */
	const formatAddress = (location) => {
		if (!location) return "";

		const parts = [];
		if (location.address_line1) parts.push(location.address_line1);
		if (location.city && location.state) {
			parts.push(`${location.city}, ${location.state} ${location.postal_code || ""}`.trim());
		}
		return parts.join(", ");
	};

	return {
		locations,
		selectedLocationId,
		selectedLocation,
		isLoading,
		error,
		selectLocation,
		selectionRequired,
		isLocked,
		formatAddress,
		isSettingLocation: setCartLocationMutation.isLoading,
	};
};

export default useLocationSelector;
