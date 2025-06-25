import apiClient from "@/shared/lib/apiClient";

export const loginWithPin = (username, pin) => {
	return apiClient.post("/users/login/pos/", { username, pin });
};

export const logout = () => {
	return apiClient.post("/users/logout/");
};

export const checkAuthStatus = () => {
	return apiClient.get("/users/me/");
};
