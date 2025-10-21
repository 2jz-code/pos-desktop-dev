import React, {
	createContext,
	useContext,
	useState,
	useEffect,
	ReactNode,
} from "react";
import apiClient from "@/services/api/client";
import { useAuth } from "@/contexts/AuthContext";

export interface StoreLocation {
	id: number;
	name: string;
	address_line1: string;
	address_line2?: string;
	city: string;
	state: string;
	postal_code: string;
	country: string;
	phone?: string;
	email?: string;
	is_active: boolean;
}

interface LocationContextType {
	locations: StoreLocation[];
	selectedLocation: StoreLocation | null;
	selectedLocationId: number | null;
	setSelectedLocationId: (id: number | null) => void;
	isLoading: boolean;
	error: string | null;
}

const LocationContext = createContext<LocationContextType | undefined>(
	undefined
);

export function LocationProvider({ children }: { children: ReactNode }) {
	const { tenant } = useAuth(); // Get tenant from auth context
	const [locations, setLocations] = useState<StoreLocation[]>([]);
	const [selectedLocationId, setSelectedLocationId] = useState<number | null>(
		() => {
			// Persist selected location in localStorage
			const stored = localStorage.getItem("selected-location-id");
			return stored ? parseInt(stored, 10) : null;
		}
	);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Fetch available locations when tenant changes
	useEffect(() => {
		// Don't fetch if no tenant
		if (!tenant) {
			setLocations([]);
			// Don't clear selectedLocationId - preserve the value from localStorage
			// It will be validated when tenant loads and locations are fetched
			setIsLoading(false);
			return;
		}

		const fetchLocations = async () => {
			try {
				setIsLoading(true);
				const response = await apiClient.get(
					"/settings/store-locations/"
				);

				// Handle both array and paginated response
				const locationData = Array.isArray(response.data)
					? response.data
					: response.data?.results || [];

				setLocations(locationData);

				// Auto-select if only one location exists (improves UX for single-location tenants)
				// Clear selected location if it doesn't exist in new tenant
				setSelectedLocationId((prevId) => {
					// Auto-select the only location for single-location tenants
					if (locationData.length === 1) {
						const singleLocationId = locationData[0].id;
						localStorage.setItem("selected-location-id", singleLocationId.toString());
						return singleLocationId;
					}

					// Clear selected location if it doesn't exist in new tenant
					if (prevId && !locationData.find((loc: StoreLocation) => loc.id === prevId)) {
						localStorage.removeItem("selected-location-id");
						return null;
					}
					return prevId;
				});

				setError(null);
			} catch (err: any) {
				console.error("Failed to fetch store locations:", err);
				setError(
					err.response?.data?.message || "Failed to load store locations"
				);
			} finally {
				setIsLoading(false);
			}
		};

		fetchLocations();
	}, [tenant?.id]); // Refetch when tenant changes

	// Persist selected location to localStorage
	useEffect(() => {
		if (selectedLocationId !== null) {
			localStorage.setItem(
				"selected-location-id",
				selectedLocationId.toString()
			);
		} else {
			localStorage.removeItem("selected-location-id");
		}
	}, [selectedLocationId]);

	// Get the full location object for the selected ID
	const selectedLocation = selectedLocationId
		? locations.find((loc) => loc.id === selectedLocationId) || null
		: null;

	return (
		<LocationContext.Provider
			value={{
				locations,
				selectedLocation,
				selectedLocationId,
				setSelectedLocationId,
				isLoading,
				error,
			}}
		>
			{children}
		</LocationContext.Provider>
	);
}

export function useLocation() {
	const context = useContext(LocationContext);
	if (context === undefined) {
		throw new Error("useLocation must be used within a LocationProvider");
	}
	return context;
}
