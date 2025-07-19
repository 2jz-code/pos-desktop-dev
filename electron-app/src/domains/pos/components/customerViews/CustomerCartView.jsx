import { motion, AnimatePresence } from "framer-motion"; // eslint-disable-line
import { Badge } from "@/shared/components/ui/badge";
import { ShoppingCart, Package, Receipt } from "lucide-react";

const CustomerCartView = ({ cart, total }) => {
	const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);


	const containerVariants = {
		hidden: { opacity: 0, y: 20 },
		visible: {
			opacity: 1,
			y: 0,
			transition: {
				duration: 0.3,
				staggerChildren: 0.05,
			},
		},
	};

	const itemVariants = {
		hidden: { opacity: 0, x: -20 },
		visible: {
			opacity: 1,
			x: 0,
			transition: { duration: 0.3, ease: "easeOut" },
		},
		exit: {
			opacity: 0,
			x: 20,
			transition: { duration: 0.2, ease: "easeIn" },
		},
	};


	return (
		<div className="w-full h-full bg-gradient-to-br from-[#faf5ef] via-[#f3e1ca] to-[#d1c7bc] dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-8">
			<motion.div
				variants={containerVariants}
				initial="hidden"
				animate="visible"
				className="w-full h-full flex flex-col"
			>
				{/* Header */}
				<div className="text-center py-6 border-b border-[#d1c7bc] dark:border-slate-700 flex-shrink-0">
					<motion.div
						initial={{ scale: 0.8, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						transition={{ duration: 0.5, delay: 0.2 }}
						className="flex items-center justify-center gap-2 mb-2"
					>
						<div className="p-2 bg-gradient-to-br from-[#909373] to-[#5e6650] rounded-xl">
							<ShoppingCart className="w-5 h-5 text-white" />
						</div>
						<h1 className="text-2xl font-bold text-[#5e6650] dark:text-slate-100">
							Your Order
						</h1>
					</motion.div>

					<motion.div
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, delay: 0.4 }}
						className="flex items-center justify-center"
					>
						<Badge
							variant="outline"
							className="px-3 py-1 text-xs font-medium border-[#a0522d] text-[#a0522d] dark:border-slate-600"
						>
							<Package className="w-3 h-3 mr-1" />
							{itemCount} {itemCount === 1 ? "item" : "items"}
						</Badge>
					</motion.div>
				</div>

				<div className="p-4 flex-1 flex flex-col min-h-0">
							{/* Order Items */}
							<div className="flex-1 overflow-y-auto space-y-2 mb-4 pr-2">
								<AnimatePresence>
									{cart.map((item) => (
										<motion.div
											key={item.id}
											layout
											variants={itemVariants}
											initial="hidden"
											animate="visible"
											exit="exit"
											className="flex justify-between items-center p-3 bg-[#f3e1ca]/50 dark:bg-slate-800/50 rounded-lg border border-[#d1c7bc] dark:border-slate-700 hover:shadow-sm transition-shadow duration-200"
										>
											<div className="flex-1 min-w-0">
												<h3 className="text-sm font-semibold text-[#5e6650] dark:text-slate-100 truncate">
													{item.product.name}
												</h3>
												<div className="flex items-center gap-2 mt-1">
													<Badge
														variant="secondary"
														className="text-xs px-2 py-0"
													>
														Qty: {item.quantity}
													</Badge>
													<span className="text-xs text-[#a0522d] dark:text-slate-400">
														${Number.parseFloat(item.price_at_sale).toFixed(2)}{" "}
														each
													</span>
												</div>
											</div>
											<div className="text-right flex-shrink-0">
												<div className="text-lg font-bold text-[#5e6650] dark:text-slate-100">
													$
													{(
														item.quantity *
														Number.parseFloat(item.price_at_sale)
													).toFixed(2)}
												</div>
											</div>
										</motion.div>
									))}
								</AnimatePresence>
							</div>

							{/* Order Total */}
							<motion.div
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.6, delay: 0.6 }}
								className="border-t border-[#d1c7bc] dark:border-slate-700 pt-3 flex-shrink-0"
							>
								<div className="bg-gradient-to-r from-[#5e6650] to-[#a0522d] dark:from-slate-100 dark:to-slate-300 rounded-xl p-4 text-center">
									<div className="flex items-center justify-center gap-2 mb-1">
										<Receipt className="w-4 h-4 text-white dark:text-slate-900" />
										<span className="text-lg font-medium text-white dark:text-slate-900">
											Total Due
										</span>
									</div>
									<motion.div
										animate={{
											scale: [1, 1.02, 1],
										}}
										transition={{
											duration: 2,
											repeat: Number.POSITIVE_INFINITY,
											ease: "easeInOut",
										}}
										className="text-3xl font-bold text-white dark:text-slate-900"
									>
										${Number.parseFloat(total).toFixed(2)}
									</motion.div>
								</div>
							</motion.div>

							{/* Status Indicator */}
							<motion.div
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{ duration: 0.8, delay: 0.8 }}
								className="text-center mt-2 flex-shrink-0"
							>
								<motion.div
									animate={{
										scale: [1, 1.05, 1],
										opacity: [0.7, 1, 0.7],
									}}
									transition={{
										duration: 2,
										repeat: Number.POSITIVE_INFINITY,
										ease: "easeInOut",
									}}
									className="inline-flex items-center gap-2 text-[#5e6650] dark:text-slate-400 text-xs font-medium"
								>
									<div className="w-1.5 h-1.5 bg-[#909373] rounded-full animate-pulse"></div>
									Please review your order
								</motion.div>
							</motion.div>
				</div>
			</motion.div>
		</div>
	);
};

export default CustomerCartView;
