import React, { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";
import CartSidebar from "../ui/cart-sidebar";
import { useCartSidebar } from "../../contexts/CartSidebarContext";

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

	// Handle checkout
	const handleCheckout = () => {
		closeCart();
		// Navigate to checkout - you can implement this based on your routing needs
		window.location.href = "/checkout";
	};

	return (
		<div className="min-h-screen flex flex-col">
			{/* Fixed Navbar */}
			<Navbar isCartOpen={isCartOpen} />

			{/* Main Content Area */}
			<main className={mainContentClass}>{children || <Outlet />}</main>

			{/* Footer */}
			<Footer />

			{/* Cart Sidebar */}
			<CartSidebar
				isOpen={isCartOpen}
				onClose={closeCart}
				onCheckout={handleCheckout}
			/>
		</div>
	);
};

export default Layout;
