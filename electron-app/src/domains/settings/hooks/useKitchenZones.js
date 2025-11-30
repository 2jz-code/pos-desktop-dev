import { useState, useEffect } from "react";

/**
 * Hook to fetch kitchen zones with their associated printers
 * Uses direct fetch with local state instead of react-query to ensure
 * offline cache is always checked
 */
export const useKitchenZones = () => {
	const [data, setData] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		const fetchKitchenZones = async () => {
			console.log("[useKitchenZones] Fetching kitchen zones...");
			setIsLoading(true);
			setError(null);

			try {
				// Import dynamically to avoid circular dependency issues
				const { getKitchenZonesWithPrinters } = await import("@/shared/lib/hardware/printerService");
				const result = await getKitchenZonesWithPrinters();
				console.log("[useKitchenZones] Result:", result);
				setData(result || []);
			} catch (err) {
				console.error("[useKitchenZones] Error:", err);
				setError(err);
				setData([]);
			} finally {
				setIsLoading(false);
			}
		};

		fetchKitchenZones();
	}, []);

	console.log("[useKitchenZones] State:", { data, isLoading, error });

	return { data, isLoading, isError: !!error, error };
};

/**
 * Hook to get a specific kitchen zone by name
 */
export const useKitchenZone = (zoneName) => {
	const { data: zones = [], ...rest } = useKitchenZones();

	const zone = zones.find((z) => z.name === zoneName);

	return {
		...rest,
		data: zone,
	};
};
