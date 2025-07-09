import { useState } from "react";
import { motion } from "framer-motion"; // eslint-disable-line
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Heart, DollarSign, Percent, Coffee } from "lucide-react";

const TipSelectionView = ({ amountDue, onTipSelect }) => {
	const [selectedTip, setSelectedTip] = useState(null);
	const [customTip, setCustomTip] = useState("");
	// const [tipType, setTipType] = useState("percentage"); // "percentage" or "amount" Remove this line

	const tipPercentages = [15, 18, 20, 25];

	const calculateTipAmount = (percentage) => {
		return (Number.parseFloat(amountDue) * percentage) / 100;
	};

	const handleTipSelect = (tip) => {
		setSelectedTip(tip);
		setCustomTip("");
		if (onTipSelect) {
			onTipSelect(tip);
		}
	};

	const handleCustomTipSubmit = () => {
		const customAmount = Number.parseFloat(customTip);
		if (customAmount >= 0) {
			handleTipSelect(customAmount);
		}
	};

	const containerVariants = {
		hidden: { opacity: 0, scale: 0.9 },
		visible: {
			opacity: 1,
			scale: 1,
			transition: {
				duration: 0.6,
				staggerChildren: 0.1,
			},
		},
	};

	const itemVariants = {
		hidden: { opacity: 0, y: 20 },
		visible: {
			opacity: 1,
			y: 0,
			transition: { duration: 0.4 },
		},
	};

	return (
		<div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-blue-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-8">
			<motion.div
				variants={containerVariants}
				initial="hidden"
				animate="visible"
				className="w-full max-w-3xl"
			>
				<Card className="border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-2xl">
					<CardHeader className="text-center pb-8 border-b border-slate-200 dark:border-slate-700">
						<motion.div
							initial={{ scale: 0.8, opacity: 0 }}
							animate={{ scale: 1, opacity: 1 }}
							transition={{ duration: 0.5, delay: 0.2 }}
							className="flex items-center justify-center gap-3 mb-6"
						>
							<div className="p-4 bg-gradient-to-br from-emerald-500 to-blue-600 rounded-3xl">
								<Heart className="w-10 h-10 text-white" />
							</div>
							<CardTitle className="text-5xl font-bold text-slate-900 dark:text-slate-100">
								Add a Tip?
							</CardTitle>
						</motion.div>

						<motion.p
							variants={itemVariants}
							className="text-xl text-slate-600 dark:text-slate-300 font-light"
						>
							Your support means the world to us
						</motion.p>

						{/* Order Total Display */}
						<motion.div
							variants={itemVariants}
							className="mt-6 p-4 bg-slate-100 dark:bg-slate-800 rounded-xl"
						>
							<div className="flex items-center justify-center gap-2 text-slate-600 dark:text-slate-400 mb-2">
								<DollarSign className="w-5 h-5" />
								<span className="text-lg font-medium">Order Total</span>
							</div>
							<div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
								${Number.parseFloat(amountDue).toFixed(2)}
							</div>
						</motion.div>
					</CardHeader>

					<CardContent className="p-8">
						{/* Quick Tip Buttons */}
						<motion.div
							variants={itemVariants}
							className="mb-8"
						>
							<h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4 text-center">
								Quick Select
							</h3>
							<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
								{tipPercentages.map((percentage) => {
									const tipAmount = calculateTipAmount(percentage);
									const isSelected = selectedTip === tipAmount;

									return (
										<motion.div
											key={percentage}
											whileHover={{ scale: 1.05 }}
											whileTap={{ scale: 0.95 }}
										>
											<Button
												onClick={() => handleTipSelect(tipAmount)}
												variant={isSelected ? "default" : "outline"}
												className={`w-full h-24 flex flex-col gap-2 text-lg font-semibold transition-all duration-200 ${
													isSelected
														? "bg-gradient-to-br from-emerald-500 to-blue-600 text-white shadow-lg"
														: "border-slate-300 dark:border-slate-600 hover:border-emerald-400 dark:hover:border-emerald-500"
												}`}
											>
												<div className="flex items-center gap-1">
													<Percent className="w-4 h-4" />
													{percentage}%
												</div>
												<div className="text-sm font-medium">
													${Number.parseFloat(tipAmount).toFixed(2)}
												</div>
											</Button>
										</motion.div>
									);
								})}
							</div>
						</motion.div>

						{/* Custom Tip Section */}
						<motion.div
							variants={itemVariants}
							className="mb-8"
						>
							<h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4 text-center">
								Custom Amount
							</h3>
							<div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
								<div className="flex gap-2 items-center">
									<DollarSign className="w-6 h-6 text-slate-500 dark:text-slate-400" />
									<Input
										type="number"
										placeholder="Enter tip amount"
										value={customTip}
										onChange={(e) => setCustomTip(e.target.value)}
										className="w-48 text-center text-xl font-semibold border-slate-300 dark:border-slate-600 h-14"
										min="0"
										step="0.01"
									/>
									<Button
										onClick={handleCustomTipSubmit}
										disabled={!customTip}
										className="bg-gradient-to-r from-emerald-500 to-blue-600 hover:from-emerald-600 hover:to-blue-700 h-14 px-6"
									>
										Add Tip
									</Button>
								</div>
							</div>
						</motion.div>

						{/* No Tip Option */}
						<motion.div
							variants={itemVariants}
							className="text-center mb-6"
						>
							<Button
								onClick={() => handleTipSelect(0)}
								variant="ghost"
								className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
							>
								No tip, thanks
							</Button>
						</motion.div>

						{/* Appreciation Message */}
						<motion.div
							variants={itemVariants}
							className="text-center mt-8"
						>
							<motion.div
								animate={{
									scale: [1, 1.02, 1],
									opacity: [0.8, 1, 0.8],
								}}
								transition={{
									duration: 3,
									repeat: Number.POSITIVE_INFINITY,
									ease: "easeInOut",
								}}
								className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm font-medium"
							>
								<Coffee className="w-4 h-4" />
								Every tip helps our team provide better service
							</motion.div>
						</motion.div>
					</CardContent>
				</Card>
			</motion.div>
		</div>
	);
};

export default TipSelectionView;
