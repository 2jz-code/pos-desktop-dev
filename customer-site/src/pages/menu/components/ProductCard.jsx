import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion"; // eslint-disable-line
import { FaPlus, FaMinus, FaShoppingCart } from "react-icons/fa";

const ProductCard = ({
	product,
	quantity,
	onIncrement,
	onDecrement,
	onAddToCart,
	showQuickAdd,
	onToggleQuickAdd,
	viewMode = "grid",
}) => {
	const [imageLoaded, setImageLoaded] = useState(false);

	const formatPrice = (price) => {
		if (price === null || price === undefined) return "0.00";
		const numericPrice = typeof price === "string" ? parseFloat(price) : price;
		if (isNaN(numericPrice)) return "0.00";
		return numericPrice.toFixed(2);
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

	if (viewMode === "list") {
		return (
			<motion.div
				layout
				initial={{ opacity: 0, x: -20 }}
				animate={{ opacity: 1, x: 0 }}
				exit={{ opacity: 0, x: 20 }}
				transition={{ duration: 0.3 }}
				className="bg-primary-beige rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-shadow border border-accent-subtle-gray/20"
			>
				<Link
					to={`/product/${encodeURIComponent(product.name)}`}
					className="flex"
					onClick={(e) => showQuickAdd && e.preventDefault()}
				>
					{/* Product Image */}
					<div className="w-32 h-32 flex-shrink-0 relative bg-gray-100">
						{/* Skeleton loader */}
						{!imageLoaded && (
							<div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-pulse">
								<div className="h-full w-full bg-gray-200 relative">
									<div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent"></div>
									<div className="absolute inset-0 flex items-center justify-center">
										<div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-primary-green"></div>
									</div>
								</div>
							</div>
						)}

						<img
							src={
								formatImageUrl(product.image) ||
								`http://placehold.co/400x400/F3E1CA/5E6650?text=${encodeURIComponent(
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
								canvas.width = 400;
								canvas.height = 400;
								ctx.fillStyle = "#F3E1CA";
								ctx.fillRect(0, 0, 400, 400);
								ctx.fillStyle = "#5E6650";
								ctx.font = "32px Arial";
								ctx.textAlign = "center";
								ctx.fillText("📷", 200, 180);
								ctx.font = "12px Arial";
								ctx.fillText(
									product.name.length > 20
										? product.name.substring(0, 20) + "..."
										: product.name,
									200,
									220
								);
								e.target.src = canvas.toDataURL();
								setImageLoaded(true);
							}}
						/>
					</div>

					{/* Product Details */}
					<div className="flex-1 p-4 flex justify-between">
						<div className="flex-1">
							<h3 className="text-lg font-semibold text-accent-dark-green mb-1">
								{product.name}
							</h3>
							<p className="text-primary-green font-bold text-xl mb-2">
								${formatPrice(product.price)}
							</p>
							{product.description && (
								<p className="text-accent-dark-brown text-sm line-clamp-2">
									{product.description}
								</p>
							)}
						</div>

						{/* Add to Cart Section */}
						<div className="flex items-center ml-4">
							{showQuickAdd ? (
								<div className="flex items-center space-x-2 bg-accent-light-beige rounded-lg p-2 border border-accent-subtle-gray/50">
									<div className="flex items-center border border-accent-subtle-gray rounded-md overflow-hidden">
										<button
											onClick={(e) => {
												e.preventDefault();
												e.stopPropagation();
												onDecrement();
											}}
											className="px-3 py-1.5 text-accent-dark-brown hover:bg-primary-beige/50 disabled:opacity-50"
											disabled={quantity <= 1}
										>
											<FaMinus size={12} />
										</button>
										<span className="px-4 py-1.5 text-accent-dark-green font-medium bg-white">
											{quantity}
										</span>
										<button
											onClick={(e) => {
												e.preventDefault();
												e.stopPropagation();
												onIncrement();
											}}
											className="px-3 py-1.5 text-accent-dark-brown hover:bg-primary-beige/50"
										>
											<FaPlus size={12} />
										</button>
									</div>
									<span className="font-semibold text-accent-dark-green text-lg">
										${formatPrice((product.price || 0) * quantity)}
									</span>
									<button
										onClick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											onAddToCart();
										}}
										className="ml-2 bg-primary-green hover:bg-accent-dark-green text-accent-light-beige py-2 px-4 rounded-md font-medium transition-colors shadow-sm"
									>
										Add to Cart
									</button>
								</div>
							) : (
								<button
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										onToggleQuickAdd();
									}}
									className="px-6 py-2 bg-accent-light-beige hover:bg-primary-beige/70 text-accent-dark-green border border-accent-subtle-gray/50 rounded-md font-medium transition-colors"
								>
									<FaShoppingCart className="mr-2" />
									Quick Add
								</button>
							)}
						</div>
					</div>
				</Link>
			</motion.div>
		);
	}

	// Grid view (default)
	return (
		<motion.div
			layout
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -20 }}
			transition={{ duration: 0.3 }}
			className="bg-primary-beige rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-shadow relative border border-accent-subtle-gray/20 flex flex-col justify-between"
		>
			<Link
				to={`/product/${encodeURIComponent(product.name)}`}
				className="h-full flex flex-col"
				onClick={(e) => showQuickAdd && e.preventDefault()}
			>
				{/* Product Image */}
				<div className="relative bg-gray-100">
					{/* Skeleton loader with shimmer effect */}
					{!imageLoaded && (
						<div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-pulse overflow-hidden">
							<div className="h-48 w-full bg-gray-200 rounded-t-xl relative">
								{/* Shimmer overlay */}
								<div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent"></div>
								{/* Loading spinner in center */}
								<div className="absolute inset-0 flex items-center justify-center">
									<div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-primary-green"></div>
								</div>
							</div>
						</div>
					)}

					<img
						src={
							formatImageUrl(product.image) ||
							`http://placehold.co/600x400/F3E1CA/5E6650?text=${encodeURIComponent(
								product.name
							)}`
						}
						alt={product.name}
						loading="lazy"
						sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
						className={`w-full h-48 object-cover transition-opacity duration-300 ${
							imageLoaded ? "opacity-100" : "opacity-0"
						}`}
						onLoad={() => setImageLoaded(true)}
						onError={(e) => {
							e.target.onerror = null;
							// Create a better fallback with an icon instead of text
							const canvas = document.createElement("canvas");
							const ctx = canvas.getContext("2d");
							canvas.width = 600;
							canvas.height = 400;

							// Background
							ctx.fillStyle = "#F3E1CA";
							ctx.fillRect(0, 0, 600, 400);

							// Icon placeholder (simple camera icon using paths)
							ctx.fillStyle = "#5E6650";
							ctx.font = "48px Arial";
							ctx.textAlign = "center";
							ctx.fillText("📷", 300, 180);

							// Product name
							ctx.font = "16px Arial";
							ctx.fillText(
								product.name.length > 30
									? product.name.substring(0, 30) + "..."
									: product.name,
								300,
								220
							);

							// Convert canvas to data URL
							e.target.src = canvas.toDataURL();
							setImageLoaded(true);
						}}
					/>

					{/* Category badge */}
					{product.category && (
						<div className="absolute top-2 left-2">
							<span className="inline-block bg-primary-green/20 text-primary-green text-xs px-2.5 py-1 rounded-full font-medium">
								{Array.isArray(product.category) && product.category.length > 0
									? product.category[0].name
									: product.category.name || "Product"}
							</span>
						</div>
					)}
				</div>

				{/* Product Details */}
				<div className="p-4 flex-grow flex flex-col justify-between">
					<div>
						<h3 className="text-lg font-semibold text-accent-dark-green mb-1 line-clamp-1">
							{product.name}
						</h3>
						<p className="text-primary-green font-bold text-xl mb-2">
							${formatPrice(product.price)}
						</p>
						<p className="text-accent-dark-brown text-sm line-clamp-2 h-10 mb-3">
							{product.description || "No description available."}
						</p>
					</div>
				</div>
			</Link>

			{/* Quick Add Button */}
			<div className="p-4 pt-0 mt-auto">
				<button
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						onToggleQuickAdd();
					}}
					className="w-full flex items-center justify-center text-sm font-medium py-2 px-3 rounded-md bg-accent-light-beige hover:bg-primary-beige/70 text-accent-dark-green border border-accent-subtle-gray/50 transition-colors"
					aria-label="Quick add"
				>
					<FaShoppingCart className="mr-2" /> Quick Add
				</button>
			</div>

			{/* Quick Add Overlay */}
			<AnimatePresence>
				{showQuickAdd && (
					<motion.div
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 10 }}
						className="absolute bottom-0 left-0 right-0 p-4 bg-accent-light-beige border-t border-accent-subtle-gray shadow-lg z-20 rounded-b-xl"
					>
						<div className="flex items-center justify-between mb-3">
							<div className="flex items-center border border-accent-subtle-gray rounded-md overflow-hidden">
								<button
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										onDecrement();
									}}
									className="px-3 py-1.5 text-accent-dark-brown hover:bg-primary-beige/50 disabled:opacity-50"
									disabled={quantity <= 1}
								>
									<FaMinus size={12} />
								</button>
								<span className="px-4 py-1.5 text-accent-dark-green font-medium bg-white">
									{quantity}
								</span>
								<button
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										onIncrement();
									}}
									className="px-3 py-1.5 text-accent-dark-brown hover:bg-primary-beige/50"
								>
									<FaPlus size={12} />
								</button>
							</div>
							<span className="font-semibold text-accent-dark-green text-lg">
								${formatPrice((product.price || 0) * quantity)}
							</span>
						</div>
						<button
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								onAddToCart();
							}}
							className="w-full bg-primary-green hover:bg-accent-dark-green text-accent-light-beige py-2.5 rounded-md font-medium transition-colors shadow-sm"
						>
							Add to Cart
						</button>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
};

export default ProductCard;
