import React, { useState, useEffect } from "react";
import { motion } from "framer-motion"; // eslint-disable-line
import { Link, useNavigate, useLocation } from "react-router-dom";
import { User, Lock, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import GoogleOAuthButton from "./GoogleOAuthButton";

const LoginForm = () => {
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [error, setError] = useState("");
	const [rememberMe, setRememberMe] = useState(false);

	const navigate = useNavigate();
	const location = useLocation();
	const { login, isLoading, isAuthenticated } = useAuth();

	useEffect(() => {
		if (isAuthenticated) {
			const from = location.state?.from?.pathname || "/";
			navigate(from);
		}
	}, [isAuthenticated, navigate, location.state]);

	useEffect(() => {
		if (error) setError("");
	}, [username, password]);

	const handleLogin = async (event) => {
		event.preventDefault();
		setError("");

		if (!username.trim() || !password.trim()) {
			setError("Please enter both username/email and password");
			return;
		}

		const result = await login({
			username,
			password,
			remember_me: rememberMe,
		});

		if (!result.success) {
			setError(result.error);
		}
	};

	const togglePasswordVisibility = () => {
		setShowPassword(!showPassword);
	};

	return (
		// Main background: Gradient using our theme colors
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

			{/* Login Form Card */}
			<motion.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.5 }}
				className="max-w-md w-full mx-auto px-6"
			>
				<Card className="bg-accent-light-beige border-accent-subtle-gray/50 shadow-xl">
					<CardContent className="p-8">
						<h2 className="text-2xl font-bold text-accent-dark-green mb-6 text-center">
							Welcome Back
						</h2>

						{error && (
							<motion.div
								initial={{ opacity: 0, y: -10 }}
								animate={{ opacity: 1, y: 0 }}
								className="mb-6"
							>
								<Alert variant="destructive">
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							</motion.div>
						)}

						<form
							onSubmit={handleLogin}
							className="space-y-6"
						>
							{/* Username/Email Field */}
							<div className="space-y-2">
								<Label
									htmlFor="username"
									className="text-sm font-medium text-accent-dark-green"
								>
									Username or Email
								</Label>
								<div className="relative">
									<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
										<User className="h-4 w-4 text-accent-subtle-gray" />
									</div>
									<Input
										id="username"
										type="text"
										value={username}
										onChange={(e) => setUsername(e.target.value)}
										className="pl-10 bg-white text-accent-dark-brown border-accent-subtle-gray focus:ring-primary-green focus:border-primary-green"
										placeholder="Enter your username or email"
										required
									/>
								</div>
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
										type={showPassword ? "text" : "password"}
										value={password}
										onChange={(e) => setPassword(e.target.value)}
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
							</div>

							{/* Remember Me & Forgot Password */}
							<div className="flex items-center justify-between">
								<div className="flex items-center space-x-2">
									<Checkbox
										id="remember-me"
										checked={rememberMe}
										onCheckedChange={setRememberMe}
									/>
									<Label
										htmlFor="remember-me"
										className="text-sm text-accent-dark-brown cursor-pointer"
									>
										Remember me
									</Label>
								</div>
								<Link
									to="/forgot-password"
									className="text-sm text-primary-green hover:text-accent-dark-green underline"
								>
									Forgot password?
								</Link>
							</div>

							{/* Login Button */}
							<Button
								type="submit"
								disabled={isLoading}
								className="w-full bg-primary-green hover:bg-accent-dark-green text-accent-light-beige font-medium py-2 px-4 rounded-md transition-colors"
							>
								{isLoading ? "Signing in..." : "Sign In"}
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
								mode="login"
								disabled={isLoading}
							/>

							{/* Register Link */}
							<div className="text-center">
								<p className="text-sm text-accent-dark-brown">
									Don't have an account?{" "}
									<Link
										to="/register"
										className="text-primary-green hover:text-accent-dark-green font-medium underline"
									>
										Create one here
									</Link>
								</p>
							</div>

							{/* Guest Checkout Option */}
							<div className="relative">
								<div className="absolute inset-0 flex items-center">
									<div className="w-full border-t border-accent-subtle-gray/50" />
								</div>
							</div>
						</form>
					</CardContent>
				</Card>
			</motion.div>
		</div>
	);
};

export default LoginForm;
