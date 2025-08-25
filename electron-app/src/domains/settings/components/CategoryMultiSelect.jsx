import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
} from "@/shared/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/shared/components/ui/popover";
import { Badge } from "@/shared/components/ui/badge";
import { getCategories } from "@/domains/products/services/categoryService";

export function CategoryMultiSelect({
	value = [],
	onChange,
	placeholder = "Select categories...",
	className,
}) {
	const [open, setOpen] = useState(false);
	const [selectedCategories, setSelectedCategories] = useState([]);

	// Fetch categories from the API
	const { data: categoriesResponse, isLoading } = useQuery({
		queryKey: ["categories-all"],
		queryFn: () => getCategories(),
		staleTime: 5 * 60 * 1000, // 5 minutes
	});

	const categories = categoriesResponse?.data?.results || [];

	// Convert value (array of IDs) to category objects on mount/value change
	useEffect(() => {
		if (value && value.length > 0 && categories.length > 0) {
			const categoryObjects = value
				.map((id) => categories.find((cat) => cat.id === parseInt(id)))
				.filter(Boolean);
			setSelectedCategories(categoryObjects);
		} else {
			setSelectedCategories([]);
		}
	}, [value, categories]);

	// Handle category selection
	const handleSelect = (category) => {
		const isSelected = selectedCategories.some((c) => c.id === category.id);
		let newSelected;

		if (isSelected) {
			newSelected = selectedCategories.filter((c) => c.id !== category.id);
		} else {
			newSelected = [...selectedCategories, category];
		}

		setSelectedCategories(newSelected);

		// Convert back to IDs for the form
		const categoryIds = newSelected.map((c) => c.id);
		onChange(categoryIds);
	};

	// Remove a selected category
	const handleRemove = (categoryToRemove) => {
		const newSelected = selectedCategories.filter(
			(c) => c.id !== categoryToRemove.id
		);
		setSelectedCategories(newSelected);

		// Convert back to IDs for the form
		const categoryIds = newSelected.map((c) => c.id);
		onChange(categoryIds);
	};

	// Format the display text for selected categories
	const getDisplayText = () => {
		if (selectedCategories.length === 0) return placeholder;
		if (selectedCategories.length === 1) return selectedCategories[0].name;
		return `${selectedCategories.length} categories selected`;
	};

	if (isLoading) {
		return (
			<Button
				variant="outline"
				className={cn("w-full justify-between", className)}
				disabled
			>
				Loading categories...
				<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
			</Button>
		);
	}

	return (
		<div className="space-y-2">
			<Popover
				open={open}
				onOpenChange={setOpen}
			>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						role="combobox"
						aria-expanded={open}
						className={cn("w-full justify-between", className)}
					>
						{getDisplayText()}
						<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-full p-0">
					<Command>
						<CommandInput placeholder="Search categories..." />
						<CommandEmpty>No categories found.</CommandEmpty>
						<CommandGroup className="max-h-64 overflow-auto">
							{categories.map((category) => {
								const isSelected = selectedCategories.some(
									(c) => c.id === category.id
								);
								const displayName = category.parent
									? `${category.parent.name} → ${category.name}`
									: category.name;

								return (
									<CommandItem
										key={category.id}
										value={displayName}
										onSelect={() => handleSelect(category)}
									>
										<Check
											className={cn(
												"mr-2 h-4 w-4",
												isSelected ? "opacity-100" : "opacity-0"
											)}
										/>
										{displayName}
									</CommandItem>
								);
							})}
						</CommandGroup>
					</Command>
				</PopoverContent>
			</Popover>

			{/* Selected categories badges */}
			{selectedCategories.length > 0 && (
				<div className="flex flex-wrap gap-1">
					{selectedCategories.map((category) => (
						<Badge
							key={category.id}
							variant="secondary"
							className="text-xs"
						>
							{category.parent
								? `${category.parent.name} → ${category.name}`
								: category.name}
							<Button
								variant="ghost"
								size="sm"
								className="ml-1 h-auto p-0 text-muted-foreground hover:text-foreground"
								onClick={() => handleRemove(category)}
							>
								<X className="h-3 w-3" />
							</Button>
						</Badge>
					))}
				</div>
			)}
		</div>
	);
}
