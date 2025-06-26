import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Mail, Phone, MessageSquare, ArrowRight } from "lucide-react";

const CustomerInfo = ({ formData, updateFormData, onNext, isLoading }) => {
	const handleInputChange = (e) => {
		const { name, value } = e.target;

		// Format phone number
		if (name === "phone") {
			const phoneNumber = value.replace(/[^\d]/g, "");
			let formattedPhone = phoneNumber;

			if (phoneNumber.length >= 6) {
				formattedPhone = `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(
					3,
					6
				)}-${phoneNumber.slice(6, 10)}`;
			} else if (phoneNumber.length >= 3) {
				formattedPhone = `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
			} else if (phoneNumber.length > 0) {
				formattedPhone = `(${phoneNumber}`;
			}

			updateFormData(name, formattedPhone);
		} else {
			updateFormData(name, value);
		}
	};

	const validateForm = () => {
		const { firstName, lastName, email, phone } = formData;
		const phoneDigits = phone.replace(/[^\d]/g, "");

		return (
			firstName.trim() &&
			lastName.trim() &&
			email.trim() &&
			email.includes("@") &&
			phoneDigits.length === 10
		);
	};

	const handleNext = (e) => {
		e.preventDefault();
		if (validateForm() && !isLoading) {
			onNext();
		}
	};

	return (
		<div>
			<CardHeader className="px-0 pt-0 pb-6">
				<CardTitle className="text-accent-dark-green flex items-center mb-2">
					<User className="mr-2 h-5 w-5" />
					Contact Information
				</CardTitle>
				<p className="text-accent-dark-brown/70 text-sm leading-relaxed">
					We need your details to process your order and send confirmation.
				</p>
			</CardHeader>

			<CardContent className="px-0">
				<form
					onSubmit={handleNext}
					className="space-y-8"
				>
					{/* Name Fields */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div className="space-y-3">
							<Label
								htmlFor="firstName"
								className="text-accent-dark-brown font-medium text-sm"
							>
								First Name *
							</Label>
							<div className="relative">
								<Input
									id="firstName"
									name="firstName"
									type="text"
									value={formData.firstName || ""}
									onChange={handleInputChange}
									placeholder="Enter your first name"
									className="border-accent-subtle-gray/50 focus:border-primary-green focus:ring-primary-green/20"
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
							<Input
								id="lastName"
								name="lastName"
								type="text"
								value={formData.lastName || ""}
								onChange={handleInputChange}
								placeholder="Enter your last name"
								className="border-accent-subtle-gray/50 focus:border-primary-green focus:ring-primary-green/20"
								required
							/>
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
							<Mail className="absolute left-3 top-3 h-4 w-4 text-accent-dark-brown/40" />
							<Input
								id="email"
								name="email"
								type="email"
								value={formData.email || ""}
								onChange={handleInputChange}
								placeholder="Enter your email address"
								className="pl-10 border-accent-subtle-gray/50 focus:border-primary-green focus:ring-primary-green/20"
								required
							/>
						</div>
						<p className="text-xs text-accent-dark-brown/60 mt-2 leading-relaxed">
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
							<Phone className="absolute left-3 top-3 h-4 w-4 text-accent-dark-brown/40" />
							<Input
								id="phone"
								name="phone"
								type="tel"
								value={formData.phone || ""}
								onChange={handleInputChange}
								placeholder="(555) 123-4567"
								className="pl-10 border-accent-subtle-gray/50 focus:border-primary-green focus:ring-primary-green/20"
								required
							/>
						</div>
						<p className="text-xs text-accent-dark-brown/60 mt-2 leading-relaxed">
							We may call if there are any issues with your order.
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
								value={formData.orderNotes || ""}
								onChange={handleInputChange}
								placeholder="Any special instructions or allergies?"
								className="pl-10 border-accent-subtle-gray/50 focus:border-primary-green focus:ring-primary-green/20 min-h-[80px]"
								rows={3}
							/>
						</div>
					</div>

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
