// Products Domain Exports
// This file serves as the main entry point for the products domain

// Components
export { default as ProductCard } from "./components/ProductCard.jsx";

// Pages
export { default as ProductsPage } from "./pages/ProductsPage.jsx";
export { default as ProductDetailsPage } from "./pages/ProductDetailsPage.jsx";

// Services
export * as productService from "./services/productService.js";
export * as categoryService from "./services/categoryService.js";
export * as productTypeService from "./services/productTypeService.js";

// Store
export { createProductSlice } from "./store/productSlice.js";
