import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ChevronRight } from "lucide-react";
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
	const renderNode = (node: Category, level: number = 0) => {
		const isSelected = selectedCategories.includes(node.id);
		const hasChildren = node.children && node.children.length > 0;
		const isParent = hasChildren;

		return (
			<div key={node.id} className="space-y-1">
				<div className={`flex items-center space-x-2 py-1 hover:bg-accent/50 rounded px-2 ${level > 0 ? 'ml-6' : ''}`}>
					{hasChildren && (
						<ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
					)}
					{!hasChildren && level > 0 && (
						<div className="w-3" />
					)}
					<Checkbox
						id={`category-${node.id}`}
						checked={isSelected}
						onCheckedChange={(checked) => onCategoryChange(node, checked === true)}
						disabled={disabled}
					/>
					<Label
						htmlFor={`category-${node.id}`}
						className={`text-sm cursor-pointer flex-1 ${
							isParent ? 'font-medium' : 'font-normal text-muted-foreground'
						}`}
					>
						{node.name}
					</Label>
				</div>
				{hasChildren && (
					<div className="space-y-1">
						{node.children.map((child) => renderNode(child, level + 1))}
					</div>
				)}
			</div>
		);
	};

	return <div className="space-y-1">{nodes.map((node) => renderNode(node, 0))}</div>;
};

export default CategoryTree;
