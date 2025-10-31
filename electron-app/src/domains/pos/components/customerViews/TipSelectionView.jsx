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
		<div className="w-full h-screen bg-gradient-to-br from-[#faf5ef] via-[#f3e1ca] to-[#d1c7bc] dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-4 sm:p-6">
			<motion.div
				variants={containerVariants}
				initial="hidden"
				animate="visible"
				className="w-full h-full flex flex-col"
			>
				{/* Header */}
				<div className="text-center pb-4 sm:pb-6 border-b border-[#d1c7bc] dark:border-slate-700 flex-shrink-0">
					<motion.div
						initial={{ scale: 0.8, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						transition={{ duration: 0.5, delay: 0.2 }}
						className="flex items-center justify-center gap-2 sm:gap-3 mb-3 sm:mb-4"
					>
						<div className="p-2 sm:p-3 bg-gradient-to-br from-[#909373] to-[#5e6650] rounded-xl sm:rounded-2xl">
							<Heart className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
						</div>
						<h1 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold text-[#5e6650] dark:text-slate-100">
							Add a Tip?
						</h1>
					</motion.div>

					<motion.p
						variants={itemVariants}
						className="text-sm sm:text-base lg:text-lg xl:text-xl text-[#654321] dark:text-slate-300 font-light mb-2"
					>
						Your support means the world to us
					</motion.p>

					{/* Appreciation Message */}
					<motion.div
						variants={itemVariants}
						className="text-center mb-3 sm:mb-4"
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
							className="inline-flex items-center gap-2 sm:gap-3 text-[#5e6650] dark:text-slate-400 text-sm sm:text-base lg:text-lg font-semibold"
						>
							<Coffee className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-[#a0522d]" />
							Every tip helps our team provide better service
						</motion.div>
					</motion.div>

					{/* Order Total Display */}
					<motion.div
						variants={itemVariants}
						className="p-2 sm:p-3 bg-[#f3e1ca]/50 dark:bg-slate-800 rounded-lg sm:rounded-xl"
					>
						<div className="flex items-center justify-center gap-2 text-[#a0522d] dark:text-slate-400 mb-1">
							<DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />
							<span className="text-sm sm:text-base lg:text-lg font-medium">Order Total</span>
						</div>
						<div className="text-xl sm:text-2xl lg:text-3xl font-bold text-[#5e6650] dark:text-slate-100">
							${Number.parseFloat(amountDue).toFixed(2)}
						</div>
					</motion.div>
				</div>

				<div className="p-3 sm:p-4 lg:p-6 flex-1 flex flex-col justify-center min-h-0">
						{/* Quick Tip Buttons */}
						<motion.div
							variants={itemVariants}
							className="mb-4 sm:mb-6"
						>
							<h3 className="text-lg sm:text-xl font-semibold text-[#5e6650] dark:text-slate-100 mb-3 sm:mb-4 text-center">
								Quick Select
							</h3>
							<div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
								{tipPercentages.map((percentage) => {
									const tipAmount = calculateTipAmount(percentage);
									const isSelected = selectedTip === tipAmount;

									return (
										<motion.div
											key={percentage}
											whileHover={{ scale: 1.02 }}
											whileTap={{ scale: 0.98 }}
										>
											<Button
												onClick={() => handleTipSelect(tipAmount)}
												variant={isSelected ? "default" : "outline"}
												className={`w-full h-16 sm:h-18 lg:h-20 flex flex-col gap-1 text-base sm:text-lg font-semibold transition-all duration-200 ${
													isSelected
														? "bg-gradient-to-br from-[#909373] to-[#5e6650] text-white shadow-lg border-transparent"
														: "bg-[#f3e1ca] dark:bg-slate-800 text-[#5e6650] dark:text-slate-100 border-2 border-[#d1c7bc] dark:border-slate-600 hover:bg-[#e8d4b8] hover:text-[#5e6650] hover:border-[#909373] dark:hover:border-[#909373] hover:shadow-md"
												}`}
											>
												<div className="flex items-center gap-1">
													{percentage}%
												</div>
												<div className="text-xs sm:text-sm font-medium">
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
							className="mb-4 sm:mb-6"
						>
							<h3 className="text-lg sm:text-xl font-semibold text-[#5e6650] dark:text-slate-100 mb-3 sm:mb-4 text-center">
								Custom Amount
							</h3>
							<div className="flex flex-col gap-3 sm:gap-4 items-center justify-center">
								<div className="flex gap-3 sm:gap-4 items-center justify-center -ml-6 sm:-ml-8 lg:-ml-10">
									<DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-[#a0522d] dark:text-slate-400" />
									<div className="w-32 sm:w-40 lg:w-48">
										<TouchNumberInput
											placeholder="0.00"
											value={customTip}
											onChange={setCustomTip}
											className="w-full text-center text-lg sm:text-xl lg:text-2xl font-semibold border-[#d1c7bc] dark:border-slate-600 h-12 sm:h-14 lg:h-16 text-[#5e6650] dark:text-slate-100"
										/>
									</div>
									<Button
										onClick={handleCustomTipSubmit}
										disabled={
											!customTip || customTip === "0" || customTip === "0."
										}
										className="bg-gradient-to-r from-[#909373] to-[#5e6650] hover:from-[#5e6650] hover:to-[#a0522d] h-12 sm:h-14 lg:h-16 px-3 sm:px-4 lg:px-6 text-xs sm:text-sm lg:text-base font-semibold min-w-[140px] sm:min-w-[160px] lg:min-w-[180px] transition-all duration-200 disabled:opacity-50"
									>
										Add ${customTip || "0.00"} Tip
									</Button>
								</div>

								{/* No Tip Option */}
								<Button
									onClick={() => handleTipSelect(0)}
									variant="ghost"
									className="text-[#a0522d] dark:text-slate-400 hover:text-[#5e6650] dark:hover:text-slate-200 text-sm sm:text-base"
								>
									No tip, thanks
								</Button>
							</div>
						</motion.div>

				</div>
			</motion.div>
		</div>
	);
};

export default TipSelectionView;
