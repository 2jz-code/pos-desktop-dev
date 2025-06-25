import apiClient from "@/shared/lib/apiClient";

export const getUsers = () => {
	return apiClient.get("/users/");
};

export const getUserById = (id) => {
	return apiClient.get(`/users/${id}/`);
};

export const createUser = (userData) => {
	return apiClient.post("/users/register/", userData);
};

export const updateUser = (id, userData) => {
	return apiClient.put(`/users/${id}/`, userData);
};

export const deleteUser = (id) => {
	return apiClient.delete(`/users/${id}/`);
};

export const setPin = (userId, pin) => {
	return apiClient.post(`/users/${userId}/set-pin/`, { pin });
};
