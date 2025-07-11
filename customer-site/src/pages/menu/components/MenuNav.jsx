import React, { useState, useEffect, useRef } from "react";
import { motion as Motion } from "framer-motion";

const MenuNav = ({ categories, selectedCategory, setSelectedCategory }) => {
	const [showScrollButtons, setShowScrollButtons] = useState(false);
	const navRef = useRef(null);

	// Categories are now pre-sorted by the useCategories hook using backend order field
	// No need for manual sorting here

	useEffect(() => {
		const checkScroll = () => {
			if (navRef.current) {
				const { scrollWidth, clientWidth } = navRef.current;
				setShowScrollButtons(scrollWidth > clientWidth);
			}
		};

		checkScroll(); // Check on initial render and when categories change
		window.addEventListener("resize", checkScroll);
		return () => window.removeEventListener("resize", checkScroll);
	}, [categories]); // Re-check if categories array changes

	const scroll = (direction) => {
		if (navRef.current) {
			const scrollAmount = 200; // Adjust as needed
			navRef.current.scrollBy({
				left: direction === "left" ? -scrollAmount : scrollAmount,
				behavior: "smooth",
			});
		}
	};

	return (
		// Main sticky bar: Light beige background, subtle shadow, border top for separation
		<div className="bg-accent-light-beige shadow-sm sticky top-16 z-20 border-t border-accent-subtle-gray/30">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 relative">
				{" "}
				{/* Reduced py */}
				<div className="flex items-center">
					{showScrollButtons && (
						<button
							onClick={() => scroll("left")}
							// Scroll button: Light beige bg, dark green icon, hover primary beige bg
							className="absolute left-1 sm:left-2 z-10 bg-accent-light-beige rounded-full shadow-md p-1.5 hover:bg-primary-beige/70 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-green"
							aria-label="Scroll categories left"
						>
							<svg
								className="h-5 w-5 text-accent-dark-green"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M15 19l-7-7 7-7"
								/>
							</svg>
						</button>
					)}

					<div
						ref={navRef}
						// Increased horizontal padding for scroll buttons if they are shown
						className={`flex space-x-2 overflow-x-auto py-1 scrollbar-hide mx-auto ${
							showScrollButtons ? "px-8 sm:px-10" : ""
						}`}
						style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
					>
						<CategoryButton
							isSelected={selectedCategory === null}
							onClick={() => setSelectedCategory(null)}
							name="All"
						/>
						{/* Categories are now pre-sorted by the hook */}
						{categories.map((category) => (
							<CategoryButton
								key={category.id}
								isSelected={selectedCategory === category.id}
								onClick={() => setSelectedCategory(category.id)}
								name={category.name}
							/>
						))}
					</div>

					{showScrollButtons && (
						<button
							onClick={() => scroll("right")}
							className="absolute right-1 sm:right-2 z-10 bg-accent-light-beige rounded-full shadow-md p-1.5 hover:bg-primary-beige/70 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-green"
							aria-label="Scroll categories right"
						>
							<svg
								className="h-5 w-5 text-accent-dark-green"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M9 5l7 7-7 7"
								/>
							</svg>
						</button>
					)}
				</div>
			</div>
		</div>
	);
};

const CategoryButton = ({ isSelected, onClick, name }) => {
	return (
		<Motion.button
			onClick={onClick}
			// Selected: Primary Green bg, Light Beige text.
			// Inactive: Primary Beige bg, Dark Green text. Hover: Lighter Primary Green bg.
			className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 whitespace-nowrap shadow-sm hover:shadow-md ${
				isSelected
					? "bg-primary-green text-accent-light-beige"
					: "bg-primary-beige text-accent-dark-green hover:bg-primary-green/30 hover:text-accent-dark-green"
			}`}
			whileTap={{ scale: 0.95 }}
		>
			{name}
		</Motion.button>
	);
};

export default MenuNav;
