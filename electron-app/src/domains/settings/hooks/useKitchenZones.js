import { useQuery } from "@tanstack/react-query";
import { getKitchenZonesWithPrinters } from "@/shared/lib/hardware/printerService";

/**
 * Hook to fetch kitchen zones with their associated printers from cloud config
 * This replaces the old local Zustand-based kitchen zones
 */
export const useKitchenZones = () => {
	return useQuery({
		queryKey: ["kitchen-zones-cloud"],
		queryFn: getKitchenZonesWithPrinters,
		staleTime: 5 * 60 * 1000, // 5 minutes
		cacheTime: 10 * 60 * 1000, // 10 minutes
		retry: 2,
		refetchOnWindowFocus: false,
	});
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
