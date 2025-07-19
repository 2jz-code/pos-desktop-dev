import { useState, useEffect } from "react";
import { motion } from "framer-motion"; // eslint-disable-line
import { Sparkles, Coffee, ShoppingBag, Heart } from "lucide-react";
import Logo from "@/assets/images/logo.png";

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
		<div className="relative w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#faf5ef] via-[#f3e1ca] to-[#d1c7bc] dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 overflow-hidden">
			{/* Background Pattern */}
			<div className="absolute inset-0 opacity-5">
				<div className="absolute top-20 left-20 w-32 h-32 bg-[#909373] rounded-full blur-3xl"></div>
				<div className="absolute bottom-20 right-20 w-40 h-40 bg-[#a0522d] rounded-full blur-3xl"></div>
				<div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-60 h-60 bg-[#5e6650] rounded-full blur-3xl"></div>
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
				<Coffee className="w-8 h-8 text-[#5e6650] opacity-40" />
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
				<ShoppingBag className="w-10 h-10 text-[#a0522d] opacity-40" />
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
				<Heart className="w-6 h-6 text-[#909373] opacity-40" />
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
					{/* Ajeen Logo */}
					<motion.div
						className="mx-auto mb-8"
						animate={{
							y: [0, -10, 0],
						}}
						transition={{
							duration: 3,
							repeat: Number.POSITIVE_INFINITY,
							ease: "easeInOut",
						}}
					>
						<img
							src={Logo}
							alt="Ajeen Logo"
							className="w-auto h-auto object-contain mx-auto"
						/>
					</motion.div>

					<motion.p
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.6, delay: 0.8 }}
						className="text-lg text-[#5e6650] dark:text-[#909373] font-medium mb-6"
					>
						Fresh • Authentic • Delicious
					</motion.p>

					<motion.div
						initial={{ width: 0 }}
						animate={{ width: "100%" }}
						transition={{ duration: 1, delay: 0.5 }}
						className="h-1 bg-gradient-to-r from-[#909373] via-[#a0522d] to-[#5e6650] rounded-full mx-auto max-w-md"
					/>
				</motion.div>

				{/* Welcome Message */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, delay: 0.4 }}
					className="mb-16"
				>
					<p className="text-3xl text-[#5e6650] dark:text-slate-300 font-bold leading-relaxed">
						Welcome to your fresh food experience
					</p>
					<p className="text-xl text-[#654321] dark:text-slate-400 mt-4 ">
						Our team is ready to serve you!!
					</p>
				</motion.div>

				{/* Time and Date Display */}
				<motion.div
					initial={{ opacity: 0, scale: 0.9 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: 0.6, delay: 0.6 }}
					className="bg-[#faf5ef]/90 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-[#d1c7bc]/50 dark:border-slate-700/50"
				>
					<div className="text-5xl font-bold text-[#5e6650] dark:text-[#909373] mb-2 font-mono">
						{formatTime(currentTime)}
					</div>
					<div className="text-lg text-[#a0522d] dark:text-[#a0522d] font-medium">
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
						className="inline-flex items-center gap-2 text-[#5e6650] dark:text-[#909373] text-sm font-medium"
					>
						<div className="w-2 h-2 bg-[#909373] rounded-full animate-pulse"></div>
						Fresh food, prepared with care
					</motion.div>
				</motion.div>
			</motion.div>
		</div>
	);
};

export default WelcomeView;
