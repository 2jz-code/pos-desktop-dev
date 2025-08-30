import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
	Settings,
	User,
	ArrowUpDown,
	AlertTriangle,
	Package,
	Trash2,
	Plus,
	Archive,
	MoreHorizontal,
	Shield,
} from "lucide-react";
import { getActiveStockReasons, getStockReasonCategories } from "@/domains/settings/services/settingsService";

const getCategoryIcon = (category) => {
	const icons = {
		SYSTEM: Settings,
		MANUAL: User,
		TRANSFER: ArrowUpDown,
		CORRECTION: AlertTriangle,
		INVENTORY: Package,
		WASTE: Trash2,
		RESTOCK: Plus,
		BULK: Archive,
		OTHER: MoreHorizontal,
	};
	return icons[category] || MoreHorizontal;
};

const getCategoryColorClasses = (color) => {
	const colorMap = {
		gray: "bg-gray-100 text-gray-800",
		blue: "bg-blue-100 text-blue-800",
		purple: "bg-purple-100 text-purple-800",
		orange: "bg-orange-100 text-orange-800",
		green: "bg-green-100 text-green-800",
		red: "bg-red-100 text-red-800",
		emerald: "bg-emerald-100 text-emerald-800",
		indigo: "bg-indigo-100 text-indigo-800",
		slate: "bg-slate-100 text-slate-800",
	};
	return colorMap[color] || colorMap.slate;
};

export const ReasonSelector = ({
	value,
	onValueChange,
	placeholder = "Select a reason",
	categoryFilter = null,
	showUsageStats = false,
	disabled = false,
	required = false,
}) => {
	// Fetch active stock reasons
	const {
		data: reasons = [],
		isLoading: reasonsLoading,
		error: reasonsError,
	} = useQuery({
		queryKey: ["stock-reasons", "active", categoryFilter],
		queryFn: () => getActiveStockReasons(categoryFilter),
	});

	// Fetch categories for grouping
	const {
		data: categories = [],
		isLoading: categoriesLoading,
	} = useQuery({
		queryKey: ["stock-reason-categories"],
		queryFn: getStockReasonCategories,
	});

	console.log("ReasonSelector - Loading:", reasonsLoading);
	console.log("ReasonSelector - Reasons:", reasons);
	console.log("ReasonSelector - Error:", reasonsError);
	console.log("ReasonSelector - Category Filter:", categoryFilter);

	const groupedReasons = useMemo(() => {
		if (!reasons.length || !categories.length) return {};

		const groups = {};
		
		// Initialize groups
		categories.forEach((category) => {
			groups[category.value] = {
				label: category.label,
				color: category.color,
				reasons: [],
			};
		});

		// Group reasons by category
		reasons.forEach((reason) => {
			if (groups[reason.category]) {
				groups[reason.category].reasons.push(reason);
			}
		});

		// Remove empty groups
		Object.keys(groups).forEach((key) => {
			if (groups[key].reasons.length === 0) {
				delete groups[key];
			}
		});

		return groups;
	}, [reasons, categories]);

	if (reasonsLoading || categoriesLoading) {
		return <Skeleton className="h-9 w-full" />;
	}

	if (reasonsError) {
		return (
			<Select disabled>
				<SelectTrigger className="border-red-200">
					<SelectValue placeholder="Error loading reasons" />
				</SelectTrigger>
			</Select>
		);
	}

	const selectedReason = reasons.find((r) => r.id.toString() === value?.toString());

	return (
		<Select 
			value={value?.toString() || ""} 
			onValueChange={onValueChange}
			disabled={disabled}
			required={required}
		>
			<SelectTrigger>
				<SelectValue>
					{selectedReason ? (
						<div className="flex items-center gap-2">
							{React.createElement(getCategoryIcon(selectedReason.category), {
								className: "h-4 w-4",
							})}
							<span>{selectedReason.name}</span>
							{selectedReason.is_system_reason && (
								<Shield className="h-3 w-3 text-muted-foreground" />
							)}
						</div>
					) : (
						placeholder
					)}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{Object.entries(groupedReasons).map(([categoryKey, categoryData]) => {
					const Icon = getCategoryIcon(categoryKey);
					return (
						<SelectGroup key={categoryKey}>
							<SelectLabel className="flex items-center gap-2 py-2">
								<Icon className="h-4 w-4" />
								<Badge 
									variant="secondary"
									className={getCategoryColorClasses(categoryData.color)}
								>
									{categoryData.label}
								</Badge>
							</SelectLabel>
							{categoryData.reasons.map((reason) => {
								const ReasonIcon = getCategoryIcon(reason.category);
								return (
									<SelectItem 
										key={reason.id} 
										value={reason.id.toString()}
										className="pl-8"
									>
										<div className="flex items-center gap-2 w-full">
											<ReasonIcon className="h-3 w-3" />
											<span className="flex-1">{reason.name}</span>
											<div className="flex items-center gap-1 ml-2">
												{reason.is_system_reason && (
													<Shield className="h-3 w-3 text-muted-foreground" />
												)}
												{showUsageStats && reason.usage_count > 0 && (
													<Badge variant="outline" className="text-xs px-1 py-0">
														{reason.usage_count}
													</Badge>
												)}
											</div>
										</div>
									</SelectItem>
								);
							})}
						</SelectGroup>
					);
				})}
				{Object.keys(groupedReasons).length === 0 && (
					<div className="p-2 text-center text-muted-foreground text-sm">
						No reasons available
					</div>
				)}
			</SelectContent>
		</Select>
	);
};

export default ReasonSelector;