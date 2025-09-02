import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/shared/components/ui/button";
import { X, Delete } from "lucide-react";

const TouchNumberPad = ({ isOpen, onNumberPress, onBackspace, onClear, onClose, currencyMode = true, className = "", currentValue = "0.00" }) => {
	const numbers = [
		["1", "2", "3"],
		["4", "5", "6"],
		["7", "8", "9"],
		[currencyMode ? "00" : ".", "0", "⌫"] // Replace decimal with "00" in currency mode
	];

	const handlePress = (value) => {
		if (value === "⌫") {
			onBackspace?.();
		} else if (value === "C") {
			onClear?.();
		} else {
			// Pass the value directly to the input handler (including "00")
			onNumberPress?.(value);
		}
	};

	return (
		<AnimatePresence>
			{isOpen && (
				<motion.div
					initial={{ opacity: 0, y: 20, scale: 0.95 }}
					animate={{ opacity: 1, y: 0, scale: 1 }}
					exit={{ opacity: 0, y: 20, scale: 0.95 }}
					transition={{ duration: 0.2, ease: "easeOut" }}
					className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-4 w-80 max-w-[90vw] ${className}`}
				>
					{/* Header with current value display */}
					<div className="mb-4">
						<div className="flex justify-between items-start mb-2">
							<div className="text-sm font-medium text-slate-600 dark:text-slate-400">
								Tip Amount
							</div>
							<Button
								variant="ghost"
								size="sm"
								onClick={onClose}
								className="h-8 w-8 p-0 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
							>
								<X className="w-4 h-4" />
							</Button>
						</div>
						<div className="text-center p-3 bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600">
							<div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono">
								${currentValue || "0.00"}
							</div>
						</div>
					</div>

					{/* Number pad grid */}
					<div className="grid grid-cols-3 gap-3">
						{numbers.flat().map((num, index) => (
							<motion.div
								key={`${num}-${index}`}
								whileHover={{ scale: 1.05 }}
								whileTap={{ scale: 0.95 }}
							>
								<Button
									onClick={() => handlePress(num)}
									variant="outline"
									className={`h-14 w-full text-xl font-semibold transition-all duration-150 touch-manipulation ${
										num === "⌫"
											? "bg-red-50 hover:bg-red-100 border-red-200 text-red-600 dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:border-red-800 dark:text-red-400"
											: "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 dark:border-slate-600 dark:text-slate-100"
									}`}
								>
									{num === "⌫" ? <Delete className="w-5 h-5" /> : num}
								</Button>
							</motion.div>
						))}
					</div>

					{/* Clear button */}
					<motion.div
						className="mt-3"
						whileHover={{ scale: 1.02 }}
						whileTap={{ scale: 0.98 }}
					>
						<Button
							onClick={onClear}
							variant="outline"
							className="w-full h-12 text-lg font-semibold bg-orange-50 hover:bg-orange-100 border-orange-200 text-orange-600 dark:bg-orange-900/20 dark:hover:bg-orange-900/30 dark:border-orange-800 dark:text-orange-400 touch-manipulation"
						>
							Clear
						</Button>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);
};

export default TouchNumberPad;