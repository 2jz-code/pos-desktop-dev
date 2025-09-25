"use client";

import { usePosStore } from "@/domains/pos/store/posStore";
import { Store, Utensils } from "lucide-react";

const DiningPreferenceButtons = () => {
	const { diningPreference, setDiningPreference } = usePosStore();

	const handleDiningPreference = (preference) => {
		setDiningPreference(preference);
	};

	return (
		<div className="px-4 py-3 border-b border-border/60">
			<div className="flex space-x-2">
				<button
					onClick={() => handleDiningPreference("DINE_IN")}
					className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
						diningPreference === "DINE_IN"
							? "bg-blue-500 text-white shadow-sm"
							: "bg-card text-foreground border border-border/60 hover:bg-muted/40"
					}`}
				>
					<Utensils size={16} />
					<span>Dine In</span>
				</button>
				<button
					onClick={() => handleDiningPreference("TAKE_OUT")}
					className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
						diningPreference === "TAKE_OUT"
							? "bg-green-500 text-white shadow-sm"
							: "bg-card text-foreground border border-border/60 hover:bg-muted/40"
					}`}
				>
					<Store size={16} />
					<span>Take Out</span>
				</button>
			</div>
		</div>
	);
};

export default DiningPreferenceButtons;