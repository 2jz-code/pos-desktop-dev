import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import authAPI from "@/api/auth";
import { isValidEmail } from "@ajeen/ui";

const ForgotPasswordForm = () => {
	const [email, setEmail] = useState("");
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [emailSent, setEmailSent] = useState(false);

	const handleSubmit = async (event) => {
		event.preventDefault();
		setError("");

		if (!email.trim()) {
			setError("Please enter your email address");
			return;
		}

		// Email validation using shared utility
		if (!isValidEmail(email)) {
			setError("Please enter a valid email address");
			return;
		}

		setIsLoading(true);

		try {
			await authAPI.requestPasswordReset(email);
			setEmailSent(true);
		} catch (err) {
			console.error("Password reset error:", err);
			setError(
				err.response?.data?.message || 
				"Unable to send password reset email. Please try again."
			);
		} finally {
			setIsLoading(false);
		}
	};

	if (emailSent) {
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
							Check Your Email
						</h1>
						<p className="text-accent-dark-brown/70 mt-4 leading-relaxed">
							We've sent a password reset link to <strong>{email}</strong>.
							Click the link in the email to reset your password.
						</p>
					</div>

					<Card className="border-accent-subtle-gray/30">
						<CardContent className="p-6 space-y-4">
							<Alert>
								<Mail className="h-4 w-4" />
								<AlertDescription>
									<strong>Didn't receive the email?</strong>
									<ul className="mt-2 text-sm list-disc list-inside space-y-1">
										<li>Check your spam or junk folder</li>
										<li>Make sure the email address is correct</li>
										<li>The link will expire in 24 hours</li>
									</ul>
								</AlertDescription>
							</Alert>

							<div className="flex flex-col space-y-3">
								<Button
									onClick={() => {
										setEmailSent(false);
										setEmail("");
									}}
									variant="outline"
									className="w-full"
								>
									Try a Different Email
								</Button>
								<Link to="/login">
									<Button variant="outline" className="w-full">
										<ArrowLeft className="mr-2 h-4 w-4" />
										Back to Login
									</Button>
								</Link>
							</div>
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
						Reset Your Password
					</h1>
					<p className="text-accent-dark-brown/70 mt-4">
						Enter your email address and we'll send you a link to reset your password.
					</p>
				</div>

				<Card className="border-accent-subtle-gray/30">
					<CardContent className="p-6">
						<form onSubmit={handleSubmit} className="space-y-6">
							{error && (
								<Alert variant="destructive">
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							)}

							<div className="space-y-2">
								<Label htmlFor="email" className="text-accent-dark-brown">
									Email Address
								</Label>
								<div className="relative">
									<Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-accent-dark-brown/50 h-5 w-5" />
									<Input
										id="email"
										type="email"
										placeholder="Enter your email address"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										className="pl-10 border-accent-subtle-gray focus:border-primary-green"
										disabled={isLoading}
										autoComplete="email"
									/>
								</div>
							</div>

							<Button
								type="submit"
								className="w-full bg-primary-green hover:bg-accent-dark-green text-white"
								disabled={isLoading}
							>
								{isLoading ? "Sending Reset Link..." : "Send Reset Link"}
							</Button>

							<div className="text-center">
								<Link
									to="/login"
									className="text-primary-green hover:text-accent-dark-green font-medium inline-flex items-center"
								>
									<ArrowLeft className="mr-2 h-4 w-4" />
									Back to Login
								</Link>
							</div>
						</form>
					</CardContent>
				</Card>

				<div className="text-center text-sm text-accent-dark-brown/60">
					Don't have an account?{" "}
					<Link
						to="/register"
						className="text-primary-green hover:text-accent-dark-green font-medium"
					>
						Sign up here
					</Link>
				</div>
			</div>
		</div>
	);
};

export default ForgotPasswordForm;