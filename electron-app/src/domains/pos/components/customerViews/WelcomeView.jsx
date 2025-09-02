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
		<div className="relative w-full h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#faf5ef] via-[#f3e1ca] to-[#d1c7bc] dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 overflow-hidden p-4">
			{/* Background Pattern - Responsive */}
			<div className="absolute inset-0 opacity-5">
				<div className="absolute top-[10%] left-[10%] w-[10vw] h-[10vw] max-w-32 max-h-32 bg-[#909373] rounded-full blur-3xl"></div>
				<div className="absolute bottom-[10%] right-[10%] w-[12vw] h-[12vw] max-w-40 max-h-40 bg-[#a0522d] rounded-full blur-3xl"></div>
				<div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[15vw] h-[15vw] max-w-60 max-h-60 bg-[#5e6650] rounded-full blur-3xl"></div>
			</div>

			{/* Floating Icons - Responsive positioning */}
			<motion.div
				className="absolute top-[15%] left-[15%] hidden lg:block"
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
				<Coffee className="w-6 h-6 lg:w-8 lg:h-8 text-[#5e6650] opacity-40" />
			</motion.div>

			<motion.div
				className="absolute top-[20%] right-[15%] hidden lg:block"
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
				<ShoppingBag className="w-8 h-8 lg:w-10 lg:h-10 text-[#a0522d] opacity-40" />
			</motion.div>

			<motion.div
				className="absolute bottom-[20%] left-[15%] hidden lg:block"
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
				<Heart className="w-5 h-5 lg:w-6 lg:h-6 text-[#909373] opacity-40" />
			</motion.div>

			{/* Main Content */}
			<motion.div
				initial={{ opacity: 0, y: 30 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.8, ease: "easeOut" }}
				className="text-center z-10 max-w-4xl w-full h-full flex flex-col justify-center py-8"
			>
				{/* Logo/Brand Area */}
				<motion.div
					initial={{ scale: 0.8, opacity: 0 }}
					animate={{ scale: 1, opacity: 1 }}
					transition={{ duration: 0.6, delay: 0.2 }}
					className="mb-6 flex-shrink-0"
				>
					{/* Ajeen Logo */}
					<motion.div
						className="mx-auto mb-3 flex justify-center items-center"
						animate={{
							y: [0, -5, 0],
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
							className="w-auto h-20 sm:h-24 md:h-32 lg:h-40 xl:h-48 2xl:h-56 max-w-[80vw] max-h-[20vh] object-contain"
						/>
					</motion.div>

					<motion.p
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.6, delay: 0.8 }}
						className="text-sm sm:text-base lg:text-lg text-[#5e6650] dark:text-[#909373] font-medium mb-3"
					>
						Fresh • Authentic • Delicious
					</motion.p>

					<motion.div
						initial={{ width: 0 }}
						animate={{ width: "100%" }}
						transition={{ duration: 1, delay: 0.5 }}
						className="h-1 bg-gradient-to-r from-[#909373] via-[#a0522d] to-[#5e6650] rounded-full mx-auto max-w-xs sm:max-w-md"
					/>
				</motion.div>

				{/* Welcome Message */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, delay: 0.4 }}
					className="mb-8 flex-grow flex flex-col justify-center"
				>
					<p className="text-lg sm:text-xl lg:text-2xl xl:text-3xl text-[#5e6650] dark:text-slate-300 font-bold leading-relaxed px-2 mb-2">
						Welcome to your fresh food experience
					</p>
					<p className="text-sm sm:text-base lg:text-lg xl:text-xl text-[#654321] dark:text-slate-400 px-2">
						Our team is ready to serve you!!
					</p>
				</motion.div>

				{/* Time and Date Display */}
				<motion.div
					initial={{ opacity: 0, scale: 0.9 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: 0.6, delay: 0.6 }}
					className="bg-[#faf5ef]/90 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl p-3 sm:p-4 lg:p-6 shadow-xl border border-[#d1c7bc]/50 dark:border-slate-700/50 mb-4 flex-shrink-0"
				>
					<div className="text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-bold text-[#5e6650] dark:text-[#909373] mb-1 font-mono">
						{formatTime(currentTime)}
					</div>
					<div className="text-xs sm:text-sm lg:text-base text-[#a0522d] dark:text-[#a0522d] font-medium">
						{formatDate(currentTime)}
					</div>
				</motion.div>

				{/* Subtle Call to Action */}
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.8, delay: 1 }}
					className="flex-shrink-0"
				>
					<motion.div
						animate={{
							scale: [1, 1.02, 1],
							opacity: [0.7, 1, 0.7],
						}}
						transition={{
							duration: 2,
							repeat: Number.POSITIVE_INFINITY,
							ease: "easeInOut",
						}}
						className="inline-flex items-center gap-2 text-[#5e6650] dark:text-[#909373] text-xs sm:text-sm font-medium px-2"
					>
						<div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-[#909373] rounded-full animate-pulse"></div>
						Fresh food, prepared with care
					</motion.div>
				</motion.div>
			</motion.div>
		</div>
	);
};

export default WelcomeView;
