import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import Navbar from "./Navbar";
import Footer from "./Footer";
import CartSidebar from "../ui/cart-sidebar";
import { useCartSidebar } from "../../contexts/CartSidebarContext";
import { useCart } from "../../hooks/useCart";
import { ordersAPI } from "../../api/orders";
import { toast } from "sonner";

const Layout = ({ children }) => {
	const location = useLocation();
	const isHomePage = location.pathname === "/";
	const queryClient = useQueryClient();

	// Cart sidebar state and data
	const { isCartOpen, closeCart } = useCartSidebar();
	const { cartData, cartItems, cartItemCount, subtotal, isLoading } = useCart();

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
			await ordersAPI.updateOrderItem(cartData.id, itemId, newQuantity);
			// Invalidate cart query to trigger refetch
			queryClient.invalidateQueries(["cart"]);
			toast.success("Cart updated");
		} catch (error) {
			console.error("Failed to update item:", error);
			toast.error("Failed to update item");
		}
	};

	// Handle cart item removal
	const handleRemoveItem = async (itemId) => {
		try {
			await ordersAPI.removeOrderItem(cartData.id, itemId);
			// Invalidate cart query to trigger refetch
			queryClient.invalidateQueries(["cart"]);
			toast.success("Item removed from cart");
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
			<Navbar />

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
