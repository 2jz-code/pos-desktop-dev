import React from "react";
import { useParams, useLocation, Navigate } from "react-router-dom";
import LoginForm from "@/components/auth/LoginForm";
import RegisterForm from "@/components/auth/RegisterForm";
import SEO from "@/components/SEO";

const AuthPage = () => {
	const { mode } = useParams();
	const location = useLocation();

	// Determine mode from URL
	let currentMode = mode;
	if (!currentMode) {
		if (location.pathname === "/login") {
			currentMode = "login";
		} else if (location.pathname === "/register") {
			currentMode = "register";
		}
	}

	// Redirect to login by default
	if (!currentMode || (currentMode !== "login" && currentMode !== "register")) {
		return (
			<Navigate
				to="/login"
				replace
			/>
		);
	}

	const isLogin = currentMode === "login";

	return (
		<main>
			<SEO
				title={isLogin ? "Login - Ajeen" : "Create Account - Ajeen"}
				description={
					isLogin
						? "Access your Ajeen account. Log in to place an order, view your order history, and manage your profile."
						: "Create an account with Ajeen to easily order your favorite Middle Eastern dishes online, track your orders, and save your preferences."
				}
				robots="noindex, nofollow"
			/>
			{isLogin && <LoginForm />}
			{currentMode === "register" && <RegisterForm />}
		</main>
	);
};

export default AuthPage;
