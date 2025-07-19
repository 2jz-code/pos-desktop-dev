import { motion } from "framer-motion"; // eslint-disable-line
import { CreditCard, Loader2, Shield, CheckCircle2 } from "lucide-react";

const PaymentProcessingView = ({ status = "Processing your payment..." }) => {
	const steps = [
		{ icon: CreditCard, label: "Reading card", completed: true },
		{ icon: Shield, label: "Securing transaction", completed: true },
		{ icon: CheckCircle2, label: "Finalizing payment", completed: false },
	];

	return (
		<div className="w-full h-full bg-gradient-to-br from-[#faf5ef] via-[#f3e1ca] to-[#d1c7bc] dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-8">
			<motion.div
				initial={{ opacity: 0, scale: 0.9 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: 0.6 }}
				className="w-full h-full p-12 text-center flex flex-col justify-center"
			>
						{/* Main Processing Animation */}
						<motion.div
							initial={{ scale: 0.8, opacity: 0 }}
							animate={{ scale: 1, opacity: 1 }}
							transition={{ duration: 0.5 }}
							className="mb-8"
						>
							<div className="relative">
								{/* Outer Ring */}
								<motion.div
									animate={{ rotate: 360 }}
									transition={{
										duration: 3,
										repeat: Number.POSITIVE_INFINITY,
										ease: "linear",
									}}
									className="w-32 h-32 mx-auto mb-6 border-4 border-[#d1c7bc] dark:border-slate-800 border-t-[#909373] dark:border-t-[#909373] rounded-full"
								/>

								{/* Inner Icon */}
								<motion.div
									animate={{
										scale: [1, 1.1, 1],
										rotate: [0, 5, -5, 0],
									}}
									transition={{
										duration: 2,
										repeat: Number.POSITIVE_INFINITY,
										ease: "easeInOut",
									}}
									className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
								>
									<div className="p-6 bg-gradient-to-br from-[#909373] to-[#5e6650] rounded-full">
										<CreditCard className="w-8 h-8 text-white" />
									</div>
								</motion.div>
							</div>
						</motion.div>

						{/* Title */}
						<motion.h2
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6, delay: 0.2 }}
							className="text-4xl font-bold text-[#5e6650] dark:text-slate-100 mb-4"
						>
							Processing Payment
						</motion.h2>

						{/* Status Message */}
						<motion.p
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6, delay: 0.4 }}
							className="text-xl text-[#654321] dark:text-slate-300 mb-8 font-light"
						>
							{status}
						</motion.p>

						{/* Progress Steps */}
						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6, delay: 0.6 }}
							className="space-y-4 mb-8"
						>
							{steps.map((step, index) => {
								const IconComponent = step.icon;
								return (
									<motion.div
										key={index}
										initial={{ opacity: 0, x: -20 }}
										animate={{ opacity: 1, x: 0 }}
										transition={{ duration: 0.4, delay: 0.8 + index * 0.2 }}
										className={`flex items-center gap-4 p-4 rounded-xl transition-all duration-300 ${
											step.completed
												? "bg-[#f3e1ca]/50 dark:bg-[#909373]/20 border border-[#a0522d]/30 dark:border-[#909373]"
												: "bg-[#faf5ef]/50 dark:bg-slate-800/50 border border-[#d1c7bc] dark:border-slate-700"
										}`}
									>
										<div
											className={`p-2 rounded-lg ${
												step.completed ? "bg-[#909373]" : "bg-[#d1c7bc]"
											}`}
										>
											<IconComponent className="w-5 h-5 text-white" />
										</div>
										<span
											className={`font-medium ${
												step.completed
													? "text-[#5e6650] dark:text-[#909373]"
													: "text-[#a0522d] dark:text-slate-400"
											}`}
										>
											{step.label}
										</span>
										{step.completed && (
											<motion.div
												initial={{ scale: 0 }}
												animate={{ scale: 1 }}
												className="ml-auto"
											>
												<CheckCircle2 className="w-5 h-5 text-[#909373]" />
											</motion.div>
										)}
										{!step.completed && (
											<motion.div
												animate={{ rotate: 360 }}
												transition={{
													duration: 1,
													repeat: Number.POSITIVE_INFINITY,
													ease: "linear",
												}}
												className="ml-auto"
											>
												<Loader2 className="w-5 h-5 text-[#a0522d]" />
											</motion.div>
										)}
									</motion.div>
								);
							})}
						</motion.div>

						{/* Security Message */}
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							transition={{ duration: 0.8, delay: 1.2 }}
							className="text-center"
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
								className="inline-flex items-center gap-2 text-[#5e6650] dark:text-slate-400 text-sm font-medium"
							>
								<Shield className="w-4 h-4" />
								Your payment is secure and encrypted
							</motion.div>
						</motion.div>
			</motion.div>
		</div>
	);
};

export default PaymentProcessingView;
