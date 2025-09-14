import React, { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { authAPI } from "../../api/auth";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Button } from "../ui/button";
import { FcGoogle } from "react-icons/fc";
import { useAuth } from "../../contexts/AuthContext";

const GoogleOAuthButton = ({
	mode = "login", // 'login', 'register', or 'link'
	onSuccess,
	onError,
	className = "",
	disabled = false,
}) => {
	const [isLoading, setIsLoading] = useState(false);
	const navigate = useNavigate();
	const { setUser, setIsAuthenticated } = useAuth();

	const handleGoogleSuccess = async (credentialResponse) => {
		setIsLoading(true);

		try {
			let response;

			if (mode === "link") {
				// Link Google account to existing customer account
				response = await authAPI.linkGoogleAccount(
					credentialResponse.credential
				);
				toast.success(
					response.message || "Google account linked successfully!"
				);

				if (onSuccess) {
					onSuccess(response);
				}
			} else {
				// Login/Register with Google
				response = await authAPI.googleLogin(credentialResponse.credential);

				if (response.customer) {
					// Update auth context with customer data
					setUser(response.customer);
					setIsAuthenticated(true);
				}

				if (response.is_new_customer) {
					toast.success("Welcome! Your account has been created successfully.");
				} else {
					toast.success("Welcome back!");
				}

				if (onSuccess) {
					onSuccess(response);
				} else {
					// Default redirect behavior
					navigate("/");
				}
			}
		} catch (error) {
			console.error("Google OAuth error:", error);

			const errorMessage =
				error.response?.data?.error ||
				error.message ||
				"Authentication failed. Please try again.";

			toast.error(errorMessage);

			if (onError) {
				onError(error);
			}
		} finally {
			setIsLoading(false);
		}
	};

	const handleGoogleError = (error) => {
		console.error("Google OAuth failed:", error);
		toast.error("Google authentication failed. Please try again.");

		if (onError) {
			onError(error);
		}
	};

	// Custom button for linking mode
	if (mode === "link") {
		return (
			<div className={`w-full ${className}`}>
				<GoogleLogin
					onSuccess={handleGoogleSuccess}
					onError={handleGoogleError}
					useOneTap={false}
					render={({ onClick, disabled: googleDisabled }) => (
						<Button
							type="button"
							variant="outline"
							className="w-full flex items-center justify-center gap-2 py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
							onClick={onClick}
							disabled={disabled || googleDisabled || isLoading}
						>
							<FcGoogle className="w-4 h-4" />
							{isLoading ? "Linking..." : "Link Google Account"}
						</Button>
					)}
				/>
			</div>
		);
	}

	const buttonText =
		mode === "register"
			? isLoading
				? "Creating account..."
				: "Sign up with Google"
			: isLoading
			? "Signing in..."
			: "Sign in with Google";

	return (
		<div className={`w-full ${className}`}>
			<GoogleLogin
				onSuccess={handleGoogleSuccess}
				onError={handleGoogleError}
				useOneTap={true}
				auto_select={false}
				render={({ onClick, disabled: googleDisabled }) => (
					<Button
						type="button"
						variant="outline"
						className="w-full flex items-center justify-center gap-2 py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
						onClick={onClick}
						disabled={disabled || googleDisabled || isLoading}
					>
						<FcGoogle className="w-4 h-4" />
						{buttonText}
					</Button>
				)}
			/>
		</div>
	);
};

export default GoogleOAuthButton;
