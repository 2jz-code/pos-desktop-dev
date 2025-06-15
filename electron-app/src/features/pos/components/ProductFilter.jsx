// desktop-combined/electron-app/src/features/pos/components/ProductFilter.jsx

import React from "react";
import { usePosStore } from "@/store/posStore"; // Corrected usePosStore to usePosStore for consistency
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { shallow } from "zustand/shallow";

const ProductFilter = () => {
	const {
		parentCategories,
		childCategories,
		selectedParentCategory,
		selectedChildCategory,
		setSelectedParentCategory,
		setSelectedChildCategory,
	} = usePosStore(
		(state) => ({
			parentCategories: state.parentCategories,
			childCategories: state.childCategories,
			selectedParentCategory: state.selectedParentCategory,
			selectedChildCategory: state.selectedChildCategory,
			setSelectedParentCategory: state.setSelectedParentCategory,
			setSelectedChildCategory: state.setSelectedChildCategory,
		}),
		shallow
	);

	return (
		<div className="flex items-center space-x-4 mb-4">
			<Select
				onValueChange={setSelectedParentCategory}
				value={selectedParentCategory}
			>
				<SelectTrigger className="w-[180px]">
					<SelectValue placeholder="Select a category" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Categories</SelectItem>
					{parentCategories.map((category) => (
						<SelectItem
							key={category.id}
							value={String(category.id)}
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
					<SelectTrigger className="w-[180px]">
						<SelectValue placeholder="Select a subcategory" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Subcategories</SelectItem>
						{childCategories.map((category) => (
							<SelectItem
								key={category.id}
								value={String(category.id)}
							>
								{category.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}
		</div>
	);
};

export default ProductFilter;
