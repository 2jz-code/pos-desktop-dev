import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	User,
	Mail,
	Phone,
	ArrowRight,
	MessageSquare,
	UserCheck,
} from "lucide-react";

const CustomerInfo = ({
	formData,
	updateFormData,
	onNext,
	isLoading,
	isAuthenticated,
	user,
}) => {
	const [localFormData, setLocalFormData] = useState(formData);

	// Pre-fill form data for authenticated users
	useEffect(() => {
		if (isAuthenticated && user) {
			setLocalFormData((prev) => ({
				...prev,
				firstName: user.first_name || "",
				lastName: user.last_name || "",
				email: user.email || "",
				phone: user.phone || "",
			}));
		}
	}, [isAuthenticated, user]);

	const handleInputChange = (e) => {
		const { name, value } = e.target;
		setLocalFormData((prev) => ({ ...prev, [name]: value }));
		updateFormData(name, value);
	};

	const validateForm = () => {
		// For authenticated users, only validate order notes if required
		if (isAuthenticated && user) {
			return true; // Always valid for authenticated users
		}

		// For guest users, validate all required fields
		const { firstName, lastName, email, phone } = localFormData;

		if (!firstName?.trim()) return false;
		if (!lastName?.trim()) return false;
		if (!email?.trim()) return false;
		if (!phone?.trim()) return false;

		// Basic email validation
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) return false;

		// Basic phone validation (at least 10 digits)
		const phoneDigits = phone.replace(/\D/g, "");
		if (phoneDigits.length < 10) return false;

		return true;
	};

	const handleSubmit = (e) => {
		e.preventDefault();
		if (validateForm()) {
			onNext();
		}
	};

	// Format phone number for display
	const formatPhoneNumber = (value) => {
		const phoneNumber = value.replace(/[^\d]/g, "");
		const phoneNumberLength = phoneNumber.length;

		if (phoneNumberLength < 4) return phoneNumber;
		if (phoneNumberLength < 7) {
			return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
		}
		return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(
			3,
			6
		)}-${phoneNumber.slice(6, 10)}`;
	};

	const handlePhoneChange = (e) => {
		const formattedPhone = formatPhoneNumber(e.target.value);
		setLocalFormData((prev) => ({ ...prev, phone: formattedPhone }));
		updateFormData("phone", formattedPhone);
	};

	return (
		<div>
			<CardHeader className="px-0 pt-0">
				<CardTitle className="text-accent-dark-green flex items-center">
					{isAuthenticated ? (
						<>
							<UserCheck className="mr-2 h-5 w-5" />
							Welcome back, {user?.first_name || user?.username}!
						</>
					) : (
						<>
							<User className="mr-2 h-5 w-5" />
							Contact Information
						</>
					)}
				</CardTitle>
				<p className="text-accent-dark-brown/70 text-sm">
					{isAuthenticated
						? "Please review your information and add any order notes."
						: "We'll use this information to contact you about your order."}
				</p>
			</CardHeader>

			<CardContent className="px-0">
				<form
					onSubmit={handleSubmit}
					className="space-y-6"
				>
					{isAuthenticated && user ? (
						// For authenticated users, show editable form with pre-filled data
						<div className="space-y-6">
							{/* Customer Info Notice */}
							<div className="bg-primary-beige/30 rounded-lg p-3 border border-accent-subtle-gray/30">
								<p className="text-sm text-accent-dark-brown/80">
									<UserCheck className="inline mr-2 h-4 w-4" />
									Your information is pre-filled but you can update it for this
									order.
								</p>
							</div>

							{/* Name Fields */}
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div className="space-y-3">
									<Label
										htmlFor="firstName"
										className="text-accent-dark-brown font-medium text-sm"
									>
										First Name *
									</Label>
									<div className="relative">
										<User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-accent-dark-brown/40" />
										<Input
											id="firstName"
											name="firstName"
											type="text"
											value={localFormData.firstName || ""}
											onChange={handleInputChange}
											placeholder="First Name"
											className="pl-10 border-accent-subtle-gray/50 focus:border-primary-green focus:ring-primary-green/20"
											required
										/>
									</div>
								</div>

								<div className="space-y-3">
									<Label
										htmlFor="lastName"
										className="text-accent-dark-brown font-medium text-sm"
									>
										Last Name *
									</Label>
									<div className="relative">
										<User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-accent-dark-brown/40" />
										<Input
											id="lastName"
											name="lastName"
											type="text"
											value={localFormData.lastName || ""}
											onChange={handleInputChange}
											placeholder="Last Name"
											className="pl-10 border-accent-subtle-gray/50 focus:border-primary-green focus:ring-primary-green/20"
											required
										/>
									</div>
								</div>
							</div>

							{/* Email Field */}
							<div className="space-y-3">
								<Label
									htmlFor="email"
									className="text-accent-dark-brown font-medium text-sm"
								>
									Email Address *
								</Label>
								<div className="relative">
									<Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-accent-dark-brown/40" />
									<Input
										id="email"
										name="email"
										type="email"
										value={localFormData.email || ""}
										onChange={handleInputChange}
										placeholder="your.email@example.com"
										className="pl-10 border-accent-subtle-gray/50 focus:border-primary-green focus:ring-primary-green/20"
										required
									/>
								</div>
							</div>

							{/* Phone Field */}
							<div className="space-y-3">
								<Label
									htmlFor="phone"
									className="text-accent-dark-brown font-medium text-sm"
								>
									Phone Number *
								</Label>
								<div className="relative">
									<Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-accent-dark-brown/40" />
									<Input
										id="phone"
										name="phone"
										type="tel"
										value={localFormData.phone || ""}
										onChange={handlePhoneChange}
										placeholder="(555) 123-4567"
										className="pl-10 border-accent-subtle-gray/50 focus:border-primary-green focus:ring-primary-green/20"
										required
									/>
								</div>
							</div>

							{/* Order Notes */}
							<div className="space-y-3">
								<Label
									htmlFor="orderNotes"
									className="text-accent-dark-brown font-medium text-sm"
								>
									Order Notes (Optional)
								</Label>
								<div className="relative">
									<MessageSquare className="absolute left-3 top-3 h-4 w-4 text-accent-dark-brown/40" />
									<Textarea
										id="orderNotes"
										name="orderNotes"
										value={localFormData.orderNotes || ""}
										onChange={handleInputChange}
										placeholder="Any special instructions or allergies?"
										className="pl-10 border-accent-subtle-gray/50 focus:border-primary-green focus:ring-primary-green/20 min-h-[80px]"
										rows={3}
									/>
								</div>
							</div>
						</div>
					) : (
						// For guest users, show full form
						<div className="space-y-6">
							{/* Name Fields */}
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div className="space-y-3">
									<Label
										htmlFor="firstName"
										className="text-accent-dark-brown font-medium text-sm"
									>
										First Name *
									</Label>
									<div className="relative">
										<User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-accent-dark-brown/40" />
										<Input
											id="firstName"
											name="firstName"
											type="text"
											value={localFormData.firstName || ""}
											onChange={handleInputChange}
											placeholder="John"
											required
											className="pl-10 border-accent-subtle-gray/50 focus:border-primary-green focus:ring-primary-green/20"
										/>
									</div>
								</div>

								<div className="space-y-3">
									<Label
										htmlFor="lastName"
										className="text-accent-dark-brown font-medium text-sm"
									>
										Last Name *
									</Label>
									<div className="relative">
										<User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-accent-dark-brown/40" />
										<Input
											id="lastName"
											name="lastName"
											type="text"
											value={localFormData.lastName || ""}
											onChange={handleInputChange}
											placeholder="Doe"
											required
											className="pl-10 border-accent-subtle-gray/50 focus:border-primary-green focus:ring-primary-green/20"
										/>
									</div>
								</div>
							</div>

							{/* Email Field */}
							<div className="space-y-3">
								<Label
									htmlFor="email"
									className="text-accent-dark-brown font-medium text-sm"
								>
									Email Address *
								</Label>
								<div className="relative">
									<Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-accent-dark-brown/40" />
									<Input
										id="email"
										name="email"
										type="email"
										value={localFormData.email || ""}
										onChange={handleInputChange}
										placeholder="john.doe@example.com"
										required
										className="pl-10 border-accent-subtle-gray/50 focus:border-primary-green focus:ring-primary-green/20"
									/>
								</div>
								<p className="text-accent-dark-brown/60 text-sm">
									We'll send your order confirmation to this email.
								</p>
							</div>

							{/* Phone Field */}
							<div className="space-y-3">
								<Label
									htmlFor="phone"
									className="text-accent-dark-brown font-medium text-sm"
								>
									Phone Number *
								</Label>
								<div className="relative">
									<Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-accent-dark-brown/40" />
									<Input
										id="phone"
										name="phone"
										type="tel"
										value={localFormData.phone || ""}
										onChange={handlePhoneChange}
										placeholder="(555) 123-4567"
										required
										className="pl-10 border-accent-subtle-gray/50 focus:border-primary-green focus:ring-primary-green/20"
									/>
								</div>
								<p className="text-accent-dark-brown/60 text-sm">
									We'll text you updates about your order.
								</p>
							</div>

							{/* Order Notes */}
							<div className="space-y-3">
								<Label
									htmlFor="orderNotes"
									className="text-accent-dark-brown font-medium text-sm"
								>
									Order Notes (Optional)
								</Label>
								<div className="relative">
									<MessageSquare className="absolute left-3 top-3 h-4 w-4 text-accent-dark-brown/40" />
									<Textarea
										id="orderNotes"
										name="orderNotes"
										value={localFormData.orderNotes || ""}
										onChange={handleInputChange}
										placeholder="Any special instructions or allergies?"
										className="pl-10 border-accent-subtle-gray/50 focus:border-primary-green focus:ring-primary-green/20 min-h-[80px]"
										rows={3}
									/>
								</div>
							</div>
						</div>
					)}

					{/* Continue Button */}
					<div className="pt-6">
						<Button
							type="submit"
							disabled={!validateForm() || isLoading}
							className="w-full bg-primary-green hover:bg-accent-dark-green text-accent-light-beige py-3 text-base font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{isLoading ? (
								<div className="flex items-center">
									<div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-accent-light-beige mr-2"></div>
									Processing...
								</div>
							) : (
								<div className="flex items-center justify-center">
									Continue to Payment
									<ArrowRight className="ml-2 h-4 w-4" />
								</div>
							)}
						</Button>
					</div>
				</form>
			</CardContent>
		</div>
	);
};

export default CustomerInfo;
