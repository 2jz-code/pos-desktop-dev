import { useEffect, useState } from "react";
import { motion } from "framer-motion"; // eslint-disable-line
import { CheckCircle, Sparkles, Heart, Star, Gift } from "lucide-react";

const PaymentSuccessView = () => {
	const [showConfetti, setShowConfetti] = useState(false);

	useEffect(() => {
		setShowConfetti(true);
		const timer = setTimeout(() => setShowConfetti(false), 3000);
		return () => clearTimeout(timer);
	}, []);

	const confettiPieces = Array.from({ length: 50 }, (_, i) => i);

	return (
		<div className="relative w-full h-full bg-gradient-to-br from-[#faf5ef] via-[#f3e1ca] to-[#d1c7bc] dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-8 overflow-hidden">
			{/* Confetti Animation */}
			{showConfetti && (
				<div className="absolute inset-0 pointer-events-none">
					{confettiPieces.map((i) => (
						<motion.div
							key={i}
							initial={{
								y: -100,
								x: Math.random() * window.innerWidth,
								rotate: 0,
								opacity: 1,
							}}
							animate={{
								y: window.innerHeight + 100,
								rotate: 360,
								opacity: 0,
							}}
							transition={{
								duration: Math.random() * 2 + 2,
								delay: Math.random() * 2,
								ease: "easeOut",
							}}
							className={`absolute w-3 h-3 ${
								Math.random() > 0.5
									? "bg-[#909373]"
									: Math.random() > 0.5
									? "bg-[#a0522d]"
									: "bg-[#5e6650]"
							} rounded-full`}
						/>
					))}
				</div>
			)}

			<motion.div
				initial={{ opacity: 0, scale: 0.8 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: 0.8, ease: "easeOut" }}
				className="w-full h-full z-10 p-12 text-center flex flex-col justify-center"
			>
						{/* Success Icon with Animation */}
						<motion.div
							initial={{ scale: 0 }}
							animate={{ scale: 1 }}
							transition={{
								duration: 0.6,
								delay: 0.2,
								type: "spring",
								stiffness: 200,
							}}
							className="relative mb-8"
						>
							{/* Outer Glow Ring */}
							<motion.div
								animate={{
									scale: [1, 1.2, 1],
									opacity: [0.3, 0.6, 0.3],
								}}
								transition={{
									duration: 2,
									repeat: Number.POSITIVE_INFINITY,
									ease: "easeInOut",
								}}
								className="absolute inset-0 w-32 h-32 mx-auto bg-[#909373] rounded-full blur-xl"
							/>

							{/* Main Success Icon */}
							<div className="relative w-32 h-32 mx-auto bg-gradient-to-br from-[#909373] to-[#5e6650] rounded-full flex items-center justify-center shadow-2xl">
								<CheckCircle className="w-16 h-16 text-white" />
							</div>

							{/* Floating Sparkles */}
							<motion.div
								animate={{
									rotate: 360,
									scale: [1, 1.1, 1],
								}}
								transition={{
									duration: 4,
									repeat: Number.POSITIVE_INFINITY,
									ease: "linear",
								}}
								className="absolute -top-2 -right-2"
							>
								<Sparkles className="w-8 h-8 text-[#a0522d]" />
							</motion.div>

							<motion.div
								animate={{
									rotate: -360,
									scale: [1, 1.2, 1],
								}}
								transition={{
									duration: 3,
									repeat: Number.POSITIVE_INFINITY,
									ease: "linear",
									delay: 1,
								}}
								className="absolute -bottom-2 -left-2"
							>
								<Star className="w-6 h-6 text-[#909373]" />
							</motion.div>
						</motion.div>

						{/* Success Message */}
						<motion.div
							initial={{ opacity: 0, y: 30 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6, delay: 0.4 }}
							className="mb-8"
						>
							<h2 className="text-5xl font-bold text-[#5e6650] dark:text-slate-100 mb-4">
								Thank You!
							</h2>
							<p className="text-2xl text-[#654321] dark:text-slate-300 font-light">
								Your payment was successful
							</p>
						</motion.div>

						{/* Success Details */}
						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6, delay: 0.6 }}
							className="space-y-4 mb-8"
						>
							<div className="flex items-center justify-center gap-3 p-4 bg-[#f3e1ca]/50 dark:bg-[#909373]/20 rounded-xl border border-[#a0522d]/30 dark:border-[#909373]">
								<CheckCircle className="w-5 h-5 text-[#5e6650] dark:text-[#909373]" />
								<span className="text-[#5e6650] dark:text-[#909373] font-medium">
									Payment processed successfully
								</span>
							</div>

							<div className="flex items-center justify-center gap-3 p-4 bg-[#faf5ef]/50 dark:bg-slate-800/50 rounded-xl border border-[#d1c7bc] dark:border-slate-700">
								<Gift className="w-5 h-5 text-[#a0522d] dark:text-slate-400" />
								<span className="text-[#a0522d] dark:text-slate-400 font-medium">
									Receipt will be sent shortly
								</span>
							</div>
						</motion.div>

						{/* Appreciation Message */}
						<motion.div
							initial={{ opacity: 0, scale: 0.9 }}
							animate={{ opacity: 1, scale: 1 }}
							transition={{ duration: 0.6, delay: 0.8 }}
							className="p-6 bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-700 rounded-2xl border border-slate-200 dark:border-slate-600"
						>
							<div className="flex items-center justify-center gap-2 mb-3">
								<Heart className="w-6 h-6 text-rose-500" />
								<span className="text-xl font-semibold text-slate-900 dark:text-slate-100">
									We appreciate your business!
								</span>
							</div>
							<p className="text-slate-600 dark:text-slate-300 font-light">
								Thank you for choosing us. Have a wonderful day!
							</p>
						</motion.div>

						{/* Auto-dismiss indicator */}
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							transition={{ duration: 0.8, delay: 1.2 }}
							className="mt-8"
						>
							<motion.div
								animate={{
									scale: [1, 1.05, 1],
									opacity: [0.6, 1, 0.6],
								}}
								transition={{
									duration: 2,
									repeat: Number.POSITIVE_INFINITY,
									ease: "easeInOut",
								}}
								className="text-slate-400 dark:text-slate-500 text-sm font-medium"
							>
								This screen will return to welcome shortly
							</motion.div>
						</motion.div>
			</motion.div>
		</div>
	);
};

export default PaymentSuccessView;
