import React, { useState, useEffect } from "react";
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
import { useCart } from "../../../contexts/CartContext";
import { productsAPI } from "../../../api";

const ProductDetailsPage = () => {
	const { productName } = useParams();
	const [product, setProduct] = useState(null);
	const [quantity, setQuantity] = useState(1);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);
	const [isFavorite, setIsFavorite] = useState(false);
	const [addingToCart, setAddingToCart] = useState(false);
	const [relatedProducts, setRelatedProducts] = useState([]);
	const [imageLoaded, setImageLoaded] = useState(false);
	const [relatedImagesLoaded, setRelatedImagesLoaded] = useState({});
	const navigate = useNavigate();
	const { addToCart } = useCart();

	useEffect(() => {
		const fetchProduct = async () => {
			try {
				setIsLoading(true);
				setError(null);
				setProduct(null);
				setRelatedProducts([]);
				setImageLoaded(false);
				setRelatedImagesLoaded({});

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

	const formatPrice = (price) => {
		if (price === null || price === undefined) return "0.00";
		const numericPrice = typeof price === "string" ? parseFloat(price) : price;
		return isNaN(numericPrice) ? "0.00" : numericPrice.toFixed(2);
	};

	const handleQuantityChange = (newQuantity) => {
		if (newQuantity >= 1 && newQuantity <= 10) {
			setQuantity(newQuantity);
		}
	};

	const handleAddToCart = async () => {
		if (!product) return;
		setAddingToCart(true);
		try {
			const result = await addToCart(product, quantity);
			if (result && result.success) {
				toast.success(`${quantity} ${product.name}(s) added to your cart!`);
				setQuantity(1);
			} else {
				toast.error(
					result?.error || "Failed to add item to cart. Please try again."
				);
			}
		} catch (err) {
			console.error("Failed to add to cart:", err);
			toast.error("Failed to add item to cart. Please try again.");
		} finally {
			setAddingToCart(false);
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
	const formatImageUrl = (imageUrl) => {
		if (!imageUrl) return null;
		if (
			process.env.NODE_ENV === "development" && // eslint-disable-line
			imageUrl.startsWith("https")
		) {
			return imageUrl.replace("https://", "http://");
		}
		return imageUrl;
	};

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

	const imageUrl = formatImageUrl(product.image);

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
					{product.name}
				</span>
			</nav>

			{/* Product details section */}
			<div className="bg-primary-beige rounded-xl shadow-lg overflow-hidden border border-accent-subtle-gray/20">
				<div className="md:flex">
					{/* Product image */}
					<div className="md:w-1/2 relative group bg-accent-subtle-gray/30">
						{/* Loading indicator */}
						{!imageLoaded && (
							<div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-pulse overflow-hidden">
								<div className="w-full h-full bg-gray-200 relative">
									<div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent"></div>
									<div className="absolute inset-0 flex items-center justify-center">
										<div className="animate-spin rounded-full h-12 w-12 border-3 border-gray-300 border-t-primary-green"></div>
									</div>
								</div>
							</div>
						)}

						<div className="aspect-w-4 aspect-h-3">
							<img
								src={
									imageUrl ||
									`http://placehold.co/800x600/F3E1CA/5E6650?text=${encodeURIComponent(
										product.name
									)}`
								}
								alt={product.name}
								className={`w-full h-full object-cover transition-opacity duration-300 ${
									imageLoaded ? "opacity-100" : "opacity-0"
								}`}
								onLoad={() => setImageLoaded(true)}
								onError={(e) => {
									e.target.onerror = null;
									const canvas = document.createElement("canvas");
									const ctx = canvas.getContext("2d");
									canvas.width = 800;
									canvas.height = 600;
									ctx.fillStyle = "#F3E1CA";
									ctx.fillRect(0, 0, 800, 600);
									ctx.fillStyle = "#5E6650";
									ctx.font = "64px Arial";
									ctx.textAlign = "center";
									ctx.fillText("📷", 400, 280);
									ctx.font = "20px Arial";
									ctx.fillText(
										product.name.length > 40
											? product.name.substring(0, 40) + "..."
											: product.name,
										400,
										320
									);
									e.target.src = canvas.toDataURL();
									setImageLoaded(true);
								}}
							/>
						</div>
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

					{/* Product info */}
					<div className="md:w-1/2 p-6 md:p-8 flex flex-col justify-between">
						<div>
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
							<p className="text-3xl font-bold text-primary-green mb-4">
								${formatPrice(product.price)}
							</p>
							{/* Product description */}
							<div className="prose prose-sm text-accent-dark-brown mb-6 max-w-none">
								<p>{product.description || "No description available."}</p>
							</div>
						</div>

						<div className="mt-auto">
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
								disabled={addingToCart}
								className={`w-full flex items-center justify-center px-6 py-3.5 rounded-lg text-accent-light-beige font-semibold ${
									addingToCart
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
										Add to Cart
									</>
								)}
							</motion.button>
						</div>
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
							const relatedImageUrl = formatImageUrl(relatedProduct.image);
							const relatedImageLoaded =
								relatedImagesLoaded[relatedProduct.id] || false;

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
											{/* Loading indicator for related products */}
											{!relatedImageLoaded && (
												<div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-pulse overflow-hidden">
													<div className="w-full h-48 bg-gray-200 relative">
														<div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent"></div>
														<div className="absolute inset-0 flex items-center justify-center">
															<div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-primary-green"></div>
														</div>
													</div>
												</div>
											)}

											<img
												src={
													relatedImageUrl ||
													`http://placehold.co/400x400/F3E1CA/5E6650?text=${encodeURIComponent(
														relatedProduct.name
													)}`
												}
												alt={relatedProduct.name}
												className={`w-full h-48 object-cover transition-opacity duration-300 ${
													relatedImageLoaded ? "opacity-100" : "opacity-0"
												}`}
												onLoad={() =>
													setRelatedImagesLoaded((prev) => ({
														...prev,
														[relatedProduct.id]: true,
													}))
												}
												onError={(e) => {
													e.target.onerror = null;
													const canvas = document.createElement("canvas");
													const ctx = canvas.getContext("2d");
													canvas.width = 400;
													canvas.height = 400;
													ctx.fillStyle = "#F3E1CA";
													ctx.fillRect(0, 0, 400, 400);
													ctx.fillStyle = "#5E6650";
													ctx.font = "32px Arial";
													ctx.textAlign = "center";
													ctx.fillText("📷", 200, 180);
													ctx.font = "14px Arial";
													const name =
														relatedProduct.name.length > 25
															? relatedProduct.name.substring(0, 25) + "..."
															: relatedProduct.name;
													ctx.fillText(name, 200, 210);
													e.target.src = canvas.toDataURL();
													setRelatedImagesLoaded((prev) => ({
														...prev,
														[relatedProduct.id]: true,
													}));
												}}
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
