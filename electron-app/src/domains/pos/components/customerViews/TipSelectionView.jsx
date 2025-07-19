import { useState } from "react";
import { motion } from "framer-motion"; // eslint-disable-line
import { Button } from "@/shared/components/ui/button";
import TouchNumberInput from "@/shared/components/ui/TouchNumberInput";
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
		if (customAmount > 0) {
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
		<div className="w-full h-full bg-gradient-to-br from-[#faf5ef] via-[#f3e1ca] to-[#d1c7bc] dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-8">
			<motion.div
				variants={containerVariants}
				initial="hidden"
				animate="visible"
				className="w-full h-full flex flex-col"
			>
				{/* Header */}
				<div className="text-center pb-8 border-b border-[#d1c7bc] dark:border-slate-700 flex-shrink-0">
					<motion.div
						initial={{ scale: 0.8, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						transition={{ duration: 0.5, delay: 0.2 }}
						className="flex items-center justify-center gap-3 mb-6"
					>
						<div className="p-4 bg-gradient-to-br from-[#909373] to-[#5e6650] rounded-3xl">
							<Heart className="w-10 h-10 text-white" />
						</div>
						<h1 className="text-5xl font-bold text-[#5e6650] dark:text-slate-100">
							Add a Tip?
						</h1>
					</motion.div>

					<motion.p
						variants={itemVariants}
						className="text-xl text-[#654321] dark:text-slate-300 font-light"
					>
						Your support means the world to us
					</motion.p>

					{/* Order Total Display */}
					<motion.div
						variants={itemVariants}
						className="mt-6 p-4 bg-[#f3e1ca]/50 dark:bg-slate-800 rounded-xl"
					>
						<div className="flex items-center justify-center gap-2 text-[#a0522d] dark:text-slate-400 mb-2">
							<DollarSign className="w-5 h-5" />
							<span className="text-lg font-medium">Order Total</span>
						</div>
						<div className="text-3xl font-bold text-[#5e6650] dark:text-slate-100">
							${Number.parseFloat(amountDue).toFixed(2)}
						</div>
					</motion.div>
				</div>

				<div className="p-8 flex-1 overflow-y-auto">
						{/* Quick Tip Buttons */}
						<motion.div
							variants={itemVariants}
							className="mb-8"
						>
							<h3 className="text-xl font-semibold text-[#5e6650] dark:text-slate-100 mb-4 text-center">
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
														? "bg-gradient-to-br from-[#909373] to-[#5e6650] text-white shadow-lg"
														: "border-[#d1c7bc] dark:border-slate-600 hover:border-[#a0522d] dark:hover:border-[#a0522d]"
												}`}
											>
												<div className="flex items-center gap-1">
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
							<h3 className="text-xl font-semibold text-[#5e6650] dark:text-slate-100 mb-4 text-center">
								Custom Amount
							</h3>
							<div className="flex flex-col gap-6 items-center justify-center">
								<div className="flex gap-3 items-center justify-center">
									<DollarSign className="w-6 h-6 text-[#a0522d] dark:text-slate-400" />
									<div className="w-64">
										<TouchNumberInput
											placeholder="0.00"
											value={customTip}
											onChange={setCustomTip}
											className="w-full text-center text-2xl font-semibold border-[#d1c7bc] dark:border-slate-600 h-16"
										/>
									</div>
									{/* Invisible spacer to balance the dollar sign */}
									<div className="w-6 h-6"></div>
								</div>
								<Button
									onClick={handleCustomTipSubmit}
									disabled={
										!customTip || customTip === "0" || customTip === "0."
									}
									className="bg-gradient-to-r from-[#909373] to-[#5e6650] hover:from-[#5e6650] hover:to-[#a0522d] h-16 px-8 text-lg font-semibold min-w-[200px] transition-all duration-200 disabled:opacity-50"
								>
									Add ${customTip || "0.00"} Tip
								</Button>

								{/* No Tip Option */}
								<Button
									onClick={() => handleTipSelect(0)}
									variant="ghost"
									className="text-[#a0522d] dark:text-slate-400 hover:text-[#5e6650] dark:hover:text-slate-200"
								>
									No tip, thanks
								</Button>
							</div>
						</motion.div>

						{/* Spacer for better layout */}
						<motion.div
							variants={itemVariants}
							className="mb-6"
						></motion.div>

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
								className="inline-flex items-center gap-2 text-[#5e6650] dark:text-slate-400 text-sm font-medium"
							>
								<Coffee className="w-4 h-4 text-[#a0522d]" />
								Every tip helps our team provide better service
							</motion.div>
						</motion.div>
				</div>
			</motion.div>
		</div>
	);
};

export default TipSelectionView;
