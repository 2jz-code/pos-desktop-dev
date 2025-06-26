import React from "react";
import { useParams, useLocation, Navigate } from "react-router-dom";
import LoginForm from "@/components/auth/LoginForm";
import RegisterForm from "@/components/auth/RegisterForm";

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

	return (
		<div>
			{currentMode === "login" && <LoginForm />}
			{currentMode === "register" && <RegisterForm />}
		</div>
	);
};

export default AuthPage;
