import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion as Motion } from "framer-motion";
import { useCart } from "@/hooks/useCart";
import MenuNav from "./components/MenuNav";
import ProductList from "./components/ProductList";
import { useCategories } from "../../hooks/useCategories";
import SEO from "@/components/SEO";
import { generateBreadcrumbStructuredData } from "@/utils/structuredData";

// Helper function to get category from URL search params
const getCategoryFromURL = (search) => {
	const params = new URLSearchParams(search);
	const categoryIdFromUrl = params.get("category");
	return categoryIdFromUrl ? Number(categoryIdFromUrl) : null;
};

const MenuPage = () => {
	const location = useLocation();
	const navigate = useNavigate();
	const { checkoutCompleted, resetCheckoutState } = useCart();

	// Initialize selectedCategory directly from the URL on component mount.
	// This is crucial for refresh scenarios.
	const [selectedCategory, setSelectedCategory] = useState(() =>
		getCategoryFromURL(location.search)
	);

	const [activeView, setActiveView] = useState("grid");

	// Use our new organized hooks
	const { categories, isLoading: isLoadingCategories } = useCategories();

	// Generate breadcrumb structured data for menu page
	const breadcrumbData = generateBreadcrumbStructuredData([
		{ name: "Home", url: "https://bakeajeen.com/" },
		{ name: "Menu", url: "https://bakeajeen.com/menu" },
	]);

	// Reset checkout state when user comes to menu page after completing checkout
	useEffect(() => {
		if (checkoutCompleted) {
			console.log("Resetting checkout state - user returned to menu");
			resetCheckoutState();
		}
	}, [checkoutCompleted, resetCheckoutState]);

	// Effect 1: Update URL when `selectedCategory` state changes (e.g., user clicks a category).
	useEffect(() => {
		const currentCategoryInUrl = getCategoryFromURL(location.search);

		if (selectedCategory !== null) {
			// A specific category is selected in state.
			// If it's different from what's in the URL, update the URL.
			if (selectedCategory !== currentCategoryInUrl) {
				navigate(`/menu?category=${selectedCategory}`, { replace: true });
			}
		} else {
			// "All" categories is selected (selectedCategory is null).
			// If the URL still has a category parameter, clear it.
			if (currentCategoryInUrl !== null) {
				navigate("/menu", { replace: true });
			}
		}
	}, [selectedCategory, navigate]);

	// Effect 2: Update `selectedCategory` state if the URL changes externally
	// (e.g., browser back/forward buttons, or if the initial useState initializer didn't catch it).
	useEffect(() => {
		const categoryIdFromUrl = getCategoryFromURL(location.search);
		// Only update the state if the URL's category is genuinely different
		// from the component's current `selectedCategory` state.
		if (selectedCategory !== categoryIdFromUrl) {
			setSelectedCategory(categoryIdFromUrl);
		}
	}, [location.search, selectedCategory]);

	return (
		<main className="min-h-screen">
			<SEO
				title="Our Menu - Ajeen Bakery | Mana'eesh, Soups, Hummus, Desserts"
				description="Explore the delicious menu at Ajeen Bakery. From traditional Mana'eesh to savory Hummus and sweet desserts, all our dishes are prepared with the freshest ingredients."
				keywords="restaurant menu, online menu, middle eastern dishes, appetizers, main courses, desserts, Ajeen bakery, Ajeen, mana'eesh, hummus, soups"
				structuredData={breadcrumbData}
			/>
			{/* Header section */}
			<div className="bg-gradient-to-r from-primary-green to-accent-dark-green text-accent-light-beige py-12">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
					<div className="text-center">
						<Motion.h1
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.5 }}
							className="text-3xl md:text-4xl font-bold mb-4"
						>
							Our Menu
						</Motion.h1>
						<Motion.p
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.5, delay: 0.1 }}
							className="text-lg max-w-2xl mx-auto"
						>
							Explore our selection of authentic Middle Eastern dishes made with
							fresh ingredients and traditional recipes.
						</Motion.p>
					</div>
				</div>
			</div>

			{/* Menu Navigation */}
			{isLoadingCategories ? (
				<div className="py-4 flex justify-center">
					<div className="animate-pulse flex space-x-4">
						<div className="h-8 w-20 bg-accent-subtle-gray/50 rounded-full"></div>
						<div className="h-8 w-24 bg-accent-subtle-gray/50 rounded-full"></div>
						<div className="h-8 w-20 bg-accent-subtle-gray/50 rounded-full"></div>
					</div>
				</div>
			) : (
				<MenuNav
					categories={categories}
					selectedCategory={selectedCategory}
					setSelectedCategory={setSelectedCategory}
				/>
			)}

			{/* View Switcher */}
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-end">
				<div className="flex space-x-1 bg-accent-light-beige p-1 rounded-lg shadow-sm border border-accent-subtle-gray/30">
					<button
						onClick={() => setActiveView("grid")}
						className={`p-2 rounded-md ${
							activeView === "grid"
								? "bg-primary-green/20 text-primary-green"
								: "text-accent-dark-brown hover:bg-primary-beige/70"
						} transition-colors`}
						aria-label="Grid view"
					>
						{/* SVG Icon */}
						<svg
							className="w-5 h-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
							/>
						</svg>
					</button>
					<button
						onClick={() => setActiveView("list")}
						className={`p-2 rounded-md ${
							activeView === "list"
								? "bg-primary-green/20 text-primary-green"
								: "text-accent-dark-brown hover:bg-primary-beige/70"
						} transition-colors`}
						aria-label="List view"
					>
						{/* SVG Icon */}
						<svg
							className="w-5 h-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M4 6h16M4 12h16M4 18h16"
							/>
						</svg>
					</button>
				</div>
			</div>

			{/* Product List */}
			<ProductList
				selectedCategory={selectedCategory}
				setSelectedCategory={setSelectedCategory}
				activeView={activeView}
			/>
		</main>
	);
};

export default MenuPage;
