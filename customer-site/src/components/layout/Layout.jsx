import React, { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";
import CartSidebar from "../ui/cart-sidebar";
import { useCartSidebar } from "../../contexts/CartSidebarContext";
import { useCart } from "../../contexts/CartContext";
import { toast } from "sonner";

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

	// Cart sidebar state and data
	const { isCartOpen, closeCart } = useCartSidebar();
	const { cart, itemCount, loading, updateCartItem, removeFromCart } =
		useCart();

	// Extract cart data for the sidebar
	const cartItems = cart?.items || [];
	const cartItemCount = itemCount;
	const subtotal = cart?.subtotal || 0;
	const isLoading = loading;

	// Conditionally apply top padding to main content
	// No padding on homepage to allow content to go under transparent navbar
	const mainContentClass = `flex-1 ${isHomePage ? "" : "pt-16"}`;

	// Handle cart item quantity update
	const handleUpdateQuantity = async (itemId, newQuantity) => {
		if (newQuantity <= 0) {
			await handleRemoveItem(itemId);
			return;
		}

		try {
			const result = await updateCartItem(itemId, newQuantity);
			if (result.success) {
				toast.success("Cart updated");
			} else {
				toast.error(result.error || "Failed to update item");
			}
		} catch (error) {
			console.error("Failed to update item:", error);
			toast.error("Failed to update item");
		}
	};

	// Handle cart item removal
	const handleRemoveItem = async (itemId) => {
		try {
			const result = await removeFromCart(itemId);
			if (result.success) {
				toast.success("Item removed from cart");
			} else {
				toast.error(result.error || "Failed to remove item");
			}
		} catch (error) {
			console.error("Failed to remove item:", error);
			toast.error("Failed to remove item");
		}
	};

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
				cartItems={cartItems}
				cartItemCount={cartItemCount}
				subtotal={subtotal}
				onUpdateQuantity={handleUpdateQuantity}
				onRemoveItem={handleRemoveItem}
				onCheckout={handleCheckout}
				isLoading={isLoading}
			/>
		</div>
	);
};

export default Layout;
