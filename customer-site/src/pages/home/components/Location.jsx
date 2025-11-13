import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
	MapPinIcon,
	PhoneIcon,
	EnvelopeIcon,
	ClockIcon,
	MapIcon,
	ArrowRightIcon,
	CheckCircleIcon,
	XCircleIcon,
} from "@heroicons/react/24/outline";
import { ShoppingBagIcon } from "@heroicons/react/24/solid";
import apiClient from "../../../api/client";
import { useWeeklySchedule, useBusinessHoursStatus } from "../../../hooks/useSettings";
import { formatTime } from "../../../hooks/useSettings";
import { useNearestLocation } from "../../../hooks/useNearestLocation";
import { formatDistance } from "../../../utils/distance";
import SingleLocationMap from "../../../components/maps/SingleLocationMap";

const Location = () => {
	const {
		displayLocation,
		nearestLocation,
		selectionRequired,
		hasGeolocation,
		permissionDenied,
		unit,
		userLocation,
	} = useNearestLocation();

	const { data: schedule, isLoading: scheduleLoading } = useWeeklySchedule();
	const { data: storeStatus } = useBusinessHoursStatus();

	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [email, setEmail] = useState("");
	const [message, setMessage] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitStatus, setSubmitStatus] = useState({ type: "", message: "" });

	// Format address for display
	const formatAddress = (location) => {
		if (!location) return "";
		const parts = [];
		if (location.address_line1) parts.push(location.address_line1);
		if (location.address_line2) parts.push(location.address_line2);
		if (location.city && location.state) {
			parts.push(`${location.city}, ${location.state} ${location.postal_code || ""}`.trim());
		}
		return parts.join(", ");
	};

	const fullAddress = displayLocation ? formatAddress(displayLocation) : "2105 Cliff Rd Suite 300, Eagan, MN, 55122";
	const phoneNumber = displayLocation?.phone || "(651) 412-5336";
	const emailAddress = displayLocation?.email || "contact@bakeajeen.com";

	const handleSubmit = async (event) => {
		event.preventDefault();
		setIsSubmitting(true);
		setSubmitStatus({ type: "", message: "" });
		const name = `${firstName} ${lastName}`.trim();
		const formData = { name, email, message };

		try {
			const response = await apiClient.post("notifications/contact/", formData);
			setSubmitStatus({
				type: "success",
				message: response.data.success || "Message sent successfully! We will get back to you soon.",
			});
			setFirstName("");
			setLastName("");
			setEmail("");
			setMessage("");
		} catch (error) {
			console.error("Error submitting contact form:", error);
			const errorMessage = error.response?.data?.error || "An error occurred. Please try again later.";
			setSubmitStatus({ type: "error", message: errorMessage });
		} finally {
			setIsSubmitting(false);
		}
	};

	// Get today's hours
	const getTodayHours = () => {
		if (!schedule?.schedule || scheduleLoading) return null;

		const today = new Date();
		const dateStr = today.toISOString().split('T')[0];
		const todaySchedule = schedule.schedule[dateStr];

		if (!todaySchedule || todaySchedule.is_closed || !todaySchedule.slots || todaySchedule.slots.length === 0) {
			return "Closed today";
		}

		const firstSlot = todaySchedule.slots[0];
		const lastSlot = todaySchedule.slots[todaySchedule.slots.length - 1];
		return `${formatTime(firstSlot.opening_time || firstSlot.open_time)} - ${formatTime(lastSlot.closing_time || lastSlot.close_time)}`;
	};

	const handleCallClick = () => {
		window.location.href = `tel:${phoneNumber.replace(/\D/g, '')}`;
	};

	const handleDirectionsClick = () => {
		if (displayLocation?.latitude && displayLocation?.longitude) {
			window.open(`https://www.google.com/maps/dir/?api=1&destination=${displayLocation.latitude},${displayLocation.longitude}`, '_blank');
		}
	};

	const handleEmailClick = () => {
		window.location.href = `mailto:${emailAddress}`;
	};

	return (
		<div id="contact" className="w-full py-20 px-4 bg-gradient-to-b from-background to-primary-beige/30">
			<div className="max-w-7xl mx-auto">
				{/* Header Section */}
				<div className="text-center mb-12">
					<span className="inline-block px-4 py-2 bg-primary-green/10 text-primary-green font-semibold tracking-wider uppercase rounded-full text-sm mb-4">
						Visit Us
					</span>
					<h2 className="text-5xl font-bold text-accent-dark-green mb-4">
						{selectionRequired && displayLocation?.name ? displayLocation.name : "Find Us"}
					</h2>
					<div className="h-1 w-32 bg-gradient-to-r from-primary-green to-accent-warm-brown mx-auto rounded-full"></div>
				</div>

				{/* Multiple Locations Banner */}
				{selectionRequired && (
					<div className="mb-8 bg-white/80 backdrop-blur-sm border-2 border-primary-green/20 rounded-2xl p-6 shadow-lg">
						<div className="flex flex-col md:flex-row items-center justify-between gap-4">
							<div className="flex items-center space-x-4">
								<div className="bg-primary-green/10 p-3 rounded-full">
									<MapIcon className="w-6 h-6 text-primary-green" />
								</div>
								<div className="text-left">
									<p className="font-bold text-accent-dark-green text-lg">
										Showing nearest location
									</p>
									{hasGeolocation && nearestLocation?.distance && (
										<p className="text-sm text-accent-dark-brown">
											📍 {formatDistance(nearestLocation.distance, unit)} from your location
										</p>
									)}
									{permissionDenied && (
										<p className="text-xs text-accent-subtle-gray">
											Enable location access for accurate distance calculation
										</p>
									)}
								</div>
							</div>
							<Link
								to="/locations"
								className="inline-flex items-center space-x-2 px-6 py-3 bg-primary-green text-white rounded-full hover:bg-accent-warm-brown transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 font-medium"
							>
								<span>View All Locations</span>
								<ArrowRightIcon className="w-5 h-5" />
							</Link>
						</div>
					</div>
				)}

				{/* Main Content Grid */}
				<div className="grid lg:grid-cols-2 gap-12 mb-16">
					{/* Left Column - Location Info */}
					<div className="space-y-6">
						{/* Featured Location Card */}
						<div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-accent-subtle-gray/20">
							{/* Status Banner */}
							<div className={`px-6 py-4 flex items-center justify-between ${
								storeStatus?.is_open ? 'bg-gradient-to-r from-primary-green to-accent-dark-green' : 'bg-gradient-to-r from-red-700 to-red-800'
							}`}>
								<div className="flex items-center space-x-3">
									{storeStatus?.is_open ? (
										<CheckCircleIcon className="w-6 h-6 text-white" />
									) : (
										<XCircleIcon className="w-6 h-6 text-white" />
									)}
									<div className="text-white">
										<p className="font-bold text-lg">
											{storeStatus?.is_open ? 'Open Now' : 'Closed'}
										</p>
										<p className="text-sm text-white/90">
											{getTodayHours()}
										</p>
									</div>
								</div>
								<ClockIcon className="w-8 h-8 text-white/80" />
							</div>

							{/* Location Details */}
							<div className="p-8">
								{/* Address */}
								<div className="mb-6">
									<div className="flex items-start space-x-4">
										<div className="bg-primary-green/10 p-3 rounded-full flex-shrink-0">
											<MapPinIcon className="w-6 h-6 text-primary-green" />
										</div>
										<div className="flex-1">
											<h3 className="font-bold text-accent-dark-green text-lg mb-2">Address</h3>
											<p className="text-accent-dark-brown leading-relaxed">{fullAddress}</p>
											{displayLocation?.distance && (
												<p className="text-primary-green font-medium text-sm mt-2">
													📍 {formatDistance(displayLocation.distance, unit)} away
												</p>
											)}
										</div>
									</div>
								</div>

								{/* Contact Info */}
								<div className="space-y-4 mb-8">
									<div className="flex items-center space-x-4">
										<div className="bg-primary-green/10 p-3 rounded-full">
											<PhoneIcon className="w-6 h-6 text-primary-green" />
										</div>
										<div className="flex-1">
											<h4 className="font-semibold text-accent-dark-green mb-1">Phone</h4>
											<a href={`tel:${phoneNumber.replace(/\D/g, '')}`} className="text-accent-dark-brown hover:text-primary-green transition-colors">
												{phoneNumber}
											</a>
										</div>
									</div>

									<div className="flex items-center space-x-4">
										<div className="bg-primary-green/10 p-3 rounded-full">
											<EnvelopeIcon className="w-6 h-6 text-primary-green" />
										</div>
										<div className="flex-1">
											<h4 className="font-semibold text-accent-dark-green mb-1">Email</h4>
											<a href={`mailto:${emailAddress}`} className="text-accent-dark-brown hover:text-primary-green transition-colors break-all">
												{emailAddress}
											</a>
										</div>
									</div>
								</div>

								{/* Quick Actions */}
								<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
									<Link
										to="/menu"
										className="flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-primary-green to-primary-green/90 text-white rounded-xl hover:shadow-lg transition-all duration-300 transform hover:scale-105 font-medium"
									>
										<ShoppingBagIcon className="w-5 h-5" />
										<span>Order Online</span>
									</Link>

									<button
										onClick={handleDirectionsClick}
										className="flex items-center justify-center space-x-2 px-4 py-3 bg-white border-2 border-primary-green text-primary-green rounded-xl hover:bg-primary-green hover:text-white transition-all duration-300 transform hover:scale-105 font-medium"
									>
										<MapPinIcon className="w-5 h-5" />
										<span>Directions</span>
									</button>

									<button
										onClick={handleCallClick}
										className="flex items-center justify-center space-x-2 px-4 py-3 bg-white border-2 border-accent-warm-brown text-accent-warm-brown rounded-xl hover:bg-accent-warm-brown hover:text-white transition-all duration-300 transform hover:scale-105 font-medium"
									>
										<PhoneIcon className="w-5 h-5" />
										<span>Call Now</span>
									</button>
								</div>
							</div>
						</div>

						{/* Business Hours Card */}
						<div className="bg-white rounded-2xl shadow-xl p-6 border border-accent-subtle-gray/20">
							<h3 className="font-bold text-accent-dark-green text-xl mb-4 flex items-center space-x-2">
								<ClockIcon className="w-6 h-6 text-primary-green" />
								<span>Business Hours</span>
							</h3>
							<BusinessHoursDisplay schedule={schedule} />
						</div>
					</div>

					{/* Right Column - Map */}
					<div className="lg:sticky lg:top-24 h-fit">
						<div className="rounded-3xl overflow-hidden shadow-2xl border-4 border-white">
							<SingleLocationMap
								location={displayLocation}
								userLocation={userLocation}
								height={600}
								zoom={15}
							/>
						</div>
					</div>
				</div>

				{/* Contact Form Section */}
				<div className="bg-white rounded-3xl shadow-2xl overflow-hidden border-4 border-primary-green/20">
					<div className="grid lg:grid-cols-5">
						{/* Form Info Panel */}
						<div className="lg:col-span-2 p-12 bg-primary-green text-white flex flex-col justify-center relative">
							{/* Decorative Pattern Overlay */}
							<div className="absolute inset-0 opacity-10" style={{
								backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
								backgroundSize: '40px 40px'
							}}></div>

							<div className="relative z-10 space-y-6">
								<div>
									<div className="inline-block p-4 bg-white/20 rounded-2xl backdrop-blur-sm mb-4">
										<EnvelopeIcon className="w-12 h-12 text-white" />
									</div>
									<h3 className="text-3xl font-bold mb-4">Get In Touch</h3>
									<p className="text-white/90 text-lg leading-relaxed">
										Have questions, special requests, or feedback? We'd love to hear from you!
									</p>
								</div>
								<div className="space-y-4 pt-6 border-t border-white/20">
									<p className="flex items-start space-x-3">
										<CheckCircleIcon className="w-6 h-6 flex-shrink-0 mt-0.5" />
										<span className="text-white/90">We typically respond within 24 hours</span>
									</p>
									<p className="flex items-start space-x-3">
										<CheckCircleIcon className="w-6 h-6 flex-shrink-0 mt-0.5" />
										<span className="text-white/90">All inquiries are welcome</span>
									</p>
									<p className="flex items-start space-x-3">
										<CheckCircleIcon className="w-6 h-6 flex-shrink-0 mt-0.5" />
										<span className="text-white/90">Your privacy is important to us</span>
									</p>
								</div>
							</div>
						</div>

						{/* Contact Form */}
						<div className="lg:col-span-3 p-12 bg-white">
							<form onSubmit={handleSubmit} className="space-y-6">
								<div className="grid sm:grid-cols-2 gap-6">
									<div>
										<label htmlFor="firstName" className="block text-sm font-semibold text-accent-dark-green mb-2">
											First Name *
										</label>
										<input
											type="text"
											id="firstName"
											value={firstName}
											onChange={(e) => setFirstName(e.target.value)}
											required
											className="w-full px-4 py-3 rounded-xl border-2 border-accent-subtle-gray/30 focus:border-primary-green focus:ring-4 focus:ring-primary-green/10 outline-none transition-all bg-white text-accent-dark-brown placeholder-accent-subtle-gray"
											placeholder="John"
										/>
									</div>

									<div>
										<label htmlFor="lastName" className="block text-sm font-semibold text-accent-dark-green mb-2">
											Last Name *
										</label>
										<input
											type="text"
											id="lastName"
											value={lastName}
											onChange={(e) => setLastName(e.target.value)}
											required
											className="w-full px-4 py-3 rounded-xl border-2 border-accent-subtle-gray/30 focus:border-primary-green focus:ring-4 focus:ring-primary-green/10 outline-none transition-all bg-white text-accent-dark-brown placeholder-accent-subtle-gray"
											placeholder="Doe"
										/>
									</div>
								</div>

								<div>
									<label htmlFor="email" className="block text-sm font-semibold text-accent-dark-green mb-2">
										Email Address *
									</label>
									<input
										type="email"
										id="email"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										required
										className="w-full px-4 py-3 rounded-xl border-2 border-accent-subtle-gray/30 focus:border-primary-green focus:ring-4 focus:ring-primary-green/10 outline-none transition-all bg-white text-accent-dark-brown placeholder-accent-subtle-gray"
										placeholder="john.doe@example.com"
									/>
								</div>

								<div>
									<label htmlFor="message" className="block text-sm font-semibold text-accent-dark-green mb-2">
										Message *
									</label>
									<textarea
										id="message"
										rows="5"
										value={message}
										onChange={(e) => setMessage(e.target.value)}
										required
										className="w-full px-4 py-3 rounded-xl border-2 border-accent-subtle-gray/30 focus:border-primary-green focus:ring-4 focus:ring-primary-green/10 outline-none transition-all bg-white text-accent-dark-brown placeholder-accent-subtle-gray resize-none"
										placeholder="How can we help you?"
									></textarea>
								</div>

								{submitStatus.message && (
									<div
										className={`p-4 rounded-xl text-sm font-medium ${
											submitStatus.type === "success"
												? "bg-green-50 text-green-700 border-2 border-green-200"
												: "bg-red-50 text-red-700 border-2 border-red-200"
										}`}
									>
										{submitStatus.message}
									</div>
								)}

								<button
									type="submit"
									disabled={isSubmitting}
									className="w-full bg-accent-warm-brown hover:bg-accent-dark-brown text-white font-bold py-4 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none text-lg"
								>
									{isSubmitting ? (
										<span className="flex items-center justify-center space-x-2">
											<svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
												<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
												<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
											</svg>
											<span>Sending...</span>
										</span>
									) : (
										"Send Message"
									)}
								</button>
							</form>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

// Business Hours Display Component
const BusinessHoursDisplay = ({ schedule }) => {
	if (!schedule?.schedule) {
		return <p className="text-accent-subtle-gray">Loading hours...</p>;
	}

	const scheduleEntries = Object.entries(schedule.schedule).sort();
	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const daySchedules = new Array(7).fill(null);

	scheduleEntries.forEach(([date, dayData]) => {
		const [year, month, day] = date.split('-').map(Number);
		const dateObj = new Date(year, month - 1, day);
		const dayIndex = dateObj.getDay();
		const dayName = dayNames[dayIndex];

		let hoursString = '';
		if (dayData.is_closed || !dayData.slots || dayData.slots.length === 0) {
			hoursString = 'CLOSED';
		} else {
			hoursString = dayData.slots.map(slot =>
				`${formatTime(slot.opening_time || slot.open_time)} - ${formatTime(slot.closing_time || slot.close_time)}`
			).join(', ');
		}

		daySchedules[dayIndex] = { dayName, hoursString };
	});

	const groupedDays = [];
	let currentGroup = null;

	daySchedules.filter(Boolean).forEach((daySchedule) => {
		if (!currentGroup || currentGroup.hoursString !== daySchedule.hoursString) {
			currentGroup = {
				hoursString: daySchedule.hoursString,
				days: [daySchedule.dayName],
				startDay: daySchedule.dayName,
				endDay: daySchedule.dayName
			};
			groupedDays.push(currentGroup);
		} else {
			currentGroup.days.push(daySchedule.dayName);
			currentGroup.endDay = daySchedule.dayName;
		}
	});

	return (
		<div className="space-y-3">
			{groupedDays.map((group, index) => {
				let dayRange;
				if (group.days.length === 1) {
					dayRange = group.startDay;
				} else if (group.days.length === 2) {
					dayRange = `${group.startDay} & ${group.endDay}`;
				} else {
					dayRange = `${group.startDay} - ${group.endDay}`;
				}

				return (
					<div key={index} className="flex justify-between items-center py-2 border-b border-accent-subtle-gray/20 last:border-0">
						<span className="font-semibold text-accent-dark-green">
							{dayRange}
						</span>
						<span className={`font-medium ${group.hoursString === 'CLOSED' ? 'text-red-600' : 'text-accent-dark-brown'}`}>
							{group.hoursString === 'CLOSED' ? 'Closed' : group.hoursString}
						</span>
					</div>
				);
			})}
		</div>
	);
};

export default Location;
