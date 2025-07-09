import { motion } from "framer-motion"; // eslint-disable-line
import { Card, CardContent } from "@/shared/components/ui/card";
import { CreditCard, Loader2, Shield, CheckCircle2 } from "lucide-react";

const PaymentProcessingView = ({ status = "Processing your payment..." }) => {
	const steps = [
		{ icon: CreditCard, label: "Reading card", completed: true },
		{ icon: Shield, label: "Securing transaction", completed: true },
		{ icon: CheckCircle2, label: "Finalizing payment", completed: false },
	];

	return (
		<div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-8">
			<motion.div
				initial={{ opacity: 0, scale: 0.9 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: 0.6 }}
				className="w-full max-w-2xl"
			>
				<Card className="border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-2xl">
					<CardContent className="p-12 text-center">
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
									className="w-32 h-32 mx-auto mb-6 border-4 border-blue-200 dark:border-blue-800 border-t-blue-500 dark:border-t-blue-400 rounded-full"
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
									className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 -mt-3"
								>
									<div className="p-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full">
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
							className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-4"
						>
							Processing Payment
						</motion.h2>

						{/* Status Message */}
						<motion.p
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6, delay: 0.4 }}
							className="text-xl text-slate-600 dark:text-slate-300 mb-8 font-light"
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
												? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800"
												: "bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
										}`}
									>
										<div
											className={`p-2 rounded-lg ${
												step.completed ? "bg-emerald-500" : "bg-slate-400"
											}`}
										>
											<IconComponent className="w-5 h-5 text-white" />
										</div>
										<span
											className={`font-medium ${
												step.completed
													? "text-emerald-800 dark:text-emerald-200"
													: "text-slate-600 dark:text-slate-400"
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
												<CheckCircle2 className="w-5 h-5 text-emerald-500" />
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
												<Loader2 className="w-5 h-5 text-slate-400" />
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
								className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm font-medium"
							>
								<Shield className="w-4 h-4" />
								Your payment is secure and encrypted
							</motion.div>
						</motion.div>
					</CardContent>
				</Card>
			</motion.div>
		</div>
	);
};

export default PaymentProcessingView;
