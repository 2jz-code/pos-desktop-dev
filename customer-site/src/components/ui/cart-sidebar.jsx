import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion"; // eslint-disable-line
import { FaShoppingCart, FaTrash, FaTimes } from "react-icons/fa";
import { Link, useNavigate } from "react-router-dom";
import { Clock, Store } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { useStoreStatus } from "@/contexts/StoreStatusContext";
import { useCartStore } from "@/store/cartStore";
import {
	getProductImageUrl,
	createImageErrorHandler,
} from "../../lib/imageUtils"; // Adjust path as needed
import OptimizedImage from "@/components/OptimizedImage";
import ModifierDisplay from "@/components/ui/ModifierDisplay";

const CartSidebar = ({ isOpen, onClose }) => {
	const checkoutPreloaded = useRef(false);
	const navigate = useNavigate();
	
	// Hooks
	const { cart, cartItemCount, subtotal, isLoading, removeFromCart } = useCart();
	const storeStatus = useStoreStatus();
	const cartStore = useCartStore();

	const cartItems = cart?.items || [];

	const formatPrice = (price) => {
		if (price === null || price === undefined) return "0.00";
		const numericPrice = typeof price === "string" ? parseFloat(price) : price;
		if (isNaN(numericPrice)) return "0.00";
		return numericPrice.toFixed(2);
	};

	// Update cart store when store status changes
	useEffect(() => {
		if (!storeStatus.isLoading) {
			cartStore.updateStoreStatus(storeStatus.isOpen, storeStatus.canPlaceOrder);
		}
	}, [storeStatus.isOpen, storeStatus.canPlaceOrder, storeStatus.isLoading]);

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
	const isCheckoutButtonDisabled = cartItemCount === 0 || !cartStore.canProceedToCheckout();

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

								{/* Store Status */}
								{storeStatus.isClosingSoon && storeStatus.canPlaceOrder && (
									<div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
										<div className="flex items-center justify-center">
											<Clock className="h-4 w-4 text-yellow-600 mr-2" />
											<p className="text-sm text-yellow-700 text-center">
												Store closing in {storeStatus.getTimeUntilCloseString()}. Please checkout soon!
											</p>
										</div>
									</div>
								)}
								
								{!storeStatus.canPlaceOrder && !storeStatus.isLoading && (
									<div className="bg-red-50 border border-red-200 rounded-lg p-3">
										<div className="flex items-center justify-center">
											<Store className="h-4 w-4 text-red-500 mr-2" />
											<div className="text-center">
												<p className="text-sm text-red-700 font-medium">
													Store is currently closed
												</p>
												{storeStatus.getNextOpeningDisplay() && (
													<p className="text-xs text-red-600 mt-1">
														We'll open again at {storeStatus.getNextOpeningDisplay()}
													</p>
												)}
											</div>
										</div>
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
									{!storeStatus.canPlaceOrder && !storeStatus.isLoading 
										? "Store Closed" 
										: cartItemCount === 0 
										? "Cart Empty" 
										: "Proceed to Checkout"
									}
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
