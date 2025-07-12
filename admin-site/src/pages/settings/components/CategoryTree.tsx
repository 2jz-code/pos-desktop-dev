import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Category } from "@/types";

interface CategoryTreeProps {
	nodes: Category[];
	selectedCategories: (number | string)[];
	onCategoryChange: (node: Category, checked: boolean) => void;
	disabled: boolean;
}

const CategoryTree: React.FC<CategoryTreeProps> = ({
	nodes,
	selectedCategories,
	onCategoryChange,
	disabled,
}) => {
	const renderNode = (node: Category) => {
		const isSelected = selectedCategories.includes(node.id);
		const isIndeterminate =
			node.children.length > 0 &&
			node.children.some((child) => selectedCategories.includes(child.id)) &&
			!node.children.every((child) => selectedCategories.includes(child.id));

		return (
			<div key={node.id}>
				<div className="flex items-center space-x-2">
					<Checkbox
						id={`category-${node.id}`}
						checked={isSelected}
						onCheckedChange={(checked) => onCategoryChange(node, !!checked)}
						disabled={disabled}
						aria-labelledby={`label-category-${node.id}`}
						data-state={
							isIndeterminate
								? "indeterminate"
								: isSelected
								? "checked"
								: "unchecked"
						}
					/>
					<Label
						htmlFor={`category-${node.id}`}
						id={`label-category-${node.id}`}
						className="text-sm"
					>
						{node.name}
					</Label>
				</div>
				{node.children.length > 0 && (
					<div className="pl-6 pt-2 space-y-2">
						{node.children.map(renderNode)}
					</div>
				)}
			</div>
		);
	};

	return <div className="space-y-2">{nodes.map(renderNode)}</div>;
};

export default CategoryTree;
