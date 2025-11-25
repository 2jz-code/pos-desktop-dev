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
import globalNotificationService from "@/shared/lib/globalNotificationService";

// Import from domains using new structure
import { useCustomerTipListener } from "@/domains/pos";
import { useSettingsStore } from "@/domains/settings/store/settingsStore";

// Import Components and Pages from new structure
import { FullScreenLoader, Layout } from "@/shared";
import { Toaster } from "@/shared/components/ui/toaster";
import { AnimatedOutlet } from "../components/animations/AnimatedOutlet";

// Domain Pages
import { LoginPage, TerminalPairingPage } from "@/domains/auth";
import { DashboardPage } from "@/domains/dashboard";
import { POSPage } from "@/domains/pos";
import { OrdersPage, OrderDetailsPage } from "@/domains/orders";
import { PaymentsPage, PaymentDetailsPage } from "@/domains/payments";
import { UsersPage } from "@/domains/users";
import { ProductsPage, ProductDetailsPage, ModifierManagementPage } from "@/domains/products";
import { InventoryPage, StockHistoryPage } from "@/domains/inventory";
import { DiscountsPage } from "@/domains/discounts";
import { SettingsPage } from "@/domains/settings";

// Shared Components
import { RoleProtectedRoute } from "../components/RoleProtectedRoute";

// Services
import terminalRegistrationService from "@/services/TerminalRegistrationService";
import offlineSyncService from "@/services/OfflineSyncService";
import { initializeOfflineMode } from "@/shared/lib/offlineInitialization";

/**
 * This is the root component that sets up all the providers
 * and runs the one-time application initialization logic.
 */
function AppContent() {
	// This component can be used for logic that needs access to the Auth context
	// but for now, the main initialization is handled in App's useEffect.
	return <AnimatedOutlet />;
}

function App() {
	useEffect(() => {
		console.log("App mounted. Running initialization logic...");

		// Initialize terminal registration and start sync service
		const initializeApp = async () => {
			// Initialize offline mode (preload relation caches)
			await initializeOfflineMode();

			// Initialize terminal registration (must be first - sets location context)
			const terminalConfig = await terminalRegistrationService.initialize();

			// Start offline sync service if terminal is registered
			if (terminalConfig) {
				console.log("🔄 Starting offline sync service...");
				offlineSyncService.start(30000); // Sync every 30 seconds
			} else {
				console.log("⏸️ Terminal not registered - sync service will start after pairing");
			}

			// NON-BLOCKING: Run these in background (don't await)
			// They will update the store when ready, but won't block app rendering
			console.log("🚀 [App] Starting non-blocking initialization tasks...");

			// Fetch settings in background (cached by useOfflineSettings hook)
			useSettingsStore.getState().fetchSettings().catch(err => {
				console.warn("⚠️ [App] Settings fetch failed (will use cache):", err);
			});

			// Discover printers in background
			useSettingsStore.getState().discoverAndSetPrinters().catch(err => {
				console.warn("⚠️ [App] Printer discovery failed:", err);
			});

			// Ensure POS device ID (synchronous, no blocking)
			useSettingsStore.getState().ensurePosDeviceId();

			// Initialize the global notification service (non-blocking)
			globalNotificationService.initialize();

			console.log("✅ [App] Non-blocking tasks started, app ready to render");
		};

		initializeApp();

		// Cleanup on app unmount
		return () => {
			console.log("App unmounting. Stopping offline sync and notification service.");
			offlineSyncService.stop();
			globalNotificationService.disconnect();
		};
	}, []);

	return (
		<QueryProvider>
			<AuthProvider>
				<Router>
					<Toaster />
					<AppRoutes />
				</Router>
			</AuthProvider>
		</QueryProvider>
	);
}

// Higher-order component for private routes
function PrivateRoute({ children }) {
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
}

function AppRoutes() {
	const { isAuthenticated, loading } = useAuth();
	const location = useLocation();

	// This hook sets up a global listener and is safe to call on re-renders.
	useCustomerTipListener();

	if (loading) {
		return <FullScreenLoader />;
	}

	// IMPORTANT: Check if terminal is registered first
	const isTerminalRegistered = terminalRegistrationService.isTerminalRegistered();

	// If terminal is not registered, redirect to pairing page
	if (!isTerminalRegistered && location.pathname !== "/terminal-pairing") {
		return (
			<Navigate
				to="/terminal-pairing"
				replace
			/>
		);
	}

	// If terminal is registered but user is on pairing page, redirect to login
	if (isTerminalRegistered && location.pathname === "/terminal-pairing") {
		return (
			<Navigate
				to="/login"
				replace
			/>
		);
	}

	// This logic handles routing for unauthenticated users.
	if (!isAuthenticated && location.pathname !== "/login" && location.pathname !== "/terminal-pairing") {
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
				path="/terminal-pairing"
				element={<TerminalPairingPage />}
			/>
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
					path="products/:productId"
					element={<ProductDetailsPage />} // Accessible to all (cashiers need to view product details)
				/>
				<Route
					path="products/modifiers"
					element={<ModifierManagementPage />}
				/>
				<Route
					path="inventory"
					element={
						<RoleProtectedRoute
							requiredPermission={(p) => p.canAccessInventory()}
						>
							<InventoryPage />
						</RoleProtectedRoute>
					}
				/>
				<Route
					path="inventory/history"
					element={
						<RoleProtectedRoute
							requiredPermission={(p) => p.canAccessInventory()}
						>
							<StockHistoryPage />
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
					element={
						<RoleProtectedRoute
							requiredPermission={(p) => p.canAccessSettings()}
						>
							<SettingsPage />
						</RoleProtectedRoute>
					}
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
