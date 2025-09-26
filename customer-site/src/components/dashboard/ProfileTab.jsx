import React, { useState, useEffect } from "react";
import { useDashboard } from "@/contexts/DashboardContext";
import { userAPI } from "@/api/user";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	formatPhoneNumber,
	isValidEmail,
	isValidPhoneNumber,
	formatName
} from "@ajeen/ui";

const ProfileTab = () => {
	const { profile, updateProfile, error } = useDashboard();
	const [formData, setFormData] = useState({});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [validationErrors, setValidationErrors] = useState({});

	useEffect(() => {
		if (profile) {
			setFormData({
				first_name: profile.first_name || "",
				last_name: profile.last_name || "",
				email: profile.email || "",
				phone_number: profile.phone_number || "",
			});
		}
	}, [profile]);

	const handleInputChange = (e) => {
		const { name, value } = e.target;
		let formattedValue = value;

		// Apply formatting based on field type
		if (name === 'phone_number') {
			formattedValue = formatPhoneNumber(value);
		} else if (name === 'first_name' || name === 'last_name') {
			formattedValue = formatName(value);
		}

		setFormData((prev) => ({ ...prev, [name]: formattedValue }));

		// Clear validation error for this field
		if (validationErrors[name]) {
			setValidationErrors((prev) => ({ ...prev, [name]: '' }));
		}
	};

	const handleSubmit = async (e) => {
		e.preventDefault();

		// Validate form before submission
		const errors = {};

		if (formData.email && !isValidEmail(formData.email)) {
			errors.email = "Please enter a valid email address";
		}

		if (formData.phone_number && !isValidPhoneNumber(formData.phone_number)) {
			errors.phone_number = "Please enter a valid phone number";
		}

		if (Object.keys(errors).length > 0) {
			setValidationErrors(errors);
			return;
		}

		setIsSubmitting(true);
		const { success, error } = await updateProfile(formData);
		setIsSubmitting(false);

		if (success) {
			toast.success("Profile updated successfully!");
		} else {
			toast.error(error);
		}
	};

	if (error) {
		return <Alert variant="destructive">{error}</Alert>;
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>My Profile</CardTitle>
				<CardDescription>
					Update your personal information here.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form
					onSubmit={handleSubmit}
					className="space-y-6"
				>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div className="space-y-2">
							<Label htmlFor="first_name">First Name</Label>
							<Input
								id="first_name"
								name="first_name"
								value={formData.first_name || ""}
								onChange={handleInputChange}
								disabled={!profile}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="last_name">Last Name</Label>
							<Input
								id="last_name"
								name="last_name"
								value={formData.last_name || ""}
								onChange={handleInputChange}
								disabled={!profile}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								name="email"
								type="email"
								value={formData.email || ""}
								onChange={handleInputChange}
								disabled={!profile}
								className={validationErrors.email ? "border-red-500" : ""}
							/>
							{validationErrors.email && (
								<p className="text-sm text-red-500">{validationErrors.email}</p>
							)}
						</div>
						<div className="space-y-2">
							<Label htmlFor="phone_number">Phone Number</Label>
							<Input
								id="phone_number"
								name="phone_number"
								type="tel"
								value={formData.phone_number || ""}
								onChange={handleInputChange}
								disabled={!profile}
								placeholder="(123) 456-7890"
								className={validationErrors.phone_number ? "border-red-500" : ""}
							/>
							{validationErrors.phone_number && (
								<p className="text-sm text-red-500">{validationErrors.phone_number}</p>
							)}
						</div>
					</div>
					<div className="flex justify-end">
						<Button
							type="submit"
							disabled={isSubmitting || !profile}
						>
							{isSubmitting ? "Saving..." : "Save Changes"}
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
};

export default ProfileTab;
