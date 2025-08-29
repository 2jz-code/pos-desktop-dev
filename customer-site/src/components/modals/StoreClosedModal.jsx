import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Store, Clock, Calendar, X } from "lucide-react";
import { useStoreStatus } from "@/contexts/StoreStatusContext";
import { useWeeklySchedule } from "@/hooks/useSettings";
import { formatTime, getDayName } from "@/hooks/useSettings";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const StoreClosedModal = ({ isOpen, onClose, onContinueBrowsing, onSetReminder }) => {
	const storeStatus = useStoreStatus();
	const { data: weeklySchedule, isLoading: scheduleLoading } = useWeeklySchedule();

	return (
		<AnimatePresence>
			{isOpen && (
				<>
					{/* Backdrop */}
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.2 }}
						className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
						onClick={onClose}
					>
						{/* Modal */}
						<motion.div
							initial={{ scale: 0.95, opacity: 0 }}
							animate={{ scale: 1, opacity: 1 }}
							exit={{ scale: 0.95, opacity: 0 }}
							transition={{ duration: 0.2 }}
							className="w-full max-w-md"
							onClick={(e) => e.stopPropagation()}
						>
							<Card className="relative bg-white shadow-2xl">
								{/* Close Button */}
								<button
									onClick={onClose}
									className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors z-10"
									aria-label="Close modal"
								>
									<X className="h-5 w-5" />
								</button>

								<CardHeader className="text-center pb-4">
									{/* Store Icon */}
									<div className="mx-auto mb-4 p-3 bg-red-100 rounded-full w-16 h-16 flex items-center justify-center">
										<Store className="h-8 w-8 text-red-600" />
									</div>

									{/* Title */}
									<h2 className="text-2xl font-bold text-gray-900 mb-2">
										We're Currently Closed
									</h2>
									<p className="text-gray-600">
										Sorry, we're not taking orders right now.
									</p>
								</CardHeader>

								<CardContent className="space-y-6">
									{/* Next Opening Time */}
									{storeStatus.getNextOpeningDisplay() && (
										<div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
											<div className="flex items-center justify-center mb-2">
												<Clock className="h-5 w-5 text-green-600 mr-2" />
												<span className="font-semibold text-green-800">Next Opening</span>
											</div>
											<p className="text-lg font-bold text-green-700">
												{storeStatus.getNextOpeningDisplay()}
											</p>
										</div>
									)}

									{/* Today's Schedule or Weekly Schedule */}
									<div className="space-y-3">
										<div className="flex items-center">
											<Calendar className="h-5 w-5 text-gray-600 mr-2" />
											<span className="font-semibold text-gray-800">Store Hours</span>
										</div>

										{scheduleLoading ? (
											<div className="space-y-2">
												{[...Array(3)].map((_, index) => (
													<div key={index} className="h-4 bg-gray-200 rounded animate-pulse"></div>
												))}
											</div>
										) : weeklySchedule?.regular_hours ? (
											<div className="bg-gray-50 rounded-lg p-4">
												<div className="space-y-2 text-sm">
													{weeklySchedule.regular_hours.slice(0, 7).map((dayHours) => (
														<div key={dayHours.day_of_week} className="flex justify-between">
															<span className="text-gray-600 font-medium">
																{getDayName(dayHours.day_of_week)}
															</span>
															<span className="text-gray-800">
																{dayHours.time_slots && dayHours.time_slots.length > 0
																	? dayHours.time_slots.map((slot, index) => (
																		<span key={index}>
																			{formatTime(slot.open_time)} - {formatTime(slot.close_time)}
																			{index < dayHours.time_slots.length - 1 && ", "}
																		</span>
																	))
																	: "Closed"
																}
															</span>
														</div>
													))}
												</div>
											</div>
										) : (
											<p className="text-gray-600 text-sm">
												Hours information not available
											</p>
										)}
									</div>

									{/* Action Buttons */}
									<div className="space-y-3">
										<Button
											onClick={onContinueBrowsing}
											className="w-full bg-primary-green hover:bg-accent-dark-green text-white py-3"
										>
											Continue Browsing Menu
										</Button>

										{/* Optional Set Reminder Button */}
										{onSetReminder && storeStatus.getNextOpeningDisplay() && (
											<Button
												onClick={onSetReminder}
												variant="outline"
												className="w-full py-3 text-gray-700 border-gray-300 hover:bg-gray-50"
											>
												Set Reminder for Opening
											</Button>
										)}
									</div>

									{/* Contact Info */}
									<div className="text-center pt-4 border-t border-gray-200">
										<p className="text-sm text-gray-600">
											Questions? Contact us at{" "}
											<a 
												href="tel:+16514125336" 
												className="text-primary-green hover:underline font-medium"
											>
												(651) 412-5336
											</a>
										</p>
									</div>
								</CardContent>
							</Card>
						</motion.div>
					</motion.div>
				</>
			)}
		</AnimatePresence>
	);
};

export default StoreClosedModal;