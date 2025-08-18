import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion"; // eslint-disable-line
import { FaSearch, FaTimes } from "react-icons/fa";
import { useQuery } from "@tanstack/react-query";
import ProductCard from "./ProductCard";
import { useFilteredProducts } from "../../../hooks/useProducts";
import { useCart } from "@/hooks/useCart";
import { useProductQuantities } from "../../../hooks/useProductQuantities";
import { Skeleton } from "@/components/ui/skeleton";
import { productsAPI } from "../../../api/products";

const ProductList = ({
	selectedCategory,
	setSelectedCategory,
	activeView = "grid",
}) => {
	const [searchTerm, setSearchTerm] = useState("");
	const [showQuickAdd, setShowQuickAdd] = useState({});

	// Fetch all categories (including subcategories) for proper sorting
	const { data: allCategories = [] } = useQuery({
		queryKey: ["all-categories"],
		queryFn: () => productsAPI.getCategories(),
		staleTime: 5 * 60 * 1000, // 5 minutes
		select: (data) =>
			data?.filter((category) => category.name !== "grocery") || [],
	});

	// Use our new, simplified hook. It fetches data based on the selectedCategory.
	const {
		filteredProducts: products,
		isLoading,
		error,
	} = useFilteredProducts(selectedCategory);
	const { addToCart } = useCart();
	const { getQuantity, incrementQuantity, decrementQuantity, resetQuantity } =
		useProductQuantities();

	// Apply search filter to the products returned from the hook
	const searchFilteredProducts = useMemo(() => {
		if (!searchTerm) return products;
		const lowercaseSearch = searchTerm.toLowerCase();
		return products.filter(
			(product) =>
				product.name.toLowerCase().includes(lowercaseSearch) ||
				(product.description &&
					product.description.toLowerCase().includes(lowercaseSearch))
		);
	}, [products, searchTerm]);

	const handleAddToCart = async (product) => {
		const quantity = getQuantity(product.id);
		const result = await addToCart(product, quantity);

		if (result && result.success) {
			resetQuantity(product.id);
			setShowQuickAdd((prev) => ({ ...prev, [product.id]: false }));
		}
	};

	const toggleQuickAdd = (productId) => {
		setShowQuickAdd((prev) => ({
			...Object.keys(prev).reduce((acc, key) => ({ ...acc, [key]: false }), {}),
			[productId]: !prev[productId],
		}));
	};

	if (error) {
		return (
			<div className="text-center text-red-500 py-10">
				Error: {error.message}
			</div>
		);
	}

	const renderProductGrid = (items) => (
		<motion.div
			layout
			className={`grid gap-6 ${
				activeView === "grid"
					? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
					: "grid-cols-1"
			}`}
		>
			<AnimatePresence>
				{items.map((product) => (
					<ProductCard
						key={product.id}
						product={product}
						quantity={getQuantity(product.id)}
						onIncrement={() => incrementQuantity(product.id)}
						onDecrement={() => decrementQuantity(product.id)}
						onAddToCart={() => handleAddToCart(product)}
						showQuickAdd={showQuickAdd[product.id]}
						onToggleQuickAdd={() => toggleQuickAdd(product.id)}
						viewMode={activeView}
					/>
				))}
			</AnimatePresence>
		</motion.div>
	);

	const shouldGroupProducts = () => {
		if (!selectedCategory) return true; // Always group for "All" view

		// Check if we have multiple categories in the filtered products (subcategories)
		const uniqueCategories = new Set();
		searchFilteredProducts.forEach((product) => {
			const productCategories = Array.isArray(product.category)
				? product.category
				: product.category
				? [product.category]
				: [];
			productCategories.forEach((cat) => {
				if (cat && cat.name) uniqueCategories.add(cat.name);
			});
		});

		// Group if we have multiple categories (subcategories)
		return uniqueCategories.size > 1;
	};

	const renderGroupedProducts = (forSelectedCategory = false) => {
		const groupedByCategory = {};
		searchFilteredProducts.forEach((product) => {
			const productCategories = Array.isArray(product.category)
				? product.category
				: product.category
				? [product.category]
				: [];

			// Use only the primary (first) category to avoid duplicates
			// This matches POS behavior where products belong to one primary category
			const primaryCategory = productCategories[0];
			if (primaryCategory && primaryCategory.name) {
				if (!groupedByCategory[primaryCategory.name]) {
					groupedByCategory[primaryCategory.name] = [];
				}
				groupedByCategory[primaryCategory.name].push(product);
			}
		});

		// Sort categories hierarchically: parents first, then their children
		const orderedCategories = Object.keys(groupedByCategory).sort((a, b) => {
			const categoryA = allCategories.find((cat) => cat.name === a);
			const categoryB = allCategories.find((cat) => cat.name === b);

			// If we can't find the category objects, fall back to alphabetical sorting
			if (!categoryA || !categoryB) {
				return a.localeCompare(b);
			}

			// Calculate hierarchical order: parent order + 0.1 + (child order * 0.01)
			const getHierarchicalOrder = (category) => {
				if (!category.parent) {
					// Parent category: use its own order
					return category.order;
				} else {
					// Child category: parent order + 0.1 + (child order * 0.01)
					return category.parent.order + 0.1 + (category.order * 0.01);
				}
			};

			const orderA = getHierarchicalOrder(categoryA);
			const orderB = getHierarchicalOrder(categoryB);

			// Sort by hierarchical order
			if (orderA !== orderB) {
				return orderA - orderB;
			}

			// If hierarchical order is the same, sort alphabetically by name
			return a.localeCompare(b);
		});

		return orderedCategories.map((categoryName) => (
			<div
				key={categoryName}
				className="mb-12"
			>
				<div className="flex items-center justify-between mb-6">
					<h2 className="text-2xl font-bold text-accent-dark-brown">
						{categoryName}
					</h2>
					{!forSelectedCategory && (
						<button
							onClick={() => {
								// Find parent category for this subcategory
								const category = allCategories.find(
									(c) => c.name === categoryName
								);
								// If it's a subcategory, find its parent, otherwise use itself
								const targetCategory = category?.parent
									? allCategories.find((c) => c.id === category.parent.id)
									: category;
								if (targetCategory) setSelectedCategory(targetCategory.id);
							}}
							className="text-primary-green hover:text-accent-dark-green font-medium text-sm"
						>
							View All →
						</button>
					)}
				</div>
				{renderProductGrid(groupedByCategory[categoryName])}
			</div>
		));
	};

	const renderLoadingSkeletons = () => (
		<div
			className={`grid gap-6 ${
				activeView === "grid"
					? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
					: "grid-cols-1"
			}`}
		>
			{[...Array(8)].map((_, i) => (
				<div
					key={i}
					className="space-y-2"
				>
					<Skeleton className="h-48 w-full" />
					<Skeleton className="h-6 w-3/4" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			))}
		</div>
	);

	return (
		<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
			{/* Search Bar */}
			<div className="mb-8 relative max-w-sm">
				<FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
				<input
					type="text"
					placeholder="Search menu..."
					value={searchTerm}
					onChange={(e) => setSearchTerm(e.target.value)}
					className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-full focus:ring-2 focus:ring-primary-green focus:border-transparent"
				/>
				{searchTerm && (
					<button
						onClick={() => setSearchTerm("")}
						className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
					>
						<FaTimes />
					</button>
				)}
			</div>

			{isLoading ? (
				renderLoadingSkeletons()
			) : (
				<>
					{shouldGroupProducts()
						? renderGroupedProducts(!selectedCategory ? false : true)
						: renderProductGrid(searchFilteredProducts)}
					{!isLoading && searchFilteredProducts.length === 0 && (
						<div className="text-center py-10">
							<p className="text-gray-500">No products found.</p>
						</div>
					)}
				</>
			)}
		</div>
	);
};

export default ProductList;
