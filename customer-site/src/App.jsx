import React, { Suspense } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Toaster } from "sonner";
import { LazyMotion, domAnimation } from "framer-motion";
import Layout from "./components/layout/Layout";
import AuthContextProvider from "@/contexts/AuthContext";
import CartSidebarProvider from "@/contexts/CartSidebarContext";
import DashboardProvider from "@/contexts/DashboardContext";
import StoreStatusProvider from "@/contexts/StoreStatusContext";

// Lazy load route components for better performance
const HomePage = React.lazy(() => import("@/pages/home"));
const MenuPage = React.lazy(() => import("@/pages/menu"));
const CheckoutPage = React.lazy(() => import("@/pages/CheckoutPage"));
const LoginForm = React.lazy(() => import("@/components/auth/LoginForm"));
const RegisterForm = React.lazy(() => import("@/components/auth/RegisterForm"));
const ForgotPasswordForm = React.lazy(() => import("@/components/auth/ForgotPasswordForm"));
const ResetPasswordForm = React.lazy(() => import("@/components/auth/ResetPasswordForm"));
const DashboardPage = React.lazy(() => import("@/pages/DashboardPage"));
const ConfirmationPage = React.lazy(() => import("@/pages/ConfirmationPage"));
const LocationsPage = React.lazy(() => import("@/pages/LocationsPage"));
const NotFoundPage = React.lazy(() => import("@/pages/NotFoundPage"));
const ProductDetailsPage = React.lazy(() =>
	import("@/pages/menu/components/ProductDetailsPage")
);

// Loading fallback component
const PageSkeleton = () => (
	<div className="min-h-screen bg-background">
		<div className="animate-pulse">
			{/* Header skeleton */}
			<div className="h-16 bg-muted/50 border-b"></div>

			{/* Content skeleton */}
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
				<div className="space-y-6">
					<div className="h-8 bg-muted/50 rounded w-1/4"></div>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
						{[...Array(6)].map((_, i) => (
							<div
								key={i}
								className="bg-muted/30 rounded-lg h-64"
							></div>
						))}
					</div>
				</div>
			</div>
		</div>
	</div>
);

// Create a stable query client
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 5 * 60 * 1000, // 5 minutes
			cacheTime: 10 * 60 * 1000, // 10 minutes
			retry: (failureCount, error) => {
				// Don't retry on 4xx errors
				if (error?.response?.status >= 400 && error?.response?.status < 500) {
					return false;
				}
				return failureCount < 3;
			},
		},
		mutations: {
			retry: 1,
		},
	},
});

function App() {
	return (
		<GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
			<QueryClientProvider client={queryClient}>
				<AuthContextProvider>
					<StoreStatusProvider>
						<CartSidebarProvider>
							<DashboardProvider>
								<LazyMotion features={domAnimation}>
									<Router>
										<Layout>
											<Suspense fallback={<PageSkeleton />}>
												<Routes>
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
														path="/product/:productName/edit/:cartItemId"
														element={<ProductDetailsPage />}
													/>
													<Route
														path="/checkout"
														element={<CheckoutPage />}
													/>
													<Route
														path="/login"
														element={<LoginForm />}
													/>
													<Route
														path="/register"
														element={<RegisterForm />}
													/>
													<Route
														path="/forgot-password"
														element={<ForgotPasswordForm />}
													/>
													<Route
														path="/reset-password"
														element={<ResetPasswordForm />}
													/>
													<Route
														path="/dashboard/*"
														element={<DashboardPage />}
													/>
													<Route
														path="/confirmation/:orderId"
														element={<ConfirmationPage />}
													/>
													<Route
														path="/locations"
														element={<LocationsPage />}
													/>
													<Route
														path="*"
														element={<NotFoundPage />}
													/>
												</Routes>
											</Suspense>
										</Layout>
									</Router>
								</LazyMotion>
							</DashboardProvider>
						</CartSidebarProvider>
					</StoreStatusProvider>
				</AuthContextProvider>

				{/* Toast notifications */}
				<Toaster
					position="bottom-left"
					richColors
					closeButton
					toastOptions={{
						duration: 1500,
						className:
							"group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
					}}
				/>

				{/* React Query DevTools - only in development */}
				{import.meta.env.DEV && (
					<ReactQueryDevtools
						initialIsOpen={false}
						position="bottom-right"
					/>
				)}
			</QueryClientProvider>
		</GoogleOAuthProvider>
	);
}

export default App;
