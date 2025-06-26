import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Layout from "./components/layout/Layout";
import { QueryProvider } from "./providers/QueryProvider";
import { CartSidebarProvider } from "./contexts/CartSidebarContext";
import { AuthProvider } from "./contexts/AuthContext";

// Import pages
import HomePage from "./pages/home/index.jsx";
import MenuPage from "./pages/menu/index.jsx";
import ProductDetailsPage from "./pages/menu/components/ProductDetailsPage";
import AuthPage from "./pages/AuthPage";
import CheckoutPage from "./pages/CheckoutPage";
import NotFoundPage from "./pages/NotFoundPage";
import DashboardPage from "./pages/DashboardPage";

function App() {
	return (
		<QueryProvider>
			<AuthProvider>
				<Router>
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
									{/* Authentication routes */}
									<Route
										path="/login"
										element={<AuthPage />}
									/>
									<Route
										path="/register"
										element={<AuthPage />}
									/>
									<Route
										path="/checkout"
										element={<CheckoutPage />}
									/>
									<Route
										path="/dashboard"
										element={<DashboardPage />}
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
				</Router>
			</AuthProvider>
		</QueryProvider>
	);
}

export default App;
