import apiClient from "@/services/api/client";

export const loginWithEmail = (email, password) => {
	return apiClient.post("/users/login/web/", { email, password });
};

export const logout = () => {
	return apiClient.post("/users/logout/");
};

export const checkAuthStatus = () => {
	return apiClient.get("/users/me/");
};
