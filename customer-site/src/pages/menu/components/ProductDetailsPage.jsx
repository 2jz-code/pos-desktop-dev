import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion"; // eslint-disable-line
import {
	FaArrowLeft,
	FaShoppingCart,
	FaMinus,
	FaPlus,
	FaHeart,
} from "react-icons/fa";
import { toast } from "sonner";
import { useCart } from "@/hooks/useCart";
import { productsAPI } from "../../../api";
import { getProductImageUrl, createImageErrorHandler } from "@/lib/imageUtils"; // Updated import
import OptimizedImage from "@/components/OptimizedImage";
import InlineModifierSelector from "@/components/modifiers/InlineModifierSelector";
import { calculateProductTotalWithModifiers } from "@/utils/modifierCalculations";

const ProductDetailsPage = () => {
	const { productName, cartItemId } = useParams();
	const [product, setProduct] = useState(null);
	const [quantity, setQuantity] = useState(1);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);
	const [isFavorite, setIsFavorite] = useState(false);
	const [addingToCart, setAddingToCart] = useState(false);
	const [relatedProducts, setRelatedProducts] = useState([]);
	const [selectedModifiers, setSelectedModifiers] = useState([]);
	const [modifiersValid, setModifiersValid] = useState(true);
	const [cartItem, setCartItem] = useState(null);
	const [isUpdating, setIsUpdating] = useState(false);
	const navigate = useNavigate();
	const { addToCart, cart, removeFromCart, updateCartItemWithModifiers } = useCart();
	
	// Determine if we're in edit mode
	const isEditMode = Boolean(cartItemId);

	useEffect(() => {
		const fetchProduct = async () => {
			try {
				setIsLoading(true);
				setError(null);
				setProduct(null);
				setRelatedProducts([]);

				const response = await productsAPI.getByName(productName);
				setProduct(response);

				// Fetch related products from the same category
				try {
					const allProducts = await productsAPI.getAll();

					if (response.category && response.category.length > 0) {
						const categoryId = response.category[0].id;

						const filteredRelated = allProducts
							.filter((item) => {
								// Check if product has the same category and is not the current product
								const hasMatchingCategory =
									item.category &&
									item.category.some((cat) => cat.id === categoryId);
								const isDifferentProduct = item.name !== productName;

								return isDifferentProduct && hasMatchingCategory;
							})
							.slice(0, 4); // Take the first 4

						setRelatedProducts(filteredRelated);
					} else {
						// Fallback: show random products if no category
						const randomProducts = allProducts
							.filter((item) => item.name !== productName)
							.slice(0, 4);
						setRelatedProducts(randomProducts);
					}
				} catch (relatedError) {
					console.error("Failed to fetch related products:", relatedError);
					// Don't fail the whole page if related products fail
				}
			} catch (err) {
				console.error("Failed to fetch product:", err);
				setError("Failed to load product details. Please try again later.");
			} finally {
				setIsLoading(false);
			}
		};

		fetchProduct();
	}, [productName]);

	// Effect to populate form data when in edit mode
	useEffect(() => {
		if (isEditMode && cart && cartItemId && !cartItem && !isUpdating) {
			// Only try to find the item if we haven't already found it and aren't updating
			const item = cart.items?.find(item => item.id.toString() === cartItemId);
			if (item) {
				setCartItem(item);
				setQuantity(item.quantity);
				setSelectedModifiers(item.selected_modifiers_snapshot || []);
			} else if (cart.items && cart.items.length > 0) {
				// Cart item not found and cart has items, redirect back to menu
				toast.error("Item not found in cart");
				navigate("/menu");
			}
		}
	}, [isEditMode, cart, cartItemId, navigate, cartItem, isUpdating]);

	const formatPrice = (price) => {
		if (price === null || price === undefined) return "0.00";
		const numericPrice = typeof price === "string" ? parseFloat(price) : price;
		return isNaN(numericPrice) ? "0.00" : numericPrice.toFixed(2);
	};

	// Calculate total price including modifiers
	const totalPrice = product 
		? calculateProductTotalWithModifiers(product.price, selectedModifiers, quantity)
		: 0;

	// Handle modifier changes
	const handleModifiersChange = useCallback((modifiers, isValid) => {
		setSelectedModifiers(modifiers);
		setModifiersValid(isValid);
	}, []);

	const handleQuantityChange = (newQuantity) => {
		if (newQuantity >= 1 && newQuantity <= 10) {
			setQuantity(newQuantity);
		}
	};

	const handleAddToCart = async () => {
		if (!product) return;
		
		// Check if modifiers are valid
		if (!modifiersValid) {
			toast.error("Please complete required selections before adding to cart.");
			return;
		}
		
		setAddingToCart(true);
		if (isEditMode) {
			setIsUpdating(true);
		}
		
		try {
			if (isEditMode && cartItem) {
				// Edit mode: Update cart item with new modifiers
				const result = await updateCartItemWithModifiers(
					cartItem.id, 
					product, 
					quantity, 
					cartItem.notes || "", 
					selectedModifiers
				);
				if (result) {
					toast.success(`${product.name} updated in your cart!`);
					navigate("/menu");
				}
			} else {
				// Add mode: Normal add to cart
				const result = await addToCart(product, quantity, "", selectedModifiers);
				if (result && result.success) {
					toast.success(`${quantity} ${product.name}(s) added to your cart!`);
					setQuantity(1);
					setSelectedModifiers([]);
				} else {
					toast.error(
						result?.error || "Failed to add item to cart. Please try again."
					);
				}
			}
		} catch (err) {
			console.error("Failed to add/update cart:", err);
			toast.error(isEditMode ? "Failed to update item. Please try again." : "Failed to add item to cart. Please try again.");
		} finally {
			setAddingToCart(false);
			setIsUpdating(false);
		}
	};

	const toggleFavorite = () => {
		setIsFavorite(!isFavorite);
		toast.info(
			isFavorite
				? `${product.name} removed from favorites.`
				: `${product.name} added to favorites!`
		);
	};

	const handleBackToMenu = () => {
		navigate("/menu");
	};

	// Format image URL for development

	// Loading State
	if (isLoading) {
		return (
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
				<div className="animate-pulse">
					<div className="h-6 bg-accent-subtle-gray/50 rounded w-1/3 mb-6"></div>
					<div className="md:flex md:space-x-8">
						<div className="md:w-1/2">
							<div className="aspect-w-4 aspect-h-3 bg-accent-subtle-gray/50 rounded-lg mb-6 md:mb-0 h-96"></div>
						</div>
						<div className="md:w-1/2 space-y-4">
							<div className="h-8 bg-accent-subtle-gray/50 rounded w-3/4"></div>
							<div className="h-10 bg-accent-subtle-gray/50 rounded w-1/4"></div>
							<div className="h-4 bg-accent-subtle-gray/40 rounded w-full"></div>
							<div className="h-4 bg-accent-subtle-gray/40 rounded w-full"></div>
							<div className="h-4 bg-accent-subtle-gray/40 rounded w-5/6"></div>
							<div className="h-12 bg-accent-subtle-gray/50 rounded-md w-1/2 mt-8"></div>
							<div className="h-12 bg-accent-subtle-gray/50 rounded-md w-full mt-4"></div>
						</div>
					</div>
					<div className="mt-12">
						<div className="h-8 bg-accent-subtle-gray/50 rounded w-1/4 mb-6"></div>
						<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
							{[...Array(4)].map((_, i) => (
								<div
									key={i}
									className="bg-accent-subtle-gray/40 rounded-lg h-64"
								></div>
							))}
						</div>
					</div>
				</div>
			</div>
		);
	}

	// Error State
	if (error) {
		return (
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
				<div className="bg-red-100 border border-red-300 text-red-700 p-6 rounded-lg shadow-md">
					<h2 className="text-xl font-semibold mb-2">Error Loading Product</h2>
					<p className="mb-4">{error}</p>
					<button
						onClick={handleBackToMenu}
						className="bg-primary-green text-accent-light-beige px-4 py-2 rounded-lg hover:bg-accent-dark-green transition-colors"
					>
						Back to Menu
					</button>
				</div>
			</div>
		);
	}

	// Product Not Found State
	if (!product) {
		return (
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
				<p className="text-accent-dark-brown">Product not found.</p>
				<button
					onClick={handleBackToMenu}
					className="mt-4 bg-primary-green text-accent-light-beige px-4 py-2 rounded-lg hover:bg-accent-dark-green transition-colors"
				>
					Back to Menu
				</button>
			</div>
		);
	}

	// Determine category name safely
	const categoryName =
		product.category && !Array.isArray(product.category)
			? product.category.name
			: Array.isArray(product.category) && product.category.length > 0
			? product.category[0].name
			: "Products";

	const imageUrl = getProductImageUrl(product.image);

	return (
		<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
			{/* Breadcrumb navigation */}
			<nav className="flex items-center text-sm text-accent-dark-brown mb-6">
				<button
					onClick={handleBackToMenu}
					className="flex items-center text-primary-green hover:text-accent-dark-green transition-colors"
				>
					<FaArrowLeft className="mr-2" />
					Back to Menu
				</button>
				<span className="mx-2 text-accent-subtle-gray">/</span>
				<span className="text-primary-green">{categoryName}</span>
				<span className="mx-2 text-accent-subtle-gray">/</span>
				<span className="font-medium text-accent-dark-green">
					{isEditMode ? `Editing: ${product.name}` : product.name}
				</span>
			</nav>

			{/* Product details section */}
			<div className="md:flex md:gap-8">
				{/* Product image - Sticky */}
				<div className="md:w-1/2 md:sticky md:top-8 md:self-start">
					<div className="bg-primary-beige rounded-xl shadow-lg overflow-hidden border border-accent-subtle-gray/20 relative group bg-accent-subtle-gray/30 h-96 md:h-[500px]">
						<OptimizedImage
							src={imageUrl}
							alt={product.name || "Product Image"}
							className={`w-full h-full object-cover`}
							onError={createImageErrorHandler("Product Image")}
							priority
						/>
						{/* Favorite button */}
						<button
							onClick={toggleFavorite}
							className="absolute top-4 right-4 p-2.5 bg-accent-light-beige/80 backdrop-blur-sm rounded-full shadow-md hover:bg-accent-light-beige transition-colors focus:outline-none focus:ring-2 focus:ring-primary-green"
							aria-label={
								isFavorite ? "Remove from favorites" : "Add to favorites"
							}
						>
							<FaHeart
								size={20}
								className={
									isFavorite ? "text-red-500" : "text-accent-subtle-gray"
								}
							/>
						</button>
					</div>
				</div>

				{/* Product info - Expandable */}
				<div className="md:w-1/2 mt-6 md:mt-0">
					<div className="bg-primary-beige rounded-xl shadow-lg border border-accent-subtle-gray/20 p-6 md:p-8">
						{/* Category tag */}
						{categoryName !== "Products" && (
							<span className="text-sm text-primary-green font-medium tracking-wide uppercase mb-2 block">
								{categoryName}
							</span>
						)}
						{/* Product name */}
						<h1 className="text-3xl md:text-4xl font-bold text-accent-dark-green mb-2">
							{product.name}
						</h1>
						{/* Price */}
						<div className="mb-4">
							{selectedModifiers.length > 0 && totalPrice !== parseFloat(product.price) * quantity ? (
								<div>
									<p className="text-lg text-accent-subtle-gray line-through">
										${formatPrice(parseFloat(product.price) * quantity)}
									</p>
									<p className="text-3xl font-bold text-primary-green">
										${formatPrice(totalPrice)}
									</p>
								</div>
							) : (
								<p className="text-3xl font-bold text-primary-green">
									${formatPrice(parseFloat(product.price) * quantity)}
								</p>
							)}
						</div>
						{/* Product description */}
						<div className="prose prose-sm text-accent-dark-brown mb-6 max-w-none">
							<p>{product.description || "No description available."}</p>
						</div>

						{/* Modifier Selection */}
						{product.modifier_groups && product.modifier_groups.length > 0 && (
							<div className="mb-8">
								<InlineModifierSelector
									product={product}
									onModifiersChange={handleModifiersChange}
								/>
							</div>
						)}

						{/* Quantity selector */}
						<div className="mb-6">
							<label
								htmlFor="quantity"
								className="block text-sm font-medium text-accent-dark-green mb-2"
							>
								Quantity
							</label>
							<div className="flex items-center">
								<div className="inline-flex items-center bg-white border border-accent-subtle-gray rounded-full p-1 shadow-sm">
									<button
										onClick={() => handleQuantityChange(quantity - 1)}
										disabled={quantity <= 1}
										className={`p-2.5 rounded-full transition-colors focus:outline-none ${
											quantity <= 1
												? "text-accent-subtle-gray cursor-not-allowed"
												: "text-accent-dark-brown hover:bg-primary-beige/50 active:bg-primary-beige/70"
										}`}
										aria-label="Decrease quantity"
									>
										<FaMinus size={12} />
									</button>
									<span className="px-5 font-medium text-accent-dark-green text-lg">
										{quantity}
									</span>
									<button
										onClick={() => handleQuantityChange(quantity + 1)}
										disabled={quantity >= 10}
										className={`p-2.5 rounded-full transition-colors focus:outline-none ${
											quantity >= 10
												? "text-accent-subtle-gray cursor-not-allowed"
												: "text-accent-dark-brown hover:bg-primary-beige/50 active:bg-primary-beige/70"
										}`}
										aria-label="Increase quantity"
									>
										<FaPlus size={12} />
									</button>
								</div>
								{quantity >= 10 && (
									<span className="ml-4 text-xs text-red-600">
										Max quantity: 10
									</span>
								)}
							</div>
						</div>

						{/* Add to cart button */}
						<motion.button
							onClick={handleAddToCart}
							disabled={addingToCart || !modifiersValid}
							className={`w-full flex items-center justify-center px-6 py-3.5 rounded-lg text-accent-light-beige font-semibold ${
								addingToCart || !modifiersValid
									? "bg-accent-subtle-gray cursor-not-allowed"
									: "bg-primary-green hover:bg-accent-dark-green"
							} transition-colors shadow-md`}
							whileTap={{ scale: 0.98 }}
						>
							{addingToCart ? (
								<>
									<svg
										className="animate-spin -ml-1 mr-3 h-5 w-5"
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
									>
										<circle
											className="opacity-25"
											cx="12"
											cy="12"
											r="10"
											stroke="currentColor"
											strokeWidth="4"
										></circle>
										<path
											className="opacity-75"
											fill="currentColor"
											d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
										></path>
									</svg>
									Adding...
								</>
							) : (
								<>
									<FaShoppingCart className="mr-2" />
									{isEditMode ? "Update Item" : "Add to Cart"}
								</>
							)}
						</motion.button>
					</div>
				</div>
			</div>

			{/* Related Products Section */}
			{relatedProducts.length > 0 && (
				<div className="mt-16">
					<h2 className="text-2xl font-bold text-accent-dark-green mb-6 pb-2 border-b border-accent-subtle-gray/30">
						You May Also Like
					</h2>
					<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
						{relatedProducts.map((relatedProduct) => {
							const relatedImageUrl = getProductImageUrl(relatedProduct.image);

							return (
								<motion.div
									key={relatedProduct.id}
									whileHover={{
										y: -3,
										boxShadow:
											"0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
									}}
									transition={{ duration: 0.2 }}
									className="bg-primary-beige rounded-xl shadow-md overflow-hidden cursor-pointer border border-accent-subtle-gray/20 flex flex-col justify-between"
									onClick={() =>
										navigate(
											`/product/${encodeURIComponent(relatedProduct.name)}`
										)
									}
								>
									<div>
										<div className="aspect-w-1 aspect-h-1 w-full bg-accent-subtle-gray/30 relative">
											<OptimizedImage
												src={relatedImageUrl}
												alt={relatedProduct.name || "Product Image"}
												className={`w-full h-48 object-cover`}
												onError={createImageErrorHandler("Related Product")}
											/>
										</div>
										<div className="p-4">
											<h3 className="text-md font-semibold text-accent-dark-green mb-1 line-clamp-1">
												{relatedProduct.name}
											</h3>
											<p className="text-primary-green font-bold text-lg">
												${formatPrice(relatedProduct.price)}
											</p>
											<p className="text-accent-dark-brown text-xs line-clamp-2 mt-1 h-8">
												{relatedProduct.description ||
													"No description available."}
											</p>
										</div>
									</div>
									<div className="p-4 pt-0 mt-auto">
										<button
											className="mt-3 w-full bg-accent-light-beige hover:bg-primary-beige/70 text-accent-dark-green py-2 px-3 rounded-md text-xs font-medium transition-colors border border-accent-subtle-gray/50"
											onClick={(e) => {
												e.stopPropagation();
												navigate(
													`/product/${encodeURIComponent(relatedProduct.name)}`
												);
											}}
										>
											View Details
										</button>
									</div>
								</motion.div>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
};

export default ProductDetailsPage;
