import apiClient from "@/shared/lib/apiClient";

export const getTaxes = (params = {}) => {
  return apiClient.get("/products/taxes/", { params });
};

export const createTax = (data) => {
  // data: { name: string, rate: number|string }
  return apiClient.post("/products/taxes/", data);
};

export const updateTax = (id, data) => {
  return apiClient.put(`/products/taxes/${id}/`, data);
};

export const deleteTax = (id) => {
  return apiClient.delete(`/products/taxes/${id}/`);
};
