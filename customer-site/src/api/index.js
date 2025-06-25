// Main API exports
export { default as apiClient } from "./client";

// Import and re-export with both default and named exports
import productsAPI from "./products";
import ordersAPI from "./orders";
import authAPI from "./auth";
import paymentsAPI from "./payments";

export { productsAPI, ordersAPI, authAPI, paymentsAPI };

// Named exports for convenience
export {
	productsAPI as products,
	ordersAPI as orders,
	authAPI as auth,
	paymentsAPI as payments,
};
