import { motion, AnimatePresence } from "framer-motion";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import {
	ShoppingCart,
	Package,
	Receipt,
	Clock,
	MapPin,
	Phone,
} from "lucide-react";

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

	const sidebarVariants = {
		hidden: { opacity: 0, x: 20 },
		visible: {
			opacity: 1,
			x: 0,
			transition: { duration: 0.4, delay: 0.2 },
		},
	};

	return (
		<div className="w-full h-full bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-8">
			<motion.div
				variants={containerVariants}
				initial="hidden"
				animate="visible"
				className="w-full h-full flex gap-6"
			>
				{/* Main Cart - 2/3 width */}
				<div className="flex-[2] h-full">
					<Card className="w-full h-full border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-2xl flex flex-col">
						<CardHeader className="text-center py-3 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
							<motion.div
								initial={{ scale: 0.8, opacity: 0 }}
								animate={{ scale: 1, opacity: 1 }}
								transition={{ duration: 0.5, delay: 0.2 }}
								className="flex items-center justify-center gap-2 mb-2"
							>
								<div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
									<ShoppingCart className="w-5 h-5 text-white" />
								</div>
								<CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100">
									Your Order
								</CardTitle>
							</motion.div>

							<motion.div
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.5, delay: 0.4 }}
								className="flex items-center justify-center"
							>
								<Badge
									variant="outline"
									className="px-3 py-1 text-xs font-medium border-slate-300 dark:border-slate-600"
								>
									<Package className="w-3 h-3 mr-1" />
									{itemCount} {itemCount === 1 ? "item" : "items"}
								</Badge>
							</motion.div>
						</CardHeader>

						<CardContent className="p-4 flex-1 flex flex-col min-h-0">
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
											className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 hover:shadow-sm transition-shadow duration-200"
										>
											<div className="flex-1 min-w-0">
												<h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
													{item.product.name}
												</h3>
												<div className="flex items-center gap-2 mt-1">
													<Badge
														variant="secondary"
														className="text-xs px-2 py-0"
													>
														Qty: {item.quantity}
													</Badge>
													<span className="text-xs text-slate-500 dark:text-slate-400">
														${Number.parseFloat(item.price_at_sale).toFixed(2)}{" "}
														each
													</span>
												</div>
											</div>
											<div className="text-right flex-shrink-0">
												<div className="text-lg font-bold text-slate-900 dark:text-slate-100">
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
								className="border-t border-slate-200 dark:border-slate-700 pt-3 flex-shrink-0"
							>
								<div className="bg-gradient-to-r from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-300 rounded-xl p-4 text-center">
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
									className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-medium"
								>
									<div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></div>
									Please review your order
								</motion.div>
							</motion.div>
						</CardContent>
					</Card>
				</div>

				{/* Sidebar - 1/3 width */}
				<motion.div
					variants={sidebarVariants}
					className="flex-1 flex flex-col gap-6"
				>
					{/* Store Info Card */}
					<Card className="border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-xl">
						<CardContent className="p-6">
							<div className="text-center mb-6">
								<div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-emerald-500 to-blue-600 rounded-2xl flex items-center justify-center">
									<ShoppingCart className="w-8 h-8 text-white" />
								</div>
								<h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
									Ajeen
								</h3>
								<p className="text-slate-600 dark:text-slate-400 text-sm">
									Fresh • Fast • Delicious
								</p>
							</div>

							<div className="space-y-4">
								<div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
									<MapPin className="w-4 h-4 text-emerald-500" />
									<span className="text-sm">2105 Cliff Rd, Eagan, MN</span>
								</div>
								<div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
									<Phone className="w-4 h-4 text-blue-500" />
									<span className="text-sm">(651) 412-5336</span>
								</div>
								<div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
									<Clock className="w-4 h-4 text-purple-500" />
									<span className="text-sm">Open 7AM - 10PM</span>
								</div>
							</div>
						</CardContent>
					</Card>
				</motion.div>
			</motion.div>
		</div>
	);
};

export default CustomerCartView;