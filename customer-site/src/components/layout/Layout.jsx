import React, { useEffect, Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import CartSidebar from "../ui/cart-sidebar";
import { useCartSidebar } from "../../contexts/CartSidebarContext";
import SEO from "@/components/SEO";
const Footer = React.lazy(() => import("./Footer"));

const restaurantStructuredData = {
	"@context": "https://schema.org",
	"@type": "Restaurant",
	name: "Ajeen",
	image: "https://bakeajeen.com/logo512.png", // URL to your main logo
	"@id": "https://bakeajeen.com", // Your website URL
	url: "https://bakeajeen.com",
	telephone: "+1-651-412-5336", // Your contact phone number
	priceRange: "$$", // Price range (e.g., $, $$, $$$)
	servesCuisine: "Middle Eastern",
	address: {
		"@type": "PostalAddress",
		streetAddress: "2105 Cliff Rd, Suite 300",
		addressLocality: "Eagan",
		addressRegion: "MN",
		postalCode: "55122",
		addressCountry: "USA",
	},
	geo: {
		"@type": "GeoCoordinates",
		latitude: 44.804131,
		longitude: -93.166885,
	},
	openingHoursSpecification: [
		{
			"@type": "OpeningHoursSpecification",
			dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Sunday"],
			opens: "11:00",
			closes: "20:00",
		},
		{
			"@type": "OpeningHoursSpecification",
			dayOfWeek: ["Friday", "Saturday"],
			opens: "11:00",
			closes: "21:00",
		},
	],
	menu: "https://bakeajeen.com/menu", // URL to your menu page
	acceptsReservations: "False",
};

const Layout = ({ children }) => {
	const location = useLocation();
	const isHomePage = location.pathname === "/";

	useEffect(() => {
		if (location.hash) {
			const id = location.hash.replace("#", "");
			const element = document.getElementById(id);
			if (element) {
				// Use a timeout to ensure the page has had time to render
				// before trying to scroll.
				setTimeout(() => {
					element.scrollIntoView({ behavior: "smooth" });
				}, 100);
			}
		} else {
			// If there's no hash, scroll to the top of the page on navigation.
			window.scrollTo({ top: 0, behavior: "smooth" });
		}
	}, [location]);

	// Cart sidebar state
	const { isCartOpen, closeCart } = useCartSidebar();

	// Conditionally apply top padding to main content
	// No padding on homepage to allow content to go under transparent navbar
	const mainContentClass = `flex-1 ${isHomePage ? "" : "pt-16"}`;

	return (
		<div className="min-h-screen flex flex-col">
			<SEO structuredData={restaurantStructuredData} />
			{/* Fixed Navbar */}
			<Navbar isCartOpen={isCartOpen} />

			{/* Main Content Area */}
			<main className={mainContentClass}>{children || <Outlet />}</main>

			{/* Footer */}
			<Suspense fallback={null}>
				<Footer />
			</Suspense>

			{/* Cart Sidebar */}
			<CartSidebar
				isOpen={isCartOpen}
				onClose={closeCart}
			/>
		</div>
	);
};

export default Layout;
