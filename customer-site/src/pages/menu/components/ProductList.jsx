import React, { useState, useMemo } from "react";
import { motion as Motion } from "framer-motion";
import { FaSearch, FaTimes } from "react-icons/fa";
import ProductCard from "./ProductCard";
import { useFilteredProducts } from "../../../hooks/useProducts";
import { useCart, useProductQuantities } from "../../../hooks/useCart";

const ProductList = ({
	categories,
	selectedCategory,
	setSelectedCategory,
	activeView = "grid",
}) => {
	const [searchTerm, setSearchTerm] = useState("");
	const [showQuickAdd, setShowQuickAdd] = useState({});

	// Use our organized hooks
	const { filteredProducts, isLoading, error } = useFilteredProducts(
		selectedCategory,
		categories
	);
	const { addToCart } = useCart();
	const { getQuantity, incrementQuantity, decrementQuantity, resetQuantity } =
		useProductQuantities();

	// Apply search filter
	const searchFilteredProducts = useMemo(() => {
		if (!searchTerm) return filteredProducts;

		const lowercaseSearch = searchTerm.toLowerCase();

		if (Array.isArray(filteredProducts) && filteredProducts[0]?.subGroups) {
			// Handle drinks category with subgroups
			return filteredProducts
				.map((categoryGroup) => ({
					...categoryGroup,
					subGroups: categoryGroup.subGroups
						.map((subGroup) => ({
							...subGroup,
							products: subGroup.products.filter(
								(product) =>
									product.name.toLowerCase().includes(lowercaseSearch) ||
									(product.description &&
										product.description.toLowerCase().includes(lowercaseSearch))
							),
						}))
						.filter((subGroup) => subGroup.products.length > 0),
				}))
				.filter((categoryGroup) => categoryGroup.subGroups.length > 0);
		}

		// Handle regular products
		return filteredProducts.filter(
			(product) =>
				product.name.toLowerCase().includes(lowercaseSearch) ||
				(product.description &&
					product.description.toLowerCase().includes(lowercaseSearch))
		);
	}, [filteredProducts, searchTerm]);

	const handleAddToCart = async (productId) => {
		const quantity = getQuantity(productId);
		const success = await addToCart(productId, quantity);

		if (success) {
			resetQuantity(productId);
			setShowQuickAdd((prev) => ({ ...prev, [productId]: false }));
		}
	};

	const toggleQuickAdd = (productId, e) => {
		e.stopPropagation();
		e.preventDefault();
		setShowQuickAdd((prev) => {
			// Close all other quick adds
			const newState = Object.keys(prev).reduce((acc, key) => {
				acc[key] = false;
				return acc;
			}, {});
			// Toggle current one
			newState[productId] = !prev[productId];
			return newState;
		});
	};

	const renderGroupedProducts = () => {
		if (!selectedCategory) {
			// "All" view - group by categories
			const groupedByCategory = {};

			searchFilteredProducts.forEach((product) => {
				const productCategories = Array.isArray(product.category)
					? product.category
					: product.category
					? [product.category]
					: [];

				productCategories.forEach((cat) => {
					if (cat && cat.name) {
						if (!groupedByCategory[cat.name]) {
							groupedByCategory[cat.name] = [];
						}
						groupedByCategory[cat.name].push(product);
					}
				});
			});

			// Manual category order
			const manualCategoryOrder = [
				"Mana'eesh",
				"Signature",
				"Soups",
				"Desserts",
				"Drinks",
			];

			const orderedCategories = manualCategoryOrder
				.filter((catName) => groupedByCategory[catName])
				.concat(
					Object.keys(groupedByCategory)
						.filter((catName) => !manualCategoryOrder.includes(catName))
						.sort()
				);

			return orderedCategories.map((categoryName) => (
				<div
					key={categoryName}
					className="mb-12"
				>
					<div className="flex items-center justify-between mb-6">
						<h2 className="text-2xl font-bold text-accent-dark-brown">
							{categoryName}
						</h2>
						<button
							onClick={() => {
								const category = categories.find(
									(c) => c.name === categoryName
								);
								if (category) setSelectedCategory(category.id);
							}}
							className="text-primary-green hover:text-accent-dark-green font-medium text-sm"
						>
							View All →
						</button>
					</div>
					<div
						className={`grid gap-6 ${
							activeView === "grid"
								? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
								: "grid-cols-1"
						}`}
					>
						{groupedByCategory[categoryName].map((product) => (
							<ProductCard
								key={product.id}
								product={product}
								quantity={getQuantity(product.id)}
								onIncrement={() => incrementQuantity(product.id)}
								onDecrement={() => decrementQuantity(product.id)}
								onAddToCart={() => handleAddToCart(product.id)}
								showQuickAdd={showQuickAdd[product.id]}
								onToggleQuickAdd={(e) => toggleQuickAdd(product.id, e)}
								viewMode={activeView}
							/>
						))}
					</div>
				</div>
			));
		}

		// Selected category view
		if (
			Array.isArray(searchFilteredProducts) &&
			searchFilteredProducts[0]?.subGroups
		) {
			// Handle drinks category with subgroups
			return searchFilteredProducts.map((categoryGroup) => (
				<div key={categoryGroup.categoryName}>
					{categoryGroup.subGroups.map((subGroup) => (
						<div
							key={subGroup.subHeading}
							className="mb-8"
						>
							<h3 className="text-xl font-semibold text-accent-dark-brown mb-4">
								{subGroup.subHeading}
							</h3>
							<div
								className={`grid gap-6 ${
									activeView === "grid"
										? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
										: "grid-cols-1"
								}`}
							>
								{subGroup.products.map((product) => (
									<ProductCard
										key={product.id}
										product={product}
										quantity={getQuantity(product.id)}
										onIncrement={() => incrementQuantity(product.id)}
										onDecrement={() => decrementQuantity(product.id)}
										onAddToCart={() => handleAddToCart(product.id)}
										showQuickAdd={showQuickAdd[product.id]}
										onToggleQuickAdd={(e) => toggleQuickAdd(product.id, e)}
										viewMode={activeView}
									/>
								))}
							</div>
						</div>
					))}
				</div>
			));
		}

		// Regular category products
		return (
			<div
				className={`grid gap-6 ${
					activeView === "grid"
						? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
						: "grid-cols-1"
				}`}
			>
				{searchFilteredProducts.map((product) => (
					<ProductCard
						key={product.id}
						product={product}
						quantity={getQuantity(product.id)}
						onIncrement={() => incrementQuantity(product.id)}
						onDecrement={() => decrementQuantity(product.id)}
						onAddToCart={() => handleAddToCart(product.id)}
						showQuickAdd={showQuickAdd[product.id]}
						onToggleQuickAdd={(e) => toggleQuickAdd(product.id, e)}
						viewMode={activeView}
					/>
				))}
			</div>
		);
	};

	if (error) {
		return (
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
				<div className="text-center text-red-600">
					Error loading products: {error.message}
				</div>
			</div>
		);
	}

	return (
		<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
			{/* Search Bar */}
			<div className="mb-8">
				<div className="relative max-w-md mx-auto">
					<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
						<FaSearch className="h-5 w-5 text-accent-subtle-gray" />
					</div>
					<input
						type="text"
						placeholder="Search products..."
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
						className="block w-full pl-10 pr-10 py-3 border border-accent-subtle-gray/30 rounded-full bg-accent-light-beige/50 text-accent-dark-brown placeholder-accent-subtle-gray focus:outline-none focus:ring-2 focus:ring-primary-green focus:border-transparent"
					/>
					{searchTerm && (
						<button
							onClick={() => setSearchTerm("")}
							className="absolute inset-y-0 right-0 pr-3 flex items-center text-accent-subtle-gray hover:text-accent-dark-brown"
						>
							<FaTimes className="h-5 w-5" />
						</button>
					)}
				</div>
			</div>

			{/* Products */}
			{isLoading ? (
				<div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{[...Array(8)].map((_, i) => (
						<div
							key={i}
							className="animate-pulse"
						>
							<div className="bg-accent-subtle-gray/30 rounded-lg h-64"></div>
						</div>
					))}
				</div>
			) : (
				<Motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5 }}
				>
					{renderGroupedProducts()}
				</Motion.div>
			)}

			{/* No Results */}
			{!isLoading && searchFilteredProducts.length === 0 && (
				<div className="text-center py-12">
					<div className="text-accent-subtle-gray text-lg">
						{searchTerm
							? `No products found for "${searchTerm}"`
							: "No products available"}
					</div>
				</div>
			)}
		</div>
	);
};

export default ProductList;
