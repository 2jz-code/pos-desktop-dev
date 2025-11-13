import apiClient from "@/services/api/client";

export const loginWithEmail = (email, password) => {
	// Use new admin login endpoint with tenant discovery
	return apiClient.post("/users/login/admin/", { email, password });
};

export const selectTenant = (email, password, tenant_id) => {
	return apiClient.post("/users/login/admin/select-tenant/", {
		email,
		password,
		tenant_id
	});
};

export const logout = () => {
	return apiClient.post("/users/logout/");
};

export const checkAuthStatus = () => {
	return apiClient.get("/users/me/");
};
