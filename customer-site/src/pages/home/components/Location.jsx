import React, { useState } from "react";
import {
	MapPinIcon,
	PhoneIcon,
	EnvelopeIcon,
	ClockIcon,
} from "@heroicons/react/24/outline";
import apiClient from "../../../api/client";
import { useStoreInfo, useWeeklySchedule } from "../../../hooks/useSettings";
import { formatTime } from "../../../hooks/useSettings";

const ContactItem = ({ icon, title, details }) => {
	return (
		<div className="flex items-start space-x-4 p-6 bg-primary-beige rounded-xl shadow-md hover:shadow-lg transition-shadow duration-300 h-full">
			{/* Icon background: Primary Green, Icon color: Light Beige */}
			<div className="flex-shrink-0">
				<div className="p-3 bg-primary-green text-accent-light-beige rounded-full">
					{icon}
				</div>
			</div>
			<div className="flex-1">
				{/* Title: Dark Green */}
				<h3 className="text-lg font-semibold text-accent-dark-green mb-1">
					{title}
				</h3>
				{/* Details: Dark Brown */}
				<div className="text-accent-dark-brown">{details}</div>
			</div>
		</div>
	);
};

const WorkingHoursDisplay = () => {
	const { data: schedule, isLoading } = useWeeklySchedule();
	
	if (isLoading) {
		return <p className="text-accent-subtle-gray">Loading hours...</p>;
	}
	
	if (!schedule?.schedule) {
		return <p className="text-accent-subtle-gray">Hours not available</p>;
	}
	
	// Convert schedule to grouped format
	const scheduleEntries = Object.entries(schedule.schedule).sort();
	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	
	// Create ordered array by day of week (Sun=0, Mon=1, etc.)
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
	
	// Group consecutive days with same hours
	const groupedDays = [];
	let currentGroup = null;
	
	daySchedules.filter(Boolean).forEach((daySchedule) => {
		if (!currentGroup || currentGroup.hoursString !== daySchedule.hoursString) {
			// Start new group
			currentGroup = {
				hoursString: daySchedule.hoursString,
				days: [daySchedule.dayName],
				startDay: daySchedule.dayName,
				endDay: daySchedule.dayName
			};
			groupedDays.push(currentGroup);
		} else {
			// Add to current group
			currentGroup.days.push(daySchedule.dayName);
			currentGroup.endDay = daySchedule.dayName;
		}
	});
	
	return (
		<div className="space-y-1">
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
					<div key={index} className="flex justify-between items-center text-sm">
						<span className="font-medium text-accent-dark-green">
							{dayRange}:
						</span>
						<span className="text-accent-dark-brown">
							{group.hoursString === 'CLOSED' ? 'Closed' : group.hoursString}
						</span>
					</div>
				);
			})}
		</div>
	);
};

const Location = () => {
	const { data: storeInfo } = useStoreInfo();

	const contactInfo = [
		{
			icon: <MapPinIcon className="w-6 h-6" />,
			title: "Our Location",
			details:
				storeInfo?.store_address || "2105 Cliff Rd Suite 300, Eagan, MN, 55122",
		},
		{
			icon: <PhoneIcon className="w-6 h-6" />,
			title: "Phone Number",
			details: storeInfo?.store_phone || "(651) 412-5336",
		},
		{
			icon: <EnvelopeIcon className="w-6 h-6" />,
			title: "Email Address",
			details: storeInfo?.store_email || "contact@bakeajeen.com",
		},
		{
			icon: <ClockIcon className="w-6 h-6" />,
			title: "Dining Options",
			details: "Takeout available with limited seating",
		},
	];

	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [email, setEmail] = useState("");
	const [message, setMessage] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitStatus, setSubmitStatus] = useState({ type: "", message: "" });

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
				message:
					response.data.success ||
					"Message sent successfully! We will get back to you soon.",
			});
			setFirstName("");
			setLastName("");
			setEmail("");
			setMessage("");
		} catch (error) {
			console.error("Error submitting contact form:", error);
			const errorMessage =
				error.response?.data?.error ||
				"An error occurred. Please try again later.";
			setSubmitStatus({ type: "error", message: errorMessage });
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div
			id="contact"
			className="w-full py-20 px-4 bg-background" // Main section background: Light Beige
		>
			<div className="max-w-7xl mx-auto">
				<div className="text-center mb-16">
					{/* "Get In Touch" span: Primary Green */}
					<span className="text-primary-green font-semibold tracking-wider uppercase">
						Get In Touch
					</span>
					{/* "Contact Us" heading: Dark Green */}
					<h2 className="text-4xl font-bold mt-2 text-accent-dark-green">
						Contact Us
					</h2>
					{/* Decorative line: Primary Green */}
					<div className="h-1 w-24 bg-primary-green mx-auto mt-4 rounded-full"></div>
					{/* Paragraph text: Dark Brown */}
					<p className="mt-6 text-accent-dark-brown max-w-2xl mx-auto">
						Have questions or want to place an order? We're here to help! Reach
						out to us using any of the methods below.
					</p>
				</div>

				<div className="grid md:grid-cols-2 gap-8 mb-16">
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-stretch">
						{contactInfo.map((item, index) => (
							<ContactItem
								key={index}
								icon={item.icon}
								title={item.title}
								details={item.details}
							/>
						))}
					</div>

					<div className="relative rounded-xl overflow-hidden shadow-xl h-[400px] group">
						{/* Optional: Subtle overlay on map for theme consistency */}
						<div className="absolute inset-0 bg-primary-green opacity-0 group-hover:opacity-10 transition-opacity duration-300 z-10"></div>
						<iframe
							title="location"
							src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2831.5122795547063!2d-93.21931430919926!3d44.790747603537845!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x87f631b56239743f%3A0x62f01f76556fe739!2sAjeen%20Bakery!5e0!3m2!1sen!2sus!4v1748584252104!5m2!1sen!2sus"
							width="600"
							height="450"
							allowFullScreen=""
							loading="lazy"
							referrerPolicy="no-referrer-when-downgrade"
						></iframe>
						<a
							href="https://maps.app.goo.gl/42MgvJxT5Fn2eJAN7" // Direct link to Google Maps
							target="_blank"
							rel="noopener noreferrer"
							className="absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
						>
							{/* "Open in Google Maps" button: Light Beige background, Dark Green text */}
							<span className="px-4 py-2 bg-accent-light-beige text-accent-dark-green rounded-full font-medium shadow-lg">
								Open in Google Maps
							</span>
						</a>
					</div>
				</div>

				<div className="bg-primary-beige rounded-2xl shadow-xl overflow-hidden">
					{" "}
					{/* Form container: Primary Beige */}
					<div className="grid md:grid-cols-2">
						{/* Form decorative side panel: Primary Green background, Light Beige text */}
						<div className="bg-primary-green p-12 text-accent-light-beige">
							<h3 className="text-2xl font-bold mb-6">Send Us a Message</h3>
							<p className="mb-8">
								Have a special request or feedback? Fill out the form and we'll
								get back to you as soon as possible.
							</p>
							<div className="space-y-4 text-sm">
								<p>
									We appreciate your input and look forward to hearing from you!
								</p>
								<p>Our team typically responds within 24 hours.</p>
							</div>
						</div>
						<div className="p-12 bg-accent-light-beige">
							{" "}
							{/* Form side: Light Beige background */}
							<form
								onSubmit={handleSubmit}
								className="space-y-6"
							>
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
									<div>
										{/* Label text: Dark Green */}
										<label
											htmlFor="firstName"
											className="block text-sm font-medium text-accent-dark-green mb-1"
										>
											First Name
										</label>
										<input
											type="text"
											id="firstName"
											name="firstName"
											value={firstName}
											onChange={(e) => setFirstName(e.target.value)}
											required
											// Input: Subtle Gray border, Primary Green focus ring
											className="w-full px-4 py-3 rounded-lg border border-accent-subtle-gray focus:ring-2 focus:ring-primary-green focus:border-primary-green outline-none transition-all bg-white text-accent-dark-brown placeholder-accent-subtle-gray"
											placeholder="Your first name"
										/>
									</div>
									<div>
										<label
											htmlFor="lastName"
											className="block text-sm font-medium text-accent-dark-green mb-1"
										>
											Last Name
										</label>
										<input
											type="text"
											id="lastName"
											name="lastName"
											value={lastName}
											onChange={(e) => setLastName(e.target.value)}
											required
											className="w-full px-4 py-3 rounded-lg border border-accent-subtle-gray focus:ring-2 focus:ring-primary-green focus:border-primary-green outline-none transition-all bg-white text-accent-dark-brown placeholder-accent-subtle-gray"
											placeholder="Your last name"
										/>
									</div>
								</div>
								<div>
									<label
										htmlFor="email"
										className="block text-sm font-medium text-accent-dark-green mb-1"
									>
										Email Address
									</label>
									<input
										type="email"
										id="email"
										name="email"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										required
										className="w-full px-4 py-3 rounded-lg border border-accent-subtle-gray focus:ring-2 focus:ring-primary-green focus:border-primary-green outline-none transition-all bg-white text-accent-dark-brown placeholder-accent-subtle-gray"
										placeholder="your@email.com"
									/>
								</div>
								<div>
									<label
										htmlFor="message"
										className="block text-sm font-medium text-accent-dark-green mb-1"
									>
										Message
									</label>
									<textarea
										id="message"
										name="message"
										rows="4"
										value={message}
										onChange={(e) => setMessage(e.target.value)}
										required
										className="w-full px-4 py-3 rounded-lg border border-accent-subtle-gray focus:ring-2 focus:ring-primary-green focus:border-primary-green outline-none transition-all bg-white text-accent-dark-brown placeholder-accent-subtle-gray"
										placeholder="How can we help you?"
									></textarea>
								</div>

								{submitStatus.message && (
									<div
										className={`p-3 rounded-md text-sm text-center ${
											submitStatus.type === "success"
												? "bg-primary-green/20 text-primary-green" // Lighter green for success
												: "bg-red-100 text-red-700" // Standard red for error
										}`}
									>
										{submitStatus.message}
									</div>
								)}
								{/* Submit button: Warm Brown background, Light Beige text */}
								<button
									type="submit"
									disabled={isSubmitting}
									className="w-full bg-accent-warm-brown text-accent-light-beige font-medium py-3 px-4 rounded-lg hover:bg-opacity-80 transition-colors duration-300 transform hover:scale-[1.02] disabled:opacity-70 disabled:cursor-not-allowed"
								>
									{isSubmitting ? "Sending..." : "Send Message"}
								</button>
							</form>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default Location;
