"use client";

import { usePosStore } from "@/domains/pos/store/posStore";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Button } from "@/shared/components/ui/button";
import { Filter, X } from "lucide-react";
import { shallow } from "zustand/shallow";

const ProductFilter = () => {
	const {
		parentCategories,
		childCategories,
		selectedParentCategory,
		selectedChildCategory,
		setSelectedParentCategory,
		setSelectedChildCategory,
		resetFilters,
	} = usePosStore(
		(state) => ({
			parentCategories: state.parentCategories,
			childCategories: state.childCategories,
			selectedParentCategory: state.selectedParentCategory,
			selectedChildCategory: state.selectedChildCategory,
			setSelectedParentCategory: state.setSelectedParentCategory,
			setSelectedChildCategory: state.setSelectedChildCategory,
			resetFilters: state.resetFilters,
		}),
		shallow
	);

	const hasActiveFilters = selectedParentCategory !== "all";

	return (
		<div className="flex items-center gap-4 mb-6">
			<div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
				<Filter className="h-4 w-4" />
				<span className="text-sm font-medium">Filter by:</span>
			</div>

			<Select
				onValueChange={setSelectedParentCategory}
				value={selectedParentCategory}
			>
				<SelectTrigger className="w-[200px] border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
					<SelectValue placeholder="Select category" />
				</SelectTrigger>
				<SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
					<SelectItem
						value="all"
						className="hover:bg-slate-100 dark:hover:bg-slate-800"
					>
						All Categories
					</SelectItem>
					{parentCategories.map((category) => (
						<SelectItem
							key={category.id}
							value={String(category.id)}
							className="hover:bg-slate-100 dark:hover:bg-slate-800"
						>
							{category.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			{selectedParentCategory !== "all" && childCategories.length > 0 && (
				<Select
					onValueChange={setSelectedChildCategory}
					value={selectedChildCategory}
				>
					<SelectTrigger className="w-[200px] border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
						<SelectValue placeholder="Select subcategory" />
					</SelectTrigger>
					<SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
						<SelectItem
							value="all"
							className="hover:bg-slate-100 dark:hover:bg-slate-800"
						>
							All Subcategories
						</SelectItem>
						{childCategories.map((category) => (
							<SelectItem
								key={category.id}
								value={String(category.id)}
								className="hover:bg-slate-100 dark:hover:bg-slate-800"
							>
								{category.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}

			{hasActiveFilters && (
				<Button
					variant="outline"
					size="sm"
					onClick={resetFilters}
					className="border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
				>
					<X className="h-4 w-4 mr-2" />
					Clear Filters
				</Button>
			)}
		</div>
	);
};

export default ProductFilter;
