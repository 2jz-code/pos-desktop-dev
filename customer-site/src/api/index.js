// Main API exports
export { default as apiClient } from "./client";

// Import and re-export with both default and named exports
import productsAPI from "./products";
import ordersAPI from "./orders";
import authAPI from "./auth";
import paymentsAPI from "./payments";
import settingsAPI from "./settings";

export { productsAPI, ordersAPI, authAPI, paymentsAPI, settingsAPI };

// Named exports for convenience
export {
	productsAPI as products,
	ordersAPI as orders,
	authAPI as auth,
	paymentsAPI as payments,
};
