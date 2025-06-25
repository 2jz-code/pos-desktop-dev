import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "@/components/ui/sonner";
import Layout from "./components/layout/Layout";
import { CartProvider } from "./contexts/CartContext";
import { CartSidebarProvider } from "./contexts/CartSidebarContext";
import { AuthProvider } from "./contexts/AuthContext";

// Import pages
import HomePage from "./pages/home/index.jsx";
import MenuPage from "./pages/menu/index.jsx";
import ProductDetailsPage from "./pages/menu/components/ProductDetailsPage";
import AuthPage from "./pages/AuthPage";
import CheckoutPage from "./pages/CheckoutPage";
import NotFoundPage from "./pages/NotFoundPage";
// Create a query client for React Query
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: 2,
			staleTime: 5 * 60 * 1000, // 5 minutes
			cacheTime: 10 * 60 * 1000, // 10 minutes
		},
	},
});

function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<AuthProvider>
				<Router>
					<CartProvider>
						<CartSidebarProvider>
							<div className="App">
								<Layout>
									<Routes>
										{/* Public routes */}
										<Route
											path="/"
											element={<HomePage />}
										/>
										<Route
											path="/menu"
											element={<MenuPage />}
										/>
										<Route
											path="/product/:productName"
											element={<ProductDetailsPage />}
										/>
										<Route
											path="/auth"
											element={<AuthPage />}
										/>
										<Route
											path="/checkout"
											element={<CheckoutPage />}
										/>

										{/* Catch all route for 404 */}
										<Route
											path="*"
											element={<NotFoundPage />}
										/>
									</Routes>
								</Layout>

								{/* Global toast notifications */}
								<Toaster />
							</div>
						</CartSidebarProvider>
					</CartProvider>
				</Router>
			</AuthProvider>

			{/* React Query DevTools - only in development */}
			{import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
		</QueryClientProvider>
	);
}

export default App;
