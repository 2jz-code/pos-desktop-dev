import React, { useState, useEffect } from "react";
import { motion } from "framer-motion"; // eslint-disable-line
import { Link, useNavigate } from "react-router-dom";
import {
	User,
	Mail,
	Lock,
	Eye,
	EyeOff,
	ArrowLeft,
	Check,
	X,
	Gift,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import ComingSoonWrapper from "../utility/ComingSoonWrapper";
import GoogleOAuthButton from "./GoogleOAuthButton";
// import TermsOfService from "@/pages/TermsOfService";
// import PrivacyPolicy from "@/pages/PrivacyPolicy";

const RegisterForm = () => {
	const [formData, setFormData] = useState({
		first_name: "",
		last_name: "",
		username: "",
		email: "",
		password: "",
		confirm_password: "",
		is_rewards_opted_in: false,
	});

	const [showPassword, setShowPassword] = useState(false);
	const [errors, setErrors] = useState({});
	const [formError, setFormError] = useState("");
	const [passwordStrength, setPasswordStrength] = useState(0);
	const [agreeToTerms, setAgreeToTerms] = useState(false);

	const navigate = useNavigate();
	const { register, isLoading, isAuthenticated } = useAuth();

	const passwordRequirements = [
		{
			id: "length",
			label: "At least 8 characters",
			test: (password) => password.length >= 8,
		},
		{
			id: "uppercase",
			label: "At least one uppercase letter",
			test: (password) => /[A-Z]/.test(password),
		},
		{
			id: "lowercase",
			label: "At least one lowercase letter",
			test: (password) => /[a-z]/.test(password),
		},
		{
			id: "number",
			label: "At least one number",
			test: (password) => /[0-9]/.test(password),
		},
		{
			id: "special",
			label: "At least one special character",
			test: (password) => /[^A-Za-z0-9]/.test(password),
		},
	];

	useEffect(() => {
		if (isAuthenticated) {
			navigate("/");
		}
	}, [isAuthenticated, navigate]);

	const handleChange = (e) => {
		const { name, value, type, checked } = e.target;
		setFormData((prev) => ({
			...prev,
			[name]: type === "checkbox" ? checked : value,
		}));

		if (errors[name]) {
			setErrors((prev) => ({ ...prev, [name]: "" }));
		}
		if (formError) {
			setFormError("");
		}
	};

	useEffect(() => {
		if (formData.password) {
			const passedTests = passwordRequirements.filter((req) =>
				req.test(formData.password)
			).length;
			setPasswordStrength((passedTests / passwordRequirements.length) * 100);
		} else {
			setPasswordStrength(0);
		}
	}, [formData.password, passwordRequirements]);

	const togglePasswordVisibility = () => {
		setShowPassword(!showPassword);
	};

	const validateForm = () => {
		const newErrors = {};

		// Required field validation
		for (const field of [
			"first_name",
			"last_name",
			"username",
			"email",
			"password",
		]) {
			if (!formData[field].trim()) {
				newErrors[field] = `${field.replace("_", " ")} is required`;
			}
		}

		// Email validation
		if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
			newErrors.email = "Please enter a valid email address";
		}

		// Username validation
		if (formData.username && !/^[a-zA-Z0-9_-]+$/.test(formData.username)) {
			newErrors.username =
				"Username can only contain letters, numbers, underscores, and hyphens";
		}

		// Password strength validation
		if (formData.password && passwordStrength < 60) {
			newErrors.password =
				"Password is too weak. Please meet all requirements.";
		}

		// Password confirmation
		if (formData.password !== formData.confirm_password) {
			newErrors.confirm_password = "Passwords do not match";
		}

		// Terms agreement
		if (!agreeToTerms) {
			newErrors.terms = "You must agree to the terms and conditions";
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (!validateForm()) {
			return;
		}

		setFormError("");

		const result = await register(formData);

		if (!result.success) {
			if (result.fieldErrors) {
				setErrors(result.fieldErrors);
			} else {
				setFormError(result.error);
			}
		}
	};

	const getStrengthText = () => {
		if (passwordStrength < 30) return "Weak";
		if (passwordStrength < 60) return "Medium";
		return "Strong";
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-primary-beige via-accent-light-beige to-primary-beige flex flex-col justify-center py-12">
			{/* Logo and Back Button */}
			<div className="absolute top-0 left-0 p-6 flex items-center">
				<button
					onClick={() => navigate("/")}
					className="mr-4 text-accent-dark-green hover:text-primary-green transition-colors"
					aria-label="Back to home"
				>
					<ArrowLeft size={20} />
				</button>
				<Link to="/">
					<div className="h-10 w-auto text-2xl font-bold text-accent-dark-green">
						Ajeen
					</div>
				</Link>
			</div>

			{/* Registration Form Card */}
			<motion.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.5 }}
				className="max-w-md w-full mx-auto px-6"
			>
				<Card className="bg-accent-light-beige border-accent-subtle-gray/50 shadow-xl">
					<CardContent className="p-8">
						<h2 className="text-2xl font-bold text-accent-dark-green mb-6 text-center">
							Create Your Account
						</h2>

						{formError && (
							<motion.div
								initial={{ opacity: 0, y: -10 }}
								animate={{ opacity: 1, y: 0 }}
								className="mb-6"
							>
								<Alert variant="destructive">
									<AlertDescription>{formError}</AlertDescription>
								</Alert>
							</motion.div>
						)}

						<form
							onSubmit={handleSubmit}
							className="space-y-4"
						>
							{/* Name Fields */}
							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label
										htmlFor="first_name"
										className="text-sm font-medium text-accent-dark-green"
									>
										First Name
									</Label>
									<Input
										id="first_name"
										name="first_name"
										type="text"
										value={formData.first_name}
										onChange={handleChange}
										className="bg-white text-accent-dark-brown border-accent-subtle-gray focus:ring-primary-green focus:border-primary-green"
										placeholder="John"
										required
									/>
									{errors.first_name && (
										<p className="text-red-500 text-xs mt-1">
											{errors.first_name}
										</p>
									)}
								</div>
								<div className="space-y-2">
									<Label
										htmlFor="last_name"
										className="text-sm font-medium text-accent-dark-green"
									>
										Last Name
									</Label>
									<Input
										id="last_name"
										name="last_name"
										type="text"
										value={formData.last_name}
										onChange={handleChange}
										className="bg-white text-accent-dark-brown border-accent-subtle-gray focus:ring-primary-green focus:border-primary-green"
										placeholder="Doe"
										required
									/>
									{errors.last_name && (
										<p className="text-red-500 text-xs mt-1">
											{errors.last_name}
										</p>
									)}
								</div>
							</div>

							{/* Username Field */}
							<div className="space-y-2">
								<Label
									htmlFor="username"
									className="text-sm font-medium text-accent-dark-green"
								>
									Username
								</Label>
								<div className="relative">
									<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
										<User className="h-4 w-4 text-accent-subtle-gray" />
									</div>
									<Input
										id="username"
										name="username"
										type="text"
										value={formData.username}
										onChange={handleChange}
										className="pl-10 bg-white text-accent-dark-brown border-accent-subtle-gray focus:ring-primary-green focus:border-primary-green"
										placeholder="johndoe"
										required
									/>
								</div>
								{errors.username && (
									<p className="text-red-500 text-xs mt-1">{errors.username}</p>
								)}
							</div>

							{/* Email Field */}
							<div className="space-y-2">
								<Label
									htmlFor="email"
									className="text-sm font-medium text-accent-dark-green"
								>
									Email
								</Label>
								<div className="relative">
									<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
										<Mail className="h-4 w-4 text-accent-subtle-gray" />
									</div>
									<Input
										id="email"
										name="email"
										type="email"
										value={formData.email}
										onChange={handleChange}
										className="pl-10 bg-white text-accent-dark-brown border-accent-subtle-gray focus:ring-primary-green focus:border-primary-green"
										placeholder="john@example.com"
										required
									/>
								</div>
								{errors.email && (
									<p className="text-red-500 text-xs mt-1">{errors.email}</p>
								)}
							</div>

							{/* Password Field */}
							<div className="space-y-2">
								<Label
									htmlFor="password"
									className="text-sm font-medium text-accent-dark-green"
								>
									Password
								</Label>
								<div className="relative">
									<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
										<Lock className="h-4 w-4 text-accent-subtle-gray" />
									</div>
									<Input
										id="password"
										name="password"
										type={showPassword ? "text" : "password"}
										value={formData.password}
										onChange={handleChange}
										className="pl-10 pr-10 bg-white text-accent-dark-brown border-accent-subtle-gray focus:ring-primary-green focus:border-primary-green"
										placeholder="Enter your password"
										required
									/>
									<button
										type="button"
										onClick={togglePasswordVisibility}
										className="absolute inset-y-0 right-0 pr-3 flex items-center text-accent-subtle-gray hover:text-accent-dark-green"
									>
										{showPassword ? (
											<EyeOff className="h-4 w-4" />
										) : (
											<Eye className="h-4 w-4" />
										)}
									</button>
								</div>

								{/* Password Strength Indicator */}
								{formData.password && (
									<div className="space-y-2">
										<div className="flex justify-between items-center">
											<Label className="text-xs text-accent-dark-green">
												Password Strength
											</Label>
											<span
												className={`text-xs font-semibold ${
													passwordStrength < 30
														? "text-red-500"
														: passwordStrength < 60
														? "text-yellow-500"
														: "text-green-500"
												}`}
											>
												{getStrengthText()}
											</span>
										</div>
										<Progress
											value={passwordStrength}
											className="h-2 bg-gray-200"
											indicatorClassName={
												passwordStrength < 30
													? "bg-red-500"
													: passwordStrength < 60
													? "bg-yellow-500"
													: "bg-green-500"
											}
										/>
										<div className="grid grid-cols-2 gap-x-4 text-xs text-accent-dark-brown mt-1">
											{passwordRequirements.map((req) => (
												<div
													key={req.id}
													className="flex items-center"
												>
													{req.test(formData.password) ? (
														<Check className="h-3 w-3 text-green-500 mr-1" />
													) : (
														<X className="h-3 w-3 text-red-500 mr-1" />
													)}
													<span>{req.label}</span>
												</div>
											))}
										</div>
									</div>
								)}

								{errors.password && (
									<p className="text-red-500 text-xs mt-1">{errors.password}</p>
								)}
							</div>

							{/* Confirm Password Field */}
							<div className="space-y-2">
								<Label
									htmlFor="confirm_password"
									className="text-sm font-medium text-accent-dark-green"
								>
									Confirm Password
								</Label>
								<div className="relative">
									<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
										<Lock className="h-4 w-4 text-accent-subtle-gray" />
									</div>
									<Input
										id="confirm_password"
										name="confirm_password"
										type={showPassword ? "text" : "password"}
										value={formData.confirm_password}
										onChange={handleChange}
										className="pl-10 bg-white text-accent-dark-brown border-accent-subtle-gray focus:ring-primary-green focus:border-primary-green"
										placeholder="Confirm your password"
										required
									/>
								</div>
								{errors.confirm_password && (
									<p className="text-red-500 text-xs mt-1">
										{errors.confirm_password}
									</p>
								)}
							</div>

							{/* Rewards Opt-in */}
							<div className="flex items-start space-x-3">
								<Checkbox
									id="is_rewards_opted_in"
									name="is_rewards_opted_in"
									checked={formData.is_rewards_opted_in}
									onCheckedChange={(checked) =>
										handleChange({
											target: {
												name: "is_rewards_opted_in",
												value: checked,
												type: "checkbox",
												checked,
											},
										})
									}
									className="mt-1"
								/>
								<div className="grid gap-1.5 leading-none">
									<label
										htmlFor="is_rewards_opted_in"
										className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-accent-dark-brown"
									>
										Join our rewards program for exclusive offers
									</label>
									<p className="text-xs text-muted-foreground">
										Get points on every order and redeem for discounts.
									</p>
								</div>
							</div>

							{/* Terms and Conditions */}
							<div className="flex items-start space-x-3">
								<Checkbox
									id="terms"
									checked={agreeToTerms}
									onCheckedChange={setAgreeToTerms}
									className="mt-1"
								/>
								<div className="grid gap-1.5 leading-none">
									<label
										htmlFor="terms"
										className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-accent-dark-brown"
									>
										I agree to the TermsOfService and PrivacyPolicy
									</label>
									{errors.terms && (
										<p className="text-red-500 text-xs mt-1">{errors.terms}</p>
									)}
								</div>
							</div>

							{/* Create Account Button */}
							<Button
								type="submit"
								disabled={isLoading}
								className="w-full bg-primary-green hover:bg-accent-dark-green text-accent-light-beige font-medium py-2 px-4 rounded-md transition-colors"
							>
								{isLoading ? "Creating Account..." : "Create Account"}
							</Button>

							{/* OR Divider */}
							<div className="relative">
								<div className="absolute inset-0 flex items-center">
									<div className="w-full border-t border-accent-subtle-gray/50" />
								</div>
								<div className="relative flex justify-center text-xs">
									<span className="bg-accent-light-beige px-2 text-accent-dark-brown">
										OR
									</span>
								</div>
							</div>

							{/* Google OAuth Button */}
							<GoogleOAuthButton 
								mode="register"
								disabled={isLoading}
							/>

							{/* Login Link */}
							<div className="text-center">
								<p className="text-sm text-accent-dark-brown">
									Already have an account?{" "}
									<Link
										to="/login"
										className="text-primary-green hover:text-accent-dark-green font-medium underline"
									>
										Sign in here
									</Link>
								</p>
							</div>
						</form>
					</CardContent>
				</Card>
			</motion.div>
		</div>
	);
};

export default RegisterForm;
