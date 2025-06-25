import React from "react";
import {
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";

/**
 * A component to display the content of a product card.
 * Can be used inside a Dialog or wrapped in a Card component.
 * @param {object} props - The component props.
 * @param {object} props.product - The product object to display.
 */
const ProductCard = ({ product }) => {
	// Determines the badge style and text based on the product type.
	const getProductTypeBadge = (type) => {
		switch (type) {
			case "menu":
				return <Badge variant="default">Menu Item</Badge>;
			case "grocery":
				return <Badge variant="secondary">Grocery Item</Badge>;
			default:
				return <Badge variant="outline">General</Badge>;
		}
	};

	// The component now returns the inner content directly,
	// allowing it to be styled by its parent container (like a Dialog or Card).
	return (
		<>
			<CardHeader>
				<CardTitle className="flex justify-between items-start gap-2">
					<span className="break-words">{product.name}</span>
					<div className="flex-shrink-0">
						{getProductTypeBadge(product.product_type)}
					</div>
				</CardTitle>
			</CardHeader>
			<CardContent>
				<p className="text-sm text-muted-foreground mb-3 min-h-[40px]">
					{product.description || "No description available."}
				</p>
				<div className="font-bold text-lg mb-3">${product.price}</div>
				<div className="text-xs text-muted-foreground">
					Category: {product.category ? product.category.name : "N/A"}
				</div>
				{product.taxes && product.taxes.length > 0 && (
					<div className="mt-3">
						<h4 className="text-xs font-semibold mb-1">Taxes:</h4>
						<div className="flex flex-wrap gap-1">
							{product.taxes.map((tax) => (
								<Badge
									key={tax.id}
									variant="outline"
								>
									{tax.name}
								</Badge>
							))}
						</div>
					</div>
				)}
			</CardContent>
		</>
	);
};

export default ProductCard;
