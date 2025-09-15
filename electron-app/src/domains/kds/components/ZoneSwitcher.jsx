import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui";
import { ChefHat } from "lucide-react";
import { useKitchenZones } from "@/domains/settings/hooks/useKitchenZones";

/**
 * Zone Switcher Component
 * Allows quick switching between kitchen zones from the KDS interface
 */
export function ZoneSwitcher({ selectedZone, onZoneChange }) {
	const { data: kitchenZones = [], isLoading } = useKitchenZones();

	if (isLoading || kitchenZones.length <= 1) {
		return null; // Don't show if loading or only one zone
	}

	return (
		<div className="flex items-center space-x-2">
			<ChefHat className="h-4 w-4 text-gray-400" />
			<Select
				value={selectedZone}
				onValueChange={onZoneChange}
			>
				<SelectTrigger className="w-40">
					<SelectValue placeholder="Select zone..." />
				</SelectTrigger>
				<SelectContent>
					{kitchenZones.map((zone) => (
						<SelectItem
							key={zone.name}
							value={zone.name}
						>
							<div className="flex items-center space-x-2">
								<ChefHat className="h-4 w-4 text-green-600" />
								<span>{zone.name}</span>
							</div>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}