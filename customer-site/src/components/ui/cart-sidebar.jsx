import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion"; // eslint-disable-line
import { FaShoppingCart, FaTrash, FaTimes } from "react-icons/fa";
import { Link, useNavigate } from "react-router-dom";
import { Edit } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import {
	getProductImageUrl,
	createImageErrorHandler,
} from "../../lib/imageUtils"; // Adjust path as needed
import OptimizedImage from "@/components/OptimizedImage";
import ModifierDisplay from "@/components/ui/ModifierDisplay";

const CartSidebar = ({ isOpen, onClose }) => {
	const [isRestaurantOpen, setIsRestaurantOpen] = useState(true);
	const checkoutPreloaded = useRef(false);
	const navigate = useNavigate();

	// Use the new cart hook
	const { cart, cartItemCount, subtotal, isLoading, removeFromCart } =
		useCart();

	const cartItems = cart?.items || [];

	const formatPrice = (price) => {
		if (price === null || price === undefined) return "0.00";
		const numericPrice = typeof price === "string" ? parseFloat(price) : price;
		if (isNaN(numericPrice)) return "0.00";
		return numericPrice.toFixed(2);
	};

	// Function to check operating hours based on America/Chicago timezone
	const checkOperatingHours = useCallback(() => {
		const now = new Date(); // Current date/time in user's local timezone

		// Get current UTC hour and day
		const utcHours = now.getUTCHours();
		const utcDay = now.getUTCDay(); // Sunday - 0, Monday - 1, ..., Saturday - 6

		// America/Chicago is UTC-5 during Daylight Saving Time (CDT)
		// and UTC-6 during Standard Time (CST).
		// For this "band-aid" fix, we'll use a fixed offset.
		// A more robust solution would dynamically determine DST.
		const CHICAGO_UTC_OFFSET = -5; // Assuming CDT for current context

		// Calculate current hour and day in Chicago time
		let chicagoHour = utcHours + CHICAGO_UTC_OFFSET;
		let chicagoDay = utcDay;

		// Adjust day if timezone conversion crosses midnight
		if (chicagoHour < 0) {
			chicagoHour += 24; // Wrap around to previous day
			chicagoDay = (chicagoDay - 1 + 7) % 7; // Go to previous day, wrapping Sunday to Saturday
		} else if (chicagoHour >= 24) {
			chicagoHour -= 24; // Wrap around to next day
			chicagoDay = (chicagoDay + 1) % 7; // Go to next day, wrapping Saturday to Sunday
		}

		const openHour = 0; // 11:00 AM Chicago time
		let closeHour; // 24-hour format

		// Determine closing hour based on Chicago day of the week
		if (chicagoDay >= 0 && chicagoDay <= 4) {
			// Sunday (0) to Thursday (4)
			closeHour = 23; // 8:00 PM Chicago time
		} else {
			// Friday (5) and Saturday (6)
			closeHour = 23; // 9:00 PM Chicago time
		}

		// Check if current "Chicago time" is within operating hours
		const open = chicagoHour >= openHour && chicagoHour < closeHour;
		setIsRestaurantOpen(open);
	}, []);

	// Effect to check operating hours periodically
	useEffect(() => {
		checkOperatingHours(); // Initial check on component mount

		// Update every minute to reflect time changes
		const intervalId = setInterval(checkOperatingHours, 60 * 1000);

		return () => clearInterval(intervalId); // Cleanup interval on component unmount
	}, [checkOperatingHours]); // Re-run if checkOperatingHours callback changes

	const handleRemoveItem = async (itemId) => {
		try {
			await removeFromCart(itemId);
		} catch (error) {
			console.error("Failed to remove item:", error);
		}
	};

	const handleEditItem = (item) => {
		// Navigate to product details page in edit mode
		navigate(`/product/${encodeURIComponent(item.product.name)}/edit/${item.id}`);
		onClose(); // Close the cart sidebar
	};

	const handlePreloadCheckout = () => {
		if (checkoutPreloaded.current) return;
		checkoutPreloaded.current = true;
		import("@/pages/CheckoutPage");
	};

	// Determine if the checkout button should be disabled
	const isCheckoutButtonDisabled = cartItemCount === 0 || !isRestaurantOpen;

	return (
		<AnimatePresence>
			{isOpen && (
				<>
					{/* Backdrop */}
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.2 }}
						className="fixed inset-0 bg-black/20 z-40 "
						onClick={onClose}
					/>

					{/* Sidebar */}
					<motion.div
						initial={{ x: "100%" }}
						animate={{ x: 0 }}
						exit={{ x: "100%" }}
						transition={{ type: "spring", damping: 30, stiffness: 300 }}
						className="fixed top-0 right-0 h-full w-full sm:w-96 bg-accent-light-beige z-50 shadow-2xl overflow-hidden flex flex-col border-l border-accent-subtle-gray/30"
					>
						{/* Cart Header */}
						<div className="p-4 bg-accent-light-beige flex justify-between items-center border-b border-accent-subtle-gray/50">
							<h2 className="text-xl font-semibold text-accent-dark-green flex items-center">
								<FaShoppingCart className="mr-2 text-primary-green" />
								Your Cart
								<span className="ml-2 text-sm font-normal text-accent-dark-brown">
									({cartItemCount} {cartItemCount === 1 ? "item" : "items"})
								</span>
							</h2>
							<button
								onClick={onClose}
								className="p-1.5 rounded-full text-accent-dark-brown hover:bg-primary-beige/70 transition-colors focus:outline-none focus:ring-1 focus:ring-primary-green"
								aria-label="Close cart"
							>
								<FaTimes size={18} />
							</button>
						</div>

						{/* Cart Content */}
						<div className="flex-grow overflow-y-auto p-4 space-y-3">
							{isLoading ? (
								<div className="flex justify-center items-center h-full">
									<div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-green"></div>
								</div>
							) : cartItems.length === 0 ? (
								<div className="flex flex-col items-center justify-center h-full text-center px-4">
									<FaShoppingCart className="w-16 h-16 mb-5 text-accent-subtle-gray opacity-70" />
									<p className="text-lg font-semibold text-accent-dark-green mb-2">
										Your cart is empty
									</p>
									<p className="text-sm text-accent-dark-brown mb-6">
										Looks like you haven't added any delicious items yet.
									</p>
									<Link
										to="/menu"
										onClick={onClose}
										className="px-5 py-2.5 bg-primary-green text-accent-light-beige rounded-lg hover:bg-accent-dark-green transition-colors font-medium shadow-sm"
									>
										Browse Menu
									</Link>
								</div>
							) : (
								<ul className="divide-y divide-accent-subtle-gray/30">
									{cartItems.map((item) => (
										<motion.li
											key={item.id}
											layout
											initial={{ opacity: 0, y: 10 }}
											animate={{ opacity: 1, y: 0 }}
											exit={{
												opacity: 0,
												x: -20,
												transition: { duration: 0.2 },
											}}
											className="py-4 pb-6 relative"
										>
											<div className="flex items-start">
												{/* Product Image */}
												<div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md border border-accent-subtle-gray/30 bg-accent-subtle-gray/20 mr-4">
													<OptimizedImage
														src={getProductImageUrl(item.product?.image)}
														alt={item.product?.name || "Product"}
														className="h-full w-full object-cover object-center"
														onError={createImageErrorHandler("Cart Item")}
													/>
												</div>

												{/* Product Info */}
												<div className="flex-grow min-w-0">
													<h4 className="text-sm font-medium text-accent-dark-green truncate">
														{item.product?.name || "Unknown Product"}
													</h4>
													<p className="text-sm text-accent-dark-brown">
														${formatPrice(item.price_at_sale)} × {item.quantity}
													</p>
													
													{/* Display modifiers */}
													<ModifierDisplay 
														modifiers={item.selected_modifiers_snapshot} 
														compact={true} 
													/>
													
													{item.notes && (
														<p className="text-xs text-accent-subtle-gray italic mt-1">
															{item.notes}
														</p>
													)}
												</div>

												{/* Item Actions */}
												<div className="flex flex-col items-end space-y-2 ml-2 flex-shrink-0">
													<span className="text-sm font-medium text-accent-dark-green">
														$
														{formatPrice(
															(item.price_at_sale || 0) * item.quantity
														)}
													</span>
													<button
														onClick={() => handleRemoveItem(item.id)}
														className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full transition-colors focus:outline-none focus:ring-1 focus:ring-red-500"
														aria-label="Remove item"
													>
														<FaTrash size={12} />
													</button>
												</div>
											</div>

											{/* Edit button - positioned in bottom right with proper spacing */}
											{item.selected_modifiers_snapshot && 
											 item.selected_modifiers_snapshot.length > 0 && (
												<button
													onClick={() => handleEditItem(item)}
													className="absolute bottom-1 right-0 text-xs text-accent-dark-green hover:text-primary-green underline transition-colors focus:outline-none px-1 py-1"
													aria-label="Edit item"
													title="Edit customizations"
												>
													Edit
												</button>
											)}
										</motion.li>
									))}
								</ul>
							)}
						</div>

						{/* Cart Footer */}
						{cartItems.length > 0 && (
							<div className="border-t border-accent-subtle-gray/50 bg-accent-light-beige p-4 space-y-4">
								{/* Subtotal */}
								<div className="flex justify-between items-center text-lg font-semibold text-accent-dark-green">
									<span>Subtotal:</span>
									<span>${formatPrice(subtotal)}</span>
								</div>

								{/* Restaurant Status */}
								{!isRestaurantOpen && (
									<div className="bg-red-50 border border-red-200 rounded-lg p-3">
										<p className="text-sm text-red-700 text-center">
											🕒 Restaurant is currently closed. Checkout will be
											available during operating hours.
										</p>
									</div>
								)}

								{/* Checkout Button */}
								<Link
									to="/checkout"
									onClick={onClose}
									onMouseEnter={handlePreloadCheckout}
									className={`block w-full py-3 px-4 rounded-lg font-medium text-center transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
										isCheckoutButtonDisabled
											? "bg-accent-subtle-gray/50 text-accent-subtle-gray cursor-not-allowed pointer-events-none"
											: "bg-primary-green text-accent-light-beige hover:bg-accent-dark-green focus:ring-primary-green shadow-sm"
									}`}
									aria-disabled={isCheckoutButtonDisabled}
								>
									Proceed to Checkout
								</Link>
							</div>
						)}
					</motion.div>
				</>
			)}
		</AnimatePresence>
	);
};

export default CartSidebar;
