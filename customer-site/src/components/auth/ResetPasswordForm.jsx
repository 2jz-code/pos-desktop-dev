import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import authAPI from "@/api/auth";

const ResetPasswordForm = () => {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	
	const [token, setToken] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [showNewPassword, setShowNewPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [resetSuccess, setResetSuccess] = useState(false);
	const [passwordStrength, setPasswordStrength] = useState(0);

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
		// Get token from URL parameters
		const tokenParam = searchParams.get("token");
		if (tokenParam) {
			setToken(tokenParam);
		} else {
			setError("Invalid reset link. Please request a new password reset.");
		}
	}, [searchParams]);

	useEffect(() => {
		// Clear errors when user types
		if (error) setError("");
	}, [newPassword, confirmPassword]);

	useEffect(() => {
		if (newPassword) {
			const passedTests = passwordRequirements.filter((req) =>
				req.test(newPassword)
			).length;
			setPasswordStrength((passedTests / passwordRequirements.length) * 100);
		} else {
			setPasswordStrength(0);
		}
	}, [newPassword, passwordRequirements]);

	const getStrengthText = () => {
		if (passwordStrength < 30) return "Weak";
		if (passwordStrength < 60) return "Medium";
		return "Strong";
	};

	const validatePassword = (password) => {
		const minLength = 8;
		const hasUpperCase = /[A-Z]/.test(password);
		const hasLowerCase = /[a-z]/.test(password);
		const hasNumbers = /\d/.test(password);
		const hasSpecialChar = /[^A-Za-z0-9]/.test(password);
		
		if (password.length < minLength) {
			return "Password must be at least 8 characters long";
		}
		if (!hasUpperCase) {
			return "Password must contain at least one uppercase letter";
		}
		if (!hasLowerCase) {
			return "Password must contain at least one lowercase letter";
		}
		if (!hasNumbers) {
			return "Password must contain at least one number";
		}
		if (!hasSpecialChar) {
			return "Password must contain at least one special character";
		}
		return null;
	};

	const handleSubmit = async (event) => {
		event.preventDefault();
		setError("");

		if (!token) {
			setError("Invalid reset token. Please request a new password reset.");
			return;
		}

		if (!newPassword.trim()) {
			setError("Please enter a new password");
			return;
		}

		// Validate password strength
		const passwordError = validatePassword(newPassword);
		if (passwordError) {
			setError(passwordError);
			return;
		}

		if (newPassword !== confirmPassword) {
			setError("Passwords don't match");
			return;
		}

		setIsLoading(true);

		try {
			await authAPI.confirmPasswordReset(token, newPassword);
			setResetSuccess(true);
			// Redirect to login after 3 seconds
			setTimeout(() => {
				navigate("/login", { 
					state: { message: "Password reset successful! Please log in with your new password." }
				});
			}, 3000);
		} catch (err) {
			console.error("Password reset error:", err);
			const errorMessage = err.response?.data?.error || 
				err.response?.data?.message || 
				"Unable to reset password. Please try again or request a new reset link.";
			setError(errorMessage);
		} finally {
			setIsLoading(false);
		}
	};

	if (resetSuccess) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center p-4">
				<div className="max-w-md w-full space-y-8">
					<div className="text-center">
						<div className="flex justify-center mb-6">
							<div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
								<CheckCircle className="w-8 h-8 text-green-600" />
							</div>
						</div>
						<h1 className="text-3xl font-bold text-accent-dark-green">
							Password Reset Successful!
						</h1>
						<p className="text-accent-dark-brown/70 mt-4">
							Your password has been reset successfully. 
							You will be redirected to the login page in a few seconds.
						</p>
					</div>

					<Card className="border-accent-subtle-gray/30">
						<CardContent className="p-6">
							<Link to="/login">
								<Button className="w-full bg-primary-green hover:bg-accent-dark-green text-white">
									Continue to Login
								</Button>
							</Link>
						</CardContent>
					</Card>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-background flex items-center justify-center p-4">
			<div className="max-w-md w-full space-y-8">
				<div className="text-center">
					<h1 className="text-3xl font-bold text-accent-dark-green">
						Set New Password
					</h1>
					<p className="text-accent-dark-brown/70 mt-4">
						Enter your new password below to complete the reset process.
					</p>
				</div>

				<Card className="border-accent-subtle-gray/30">
					<CardContent className="p-6">
						{!token && (
							<Alert variant="destructive" className="mb-6">
								<AlertCircle className="h-4 w-4" />
								<AlertDescription>
									This password reset link is invalid or has expired. 
									Please <Link to="/forgot-password" className="underline">request a new one</Link>.
								</AlertDescription>
							</Alert>
						)}

						<form onSubmit={handleSubmit} className="space-y-6">
							{error && (
								<Alert variant="destructive">
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							)}

							<div className="space-y-2">
								<Label htmlFor="new-password" className="text-accent-dark-brown">
									New Password
								</Label>
								<div className="relative">
									<Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-accent-dark-brown/50 h-5 w-5" />
									<Input
										id="new-password"
										type={showNewPassword ? "text" : "password"}
										placeholder="Enter your new password"
										value={newPassword}
										onChange={(e) => setNewPassword(e.target.value)}
										className="pl-10 pr-10 border-accent-subtle-gray focus:border-primary-green"
										disabled={isLoading || !token}
									/>
									<button
										type="button"
										onClick={() => setShowNewPassword(!showNewPassword)}
										className="absolute right-3 top-1/2 transform -translate-y-1/2 text-accent-dark-brown/50 hover:text-accent-dark-brown"
									>
										{showNewPassword ? (
											<EyeOff className="h-5 w-5" />
										) : (
											<Eye className="h-5 w-5" />
										)}
									</button>
								</div>
								{newPassword && (
									<div className="space-y-2">
										<div className="flex justify-between items-center">
											<Label className="text-sm text-accent-dark-brown">
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
													{req.test(newPassword) ? (
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
							</div>

							<div className="space-y-2">
								<Label htmlFor="confirm-password" className="text-accent-dark-brown">
									Confirm New Password
								</Label>
								<div className="relative">
									<Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-accent-dark-brown/50 h-5 w-5" />
									<Input
										id="confirm-password"
										type={showConfirmPassword ? "text" : "password"}
										placeholder="Confirm your new password"
										value={confirmPassword}
										onChange={(e) => setConfirmPassword(e.target.value)}
										className="pl-10 pr-10 border-accent-subtle-gray focus:border-primary-green"
										disabled={isLoading || !token}
									/>
									<button
										type="button"
										onClick={() => setShowConfirmPassword(!showConfirmPassword)}
										className="absolute right-3 top-1/2 transform -translate-y-1/2 text-accent-dark-brown/50 hover:text-accent-dark-brown"
									>
										{showConfirmPassword ? (
											<EyeOff className="h-5 w-5" />
										) : (
											<Eye className="h-5 w-5" />
										)}
									</button>
								</div>
							</div>

							<Button
								type="submit"
								className="w-full bg-primary-green hover:bg-accent-dark-green text-white"
								disabled={isLoading || !token}
							>
								{isLoading ? "Resetting Password..." : "Reset Password"}
							</Button>

							<div className="text-center">
								<Link
									to="/login"
									className="text-primary-green hover:text-accent-dark-green font-medium"
								>
									Back to Login
								</Link>
							</div>
						</form>
					</CardContent>
				</Card>
			</div>
		</div>
	);
};

export default ResetPasswordForm;