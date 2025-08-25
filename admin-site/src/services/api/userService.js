import apiClient from "@/services/api/client";

// User API service
export const getUsers = (params = {}) => {
	return apiClient.get("/users/", { params });
};

export const getUserById = (id) => {
	return apiClient.get(`/users/${id}/`);
};

export const createUser = (userData) => {
	return apiClient.post("/users/", userData);
};

export const updateUser = (id, userData) => {
	return apiClient.put(`/users/${id}/`, userData);
};

// Temporary: Keep deleteUser for the .jsx file until we fully transition to archiving
export const deleteUser = (id) => {
	return apiClient.delete(`/users/${id}/`);
};

export const archiveUser = (id) => {
	return apiClient.post(`/users/${id}/archive/`);
};

export const unarchiveUser = (id) => {
	return apiClient.post(`/users/${id}/unarchive/`);
};

export const setPin = (userId, pinData) => {
	return apiClient.post(`/users/${userId}/set-pin/`, pinData);
};
