import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getActiveStockReasons, getStockReasonCategories } from "@/services/api/settingsService";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
	Tag,
} from "lucide-react";

interface StockReason {
	id: number;
	name: string;
	description?: string;
	category: string;
	category_display: string;
	is_system_reason: boolean;
	usage_count: number;
}

interface ReasonSelectorProps {
	value?: string;
	onValueChange: (value: string) => void;
	placeholder?: string;
	categoryFilter?: string;
	disabled?: boolean;
	className?: string;
	showCategoryBadges?: boolean;
	showUsageStats?: boolean;
}

const getCategoryIcon = (category: string) => {
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
	return icons[category as keyof typeof icons] || Tag;
};

const getCategoryColor = (category: string) => {
	const colors = {
		SYSTEM: "text-muted-foreground",
		MANUAL: "text-primary",
		INVENTORY: "text-emerald-600",
		WASTE: "text-destructive",
		RESTOCK: "text-emerald-600",
		TRANSFER: "text-purple-600",
		CORRECTION: "text-warning",
		BULK: "text-indigo-600",
		OTHER: "text-muted-foreground",
	};
	return colors[category as keyof typeof colors] || colors.OTHER;
};

export const ReasonSelector: React.FC<ReasonSelectorProps> = ({
	value,
	onValueChange,
	placeholder = "Select a reason...",
	categoryFilter,
	disabled = false,
	className,
	showCategoryBadges = true,
	showUsageStats = false,
}) => {
	const { data: reasons, isLoading: reasonsLoading } = useQuery({
		queryKey: ["active-stock-reasons", categoryFilter],
		queryFn: () => getActiveStockReasons(categoryFilter),
	});

	const { data: categories } = useQuery({
		queryKey: ["stock-reason-categories"],
		queryFn: getStockReasonCategories,
	});

	// Group reasons by category for organized display
	const groupedReasons = useMemo(() => {
		if (!reasons || !categories) return {};

		const groups: { [key: string]: StockReason[] } = {};
		
		// Initialize groups based on categories
		categories.forEach((category: any) => {
			groups[category.value] = [];
		});

		// Group reasons by category
		reasons.forEach((reason: StockReason) => {
			if (groups[reason.category]) {
				groups[reason.category].push(reason);
			}
		});

		// Sort reasons within each category
		// System reasons first, then by usage count (high to low), then alphabetically
		Object.keys(groups).forEach(categoryKey => {
			groups[categoryKey].sort((a, b) => {
				if (a.is_system_reason && !b.is_system_reason) return -1;
				if (!a.is_system_reason && b.is_system_reason) return 1;
				if (showUsageStats && b.usage_count !== a.usage_count) {
					return b.usage_count - a.usage_count;
				}
				return a.name.localeCompare(b.name);
			});
		});

		// Remove empty groups
		Object.keys(groups).forEach(key => {
			if (groups[key].length === 0) {
				delete groups[key];
			}
		});

		return groups;
	}, [reasons, categories, showUsageStats]);

	// Find selected reason for display
	const selectedReason = useMemo(() => {
		if (!value || !reasons) return null;
		return reasons.find((reason: StockReason) => reason.id.toString() === value);
	}, [value, reasons]);

	if (reasonsLoading) {
		return (
			<Select disabled>
				<SelectTrigger className={className}>
					<SelectValue placeholder="Loading reasons..." />
				</SelectTrigger>
			</Select>
		);
	}

	if (!reasons || reasons.length === 0) {
		return (
			<Select disabled>
				<SelectTrigger className={className}>
					<SelectValue placeholder="No reasons available" />
				</SelectTrigger>
			</Select>
		);
	}

	return (
		<Select value={value} onValueChange={onValueChange} disabled={disabled}>
			<SelectTrigger className={className}>
				<SelectValue placeholder={placeholder}>
					{selectedReason && (
						<div className="flex items-center gap-2">
							{showCategoryBadges && (
								<Badge variant="outline" className={`${getCategoryColor(selectedReason.category)} text-xs`}>
									{selectedReason.category_display}
								</Badge>
							)}
							<span className="truncate">{selectedReason.name}</span>
							{showUsageStats && selectedReason.usage_count > 0 && (
								<span className="text-xs text-muted-foreground ml-auto">
									({selectedReason.usage_count} uses)
								</span>
							)}
						</div>
					)}
				</SelectValue>
			</SelectTrigger>
			<SelectContent className="max-w-md">
				{Object.entries(groupedReasons).map(([categoryKey, categoryReasons]) => {
					const category = categories?.find((cat: any) => cat.value === categoryKey);
					const CategoryIcon = getCategoryIcon(categoryKey);
					
					return (
						<SelectGroup key={categoryKey}>
							<SelectLabel className="flex items-center gap-2 text-xs font-medium">
								<CategoryIcon className={`h-3 w-3 ${getCategoryColor(categoryKey)}`} />
								{category?.label || categoryKey}
								<span className="text-muted-foreground">
									({categoryReasons.length})
								</span>
							</SelectLabel>
							{categoryReasons.map((reason: StockReason) => (
								<SelectItem
									key={reason.id}
									value={reason.id.toString()}
									className="py-3"
								>
									<div className="flex items-center justify-between w-full min-w-0">
										<div className="flex items-center gap-2 min-w-0 flex-1">
											{reason.is_system_reason && (
												<Settings className="h-3 w-3 text-primary flex-shrink-0" />
											)}
											<div className="min-w-0 flex-1">
												<div className="font-medium truncate">{reason.name}</div>
												{reason.description && (
													<div className="text-xs text-muted-foreground truncate mt-0.5">
														{reason.description}
													</div>
												)}
											</div>
										</div>
										{showUsageStats && reason.usage_count > 0 && (
											<div className="text-xs text-muted-foreground flex-shrink-0 ml-2">
												{reason.usage_count} uses
											</div>
										)}
									</div>
								</SelectItem>
							))}
						</SelectGroup>
					);
				})}
			</SelectContent>
		</Select>
	);
};

// Convenience component for common use cases
export const StockAdjustmentReasonSelector: React.FC<Omit<ReasonSelectorProps, "categoryFilter">> = (props) => (
	<ReasonSelector {...props} showUsageStats={true} />
);

export const TransferReasonSelector: React.FC<Omit<ReasonSelectorProps, "categoryFilter">> = (props) => (
	<ReasonSelector {...props} categoryFilter="TRANSFER" />
);

export const CorrectionReasonSelector: React.FC<Omit<ReasonSelectorProps, "categoryFilter">> = (props) => (
	<ReasonSelector {...props} categoryFilter="CORRECTION" />
);