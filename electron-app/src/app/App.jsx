import React, { useEffect } from "react";
import {
	HashRouter as Router,
	Routes,
	Route,
	Navigate,
	useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { QueryProvider } from "../providers/QueryProvider";

// Import from domains using new structure
import { useCustomerTipListener } from "@/domains/pos";
import { useSettingsStore } from "@/domains/settings";

// Import Components and Pages from new structure
import { FullScreenLoader, Layout } from "@/shared";
import { Toaster } from "@/shared/components/ui/toaster";
import { AnimatedOutlet } from "../components/animations/AnimatedOutlet";

// Domain Pages
import { LoginPage } from "@/domains/auth";
import { DashboardPage } from "@/domains/dashboard";
import { POSPage } from "@/domains/pos";
import { OrdersPage, OrderDetailsPage } from "@/domains/orders";
import { PaymentsPage, PaymentDetailsPage } from "@/domains/payments";
import { UsersPage } from "@/domains/users";
import { ProductsPage } from "@/domains/products";
import { InventoryPage } from "@/domains/inventory";
import { DiscountsPage } from "@/domains/discounts";
import { SettingsPage } from "@/domains/settings";

// Shared Components
import { RoleProtectedRoute } from "../components/RoleProtectedRoute";

/**
 * This is the root component that sets up all the providers
 * and runs the one-time application initialization logic.
 */
function App() {
	// This hook will run ONCE when the app component mounts.
	useEffect(() => {
		console.log("App mounted. Running initialization logic...");
		// 1. Ensure a device ID exists after the store has been hydrated from localStorage.
		useSettingsStore.getState().ensurePosDeviceId();
		// 2. Fetch global settings from the server.
		useSettingsStore.getState().fetchSettings();
	}, []); // The empty dependency array `[]` is crucial. It ensures this runs only once.

	return (
		<AuthProvider>
			<QueryProvider>
				<Router>
					<AppRoutes />
					<Toaster />
				</Router>
			</QueryProvider>
		</AuthProvider>
	);
}

const PrivateRoute = ({ children }) => {
	const { isAuthenticated, loading } = useAuth(); // Changed `user` to `isAuthenticated` for consistency
	if (loading) {
		return <FullScreenLoader />;
	}
	return isAuthenticated ? (
		children
	) : (
		<Navigate
			to="/login"
			replace
		/>
	);
};

function AppRoutes() {
	const { isAuthenticated, loading } = useAuth();
	const location = useLocation();

	// This hook sets up a global listener and is safe to call on re-renders.
	useCustomerTipListener();

	if (loading) {
		return <FullScreenLoader />;
	}

	// This logic handles routing for unauthenticated users.
	if (!isAuthenticated && location.pathname !== "/login") {
		return (
			<Navigate
				to="/login"
				replace
			/>
		);
	}

	// This logic handles routing for authenticated users trying to access login page.
	if (isAuthenticated && location.pathname === "/login") {
		return (
			<Navigate
				to="/"
				replace
			/>
		);
	}

	// Main routing structure
	return (
		<Routes>
			<Route
				path="/login"
				element={<LoginPage />}
			/>
			<Route
				path="/*"
				element={
					<PrivateRoute>
						<Layout>
							<AnimatedOutlet />
						</Layout>
					</PrivateRoute>
				}
			>
				{/* Nested routes are rendered inside AnimatedOutlet */}
				<Route
					index
					element={<DashboardPage />} // Accessible to all authenticated users
				/>
				<Route
					path="pos"
					element={<POSPage />} // POS is accessible to all authenticated users
				/>
				<Route
					path="orders"
					element={<OrdersPage />} // Accessible to all (cashiers need to resume held orders)
				/>
				<Route
					path="orders/:orderId"
					element={<OrderDetailsPage />} // Accessible to all (cashiers need to resume held orders)
				/>
				<Route
					path="payments"
					element={
						<RoleProtectedRoute
							requiredPermission={(p) => p.canAccessPayments()}
						>
							<PaymentsPage />
						</RoleProtectedRoute>
					}
				/>
				<Route
					path="payments/:paymentId"
					element={
						<RoleProtectedRoute
							requiredPermission={(p) => p.canAccessPayments()}
						>
							<PaymentDetailsPage />
						</RoleProtectedRoute>
					}
				/>
				<Route
					path="users"
					element={
						<RoleProtectedRoute requiredPermission={(p) => p.canAccessUsers()}>
							<UsersPage />
						</RoleProtectedRoute>
					}
				/>
				<Route
					path="products"
					element={<ProductsPage />} // Accessible to all (cashiers need to view products)
				/>
				<Route
					path="inventory"
					element={
						<RoleProtectedRoute
							requiredPermission={(p) => p.canAccessProducts()}
						>
							<InventoryPage />
						</RoleProtectedRoute>
					}
				/>
				<Route
					path="discounts"
					element={
						<RoleProtectedRoute
							requiredPermission={(p) => p.canAccessDiscounts()}
						>
							<DiscountsPage />
						</RoleProtectedRoute>
					}
				/>
				<Route
					path="settings"
					element={<SettingsPage />} // Settings has internal role protection
				/>
				<Route
					path="*"
					element={
						<Navigate
							to="/"
							replace
						/>
					}
				/>
			</Route>
		</Routes>
	);
}

export default App;
