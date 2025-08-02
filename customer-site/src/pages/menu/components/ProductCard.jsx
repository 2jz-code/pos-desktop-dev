import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion"; // eslint-disable-line
import { Plus, Minus, ShoppingCart, X, Eye, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import OptimizedImage from "@/components/OptimizedImage";
import {
	getProductImageUrl,
	createImageErrorHandler,
} from "../../../../src/lib/imageUtils"; // Adjust path as needed
import {
	canQuickAddProduct,
	getProductButtonText,
	getProductButtonTooltip,
	productHasRequiredModifiers,
	productHasModifiers
} from "@/utils/modifierCalculations";

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
	const navigate = useNavigate();

	const formatPrice = (price) => {
		if (price === null || price === undefined) return "0.00";
		const numericPrice = typeof price === "string" ? parseFloat(price) : price;
		if (isNaN(numericPrice)) return "0.00";
		return numericPrice.toFixed(2);
	};

	const stopPropagation = (e) => {
		e.stopPropagation();
		e.preventDefault();
	};

	const handleIncrement = (e) => {
		stopPropagation(e);
		onIncrement();
	};

	const handleDecrement = (e) => {
		stopPropagation(e);
		onDecrement();
	};

	const handleAddToCartClick = (e) => {
		stopPropagation(e);
		onAddToCart();
	};

	const handleToggleQuickAdd = (e) => {
		stopPropagation(e);
		onToggleQuickAdd();
	};

	const handleProductAction = (e) => {
		stopPropagation(e);
		
		// If product has required modifiers, navigate to details page
		if (productHasRequiredModifiers(product)) {
			navigate(`/product/${encodeURIComponent(product.name)}`);
		} else {
			// Otherwise, toggle quick add for products without required modifiers
			onToggleQuickAdd();
		}
	};

	const renderQuickAddPanel = () => (
		<motion.div
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: 10 }}
			transition={{ duration: 0.2 }}
			className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t rounded-b-xl z-10 shadow-lg"
			onClick={stopPropagation}
		>
			<div className="flex items-center justify-between mb-3">
				<div className="flex items-center border rounded-md overflow-hidden">
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8 rounded-none"
						onClick={handleDecrement}
						disabled={quantity <= 1}
					>
						<Minus className="h-4 w-4" />
					</Button>
					<span className="px-4 text-sm font-medium">{quantity}</span>
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8 rounded-none"
						onClick={handleIncrement}
					>
						<Plus className="h-4 w-4" />
					</Button>
				</div>
				<span className="font-semibold text-lg">
					${formatPrice((product.price || 0) * quantity)}
				</span>
			</div>
			<Button
				onClick={handleAddToCartClick}
				className="w-full bg-accent-dark-green text-accent-light-beige hover:bg-accent-dark-green/90"
			>
				Add to Cart
			</Button>
		</motion.div>
	);

	const renderGridProductCard = () => (
		<motion.div
			layout
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -20 }}
			transition={{
				duration: 0.3,
				type: "spring",
				stiffness: 300,
				damping: 30,
			}}
			className="bg-card text-card-foreground rounded-xl shadow-sm hover:shadow-lg transition-shadow relative border overflow-hidden flex flex-col justify-between"
		>
			<Link
				to={`/product/${encodeURIComponent(product.name)}`}
				className="h-full flex flex-col"
			>
				<div className="relative aspect-w-16 aspect-h-9 bg-muted">
					<OptimizedImage
						src={getProductImageUrl(product.image)}
						alt={product.name || "Product Image"}
						className="w-full h-48 object-cover"
						onError={createImageErrorHandler("Product")}
					/>
					{productHasModifiers(product) && (
						<div className="absolute top-2 right-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full flex items-center shadow-sm">
							<Settings className="h-3 w-3 mr-1" />
							{productHasRequiredModifiers(product) ? "Required" : "Options"}
						</div>
					)}
				</div>

				<div className="p-4 flex-grow flex flex-col justify-between">
					<div>
						<h3 className="text-lg font-semibold mb-1 line-clamp-1">
							{product.name}
						</h3>
						<p className="font-bold text-xl text-primary mb-2">
							${formatPrice(product.price)}
						</p>
						<p className="text-sm text-muted-foreground line-clamp-2 h-10 mb-3">
							{product.description || "No description available."}
						</p>
					</div>
				</div>
			</Link>
			<div className="p-4 pt-0 mt-auto">
				<Button
					variant="outline"
					onClick={handleProductAction}
					className="w-full"
					title={getProductButtonTooltip(product)}
				>
					{productHasRequiredModifiers(product) ? (
						<>
							<Settings className="mr-2 h-4 w-4" />
							{getProductButtonText(product)}
						</>
					) : (
						<>
							<ShoppingCart className="mr-2 h-4 w-4" />
							{getProductButtonText(product)}
						</>
					)}
				</Button>
			</div>

			<AnimatePresence>
				{showQuickAdd && !productHasRequiredModifiers(product) && renderQuickAddPanel()}
			</AnimatePresence>
		</motion.div>
	);

	const renderListProductCard = () => (
		<motion.div
			layout
			initial={{ opacity: 0, x: -20 }}
			animate={{ opacity: 1, x: 0 }}
			exit={{ opacity: 0, x: 20 }}
			transition={{ duration: 0.3 }}
			className="bg-card text-card-foreground rounded-lg shadow-sm hover:shadow-lg transition-shadow relative flex border overflow-hidden"
		>
			<div className="relative w-32 h-full flex-shrink-0 bg-muted">
				<OptimizedImage
					src={getProductImageUrl(product.image)}
					alt={product.name || "Product Image"}
					className="w-full h-full object-cover"
					onError={createImageErrorHandler("Product")}
				/>
				{productHasModifiers(product) && (
					<div className="absolute top-1 right-1 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full flex items-center shadow-sm">
						<Settings className="h-2.5 w-2.5" />
					</div>
				)}
			</div>

			<div className="flex-grow p-4 flex flex-col justify-between">
				<div>
					<Link
						to={`/product/${encodeURIComponent(product.name)}`}
						className="block"
					>
						<h3 className="text-lg font-semibold mb-1">{product.name}</h3>
						<p className="text-muted-foreground text-sm line-clamp-2 mb-2">
							{product.description || "No description available."}
						</p>
					</Link>
				</div>
				<div className="flex items-end justify-between mt-2">
					<p className="font-bold text-xl text-primary">
						${formatPrice(product.price)}
					</p>
					<Button
						variant="outline"
						size="sm"
						onClick={productHasRequiredModifiers(product) && !showQuickAdd ? handleProductAction : handleToggleQuickAdd}
						aria-label={
							productHasRequiredModifiers(product) && !showQuickAdd 
								? "View product details" 
								: showQuickAdd ? "Close quick add" : "Open quick add"
						}
						title={showQuickAdd ? "" : getProductButtonTooltip(product)}
					>
						{showQuickAdd ? (
							<>
								<X className="mr-1.5 h-4 w-4" /> Close
							</>
						) : productHasRequiredModifiers(product) ? (
							<>
								<Settings className="mr-1.5 h-4 w-4" /> Customize
							</>
						) : (
							<>
								<ShoppingCart className="mr-1.5 h-4 w-4" /> Add
							</>
						)}
					</Button>
				</div>
			</div>

			<AnimatePresence>
				{showQuickAdd && !productHasRequiredModifiers(product) && (
					<motion.div
						initial={{ opacity: 0, scale: 0.95, x: 10 }}
						animate={{ opacity: 1, scale: 1, x: 0 }}
						exit={{ opacity: 0, scale: 0.95, x: 10 }}
						className="absolute right-4 bottom-4 p-4 bg-white rounded-lg border shadow-xl z-20 w-64"
						onClick={stopPropagation}
					>
						<div className="flex items-center justify-between mb-3 mt-1">
							<div className="flex items-center border rounded-md overflow-hidden">
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8 rounded-none"
									onClick={handleDecrement}
									disabled={quantity <= 1}
								>
									<Minus className="h-4 w-4" />
								</Button>
								<span className="px-3 text-sm font-medium">{quantity}</span>
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8 rounded-none"
									onClick={handleIncrement}
								>
									<Plus className="h-4 w-4" />
								</Button>
							</div>
							<span className="text-md font-semibold">
								${formatPrice((product.price || 0) * quantity)}
							</span>
						</div>
						<Button
							onClick={handleAddToCartClick}
							className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
							size="sm"
						>
							Add to Cart
						</Button>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);

	return viewMode === "grid"
		? renderGridProductCard()
		: renderListProductCard();
};

export default ProductCard;
