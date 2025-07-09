import { useState, useEffect } from "react";
import { motion } from "framer-motion"; // eslint-disable-line
import { Sparkles, Coffee, ShoppingBag, Heart } from "lucide-react";

const WelcomeView = () => {
	const [currentTime, setCurrentTime] = useState(new Date());

	useEffect(() => {
		const timer = setInterval(() => {
			setCurrentTime(new Date());
		}, 1000);
		return () => clearInterval(timer);
	}, []);

	const formatTime = (date) => {
		return date.toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
			hour12: true,
		});
	};

	const formatDate = (date) => {
		return date.toLocaleDateString([], {
			weekday: "long",
			month: "long",
			day: "numeric",
		});
	};

	return (
		<div className="relative w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 overflow-hidden">
			{/* Background Pattern */}
			<div className="absolute inset-0 opacity-5">
				<div className="absolute top-20 left-20 w-32 h-32 bg-blue-500 rounded-full blur-3xl"></div>
				<div className="absolute bottom-20 right-20 w-40 h-40 bg-purple-500 rounded-full blur-3xl"></div>
				<div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-60 h-60 bg-emerald-500 rounded-full blur-3xl"></div>
			</div>

			{/* Floating Icons */}
			<motion.div
				className="absolute top-32 left-32"
				animate={{
					y: [0, -20, 0],
					rotate: [0, 5, 0],
				}}
				transition={{
					duration: 4,
					repeat: Number.POSITIVE_INFINITY,
					ease: "easeInOut",
				}}
			>
				<Coffee className="w-8 h-8 text-amber-400 opacity-30" />
			</motion.div>

			<motion.div
				className="absolute top-40 right-40"
				animate={{
					y: [0, -15, 0],
					rotate: [0, -5, 0],
				}}
				transition={{
					duration: 3,
					repeat: Number.POSITIVE_INFINITY,
					ease: "easeInOut",
					delay: 1,
				}}
			>
				<ShoppingBag className="w-10 h-10 text-blue-400 opacity-30" />
			</motion.div>

			<motion.div
				className="absolute bottom-40 left-40"
				animate={{
					y: [0, -25, 0],
					rotate: [0, 10, 0],
				}}
				transition={{
					duration: 5,
					repeat: Number.POSITIVE_INFINITY,
					ease: "easeInOut",
					delay: 2,
				}}
			>
				<Heart className="w-6 h-6 text-rose-400 opacity-30" />
			</motion.div>

			{/* Main Content */}
			<motion.div
				initial={{ opacity: 0, y: 30 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.8, ease: "easeOut" }}
				className="text-center z-10 max-w-4xl px-8"
			>
				{/* Logo/Brand Area */}
				<motion.div
					initial={{ scale: 0.8, opacity: 0 }}
					animate={{ scale: 1, opacity: 1 }}
					transition={{ duration: 0.6, delay: 0.2 }}
					className="mb-12"
				>
					{/* Replace with your actual logo */}
					<div className="w-32 h-32 mx-auto mb-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl flex items-center justify-center shadow-2xl">
						<Sparkles className="w-16 h-16 text-white" />
					</div>

					<motion.h1
						className="text-7xl font-bold bg-gradient-to-r from-slate-800 via-slate-600 to-slate-800 dark:from-slate-100 dark:via-slate-300 dark:to-slate-100 bg-clip-text text-transparent mb-4"
						animate={{
							backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
						}}
						transition={{
							duration: 3,
							repeat: Number.POSITIVE_INFINITY,
							ease: "linear",
						}}
					>
						Welcome
					</motion.h1>

					<motion.div
						initial={{ width: 0 }}
						animate={{ width: "100%" }}
						transition={{ duration: 1, delay: 0.5 }}
						className="h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 rounded-full mx-auto max-w-md"
					/>
				</motion.div>

				{/* Welcome Message */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, delay: 0.4 }}
					className="mb-16"
				>
					<p className="text-3xl text-slate-600 dark:text-slate-300 font-light leading-relaxed">
						Thank you for choosing us today
					</p>
					<p className="text-xl text-slate-500 dark:text-slate-400 mt-4 font-light">
						Please see our cashier to begin your order
					</p>
				</motion.div>

				{/* Time and Date Display */}
				<motion.div
					initial={{ opacity: 0, scale: 0.9 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: 0.6, delay: 0.6 }}
					className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-slate-200/50 dark:border-slate-700/50"
				>
					<div className="text-5xl font-bold text-slate-800 dark:text-slate-100 mb-2 font-mono">
						{formatTime(currentTime)}
					</div>
					<div className="text-lg text-slate-500 dark:text-slate-400 font-medium">
						{formatDate(currentTime)}
					</div>
				</motion.div>

				{/* Subtle Call to Action */}
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.8, delay: 1 }}
					className="mt-12"
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
						className="inline-flex items-center gap-2 text-slate-400 dark:text-slate-500 text-sm font-medium"
					>
						<div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
						Ready to serve you
					</motion.div>
				</motion.div>
			</motion.div>

			{/* Bottom Branding */}
			<motion.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.6, delay: 0.8 }}
				className="absolute bottom-8 left-1/2 transform -translate-x-1/2 text-center"
			>
				<p className="text-sm text-slate-400 dark:text-slate-500 font-medium">
					Powered by Ajeen
				</p>
			</motion.div>
		</div>
	);
};

export default WelcomeView;
