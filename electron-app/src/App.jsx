import {
	HashRouter as Router,
	Routes,
	Route,
	Navigate,
	useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { QueryProvider } from "./providers/QueryProvider";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { UsersPage } from "./pages/UsersPage";
import ProductsPage from "./pages/ProductsPage";
import POS from "./features/pos/pages/POS";
import OrdersPage from "./pages/OrdersPage";
import OrderDetailsPage from "./pages/OrderDetailsPage";
import DiscountsPage from "./pages/DiscountsPage";
import FullScreenLoader from "./components/FullScreenLoader";
import { Layout } from "@/components/Layout";
import { Toaster } from "@/components/ui/toaster";
import { AnimatedOutlet } from "./components/animations/AnimatedOutlet";
import SettingsPage from "./features/settings/pages/SettingsPage";
import PaymentsPage from "./pages/PaymentsPage";
import PaymentDetailsPage from "./pages/PaymentDetailsPage";
import { useCustomerTipListener } from "./store/useCustomerTipListener"; // FIX: Import the hook

function PrivateRoute({ children }) {
	const { user, loading } = useAuth();

	if (loading) {
		return <FullScreenLoader />;
	}

	return user ? children : <Navigate to="/login" />;
}

function App() {
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

function AppRoutes() {
	const { isAuthenticated, loading } = useAuth();
	const location = useLocation();

	// Call the hook here to set up the global listener.
	// Hooks must be called at the top level, not conditionally.
	// The listener will be active for the app's lifetime.
	useCustomerTipListener();

	if (loading) {
		return <FullScreenLoader />;
	}

	if (!isAuthenticated && location.pathname !== "/login") {
		return (
			<Navigate
				to="/login"
				replace
			/>
		);
	}

	if (isAuthenticated && location.pathname === "/login") {
		return (
			<Navigate
				to="/"
				replace
			/>
		);
	}

	return (
		<Routes>
			<Route
				path="/login"
				element={<LoginPage />}
			/>
			<Route
				path="/*"
				element={
					isAuthenticated ? (
						<Layout>
							<AnimatedOutlet />
						</Layout>
					) : (
						<Navigate
							to="/login"
							replace
						/>
					)
				}
			>
				{/* These routes are now children of the /* route and will be rendered by AnimatedOutlet */}
				<Route
					index
					element={<DashboardPage />}
				/>
				<Route
					path="pos"
					element={
						<PrivateRoute>
							<POS />
						</PrivateRoute>
					}
				/>
				<Route
					path="orders"
					element={
						<PrivateRoute>
							<OrdersPage />
						</PrivateRoute>
					}
				/>
				<Route
					path="orders/:orderId"
					element={
						<PrivateRoute>
							<OrderDetailsPage />
						</PrivateRoute>
					}
				/>
				<Route
					path="payments"
					element={<PaymentsPage />}
				/>
				<Route
					path="payments/:paymentId"
					element={<PaymentDetailsPage />}
				/>

				<Route
					path="users"
					element={
						<PrivateRoute>
							<UsersPage />
						</PrivateRoute>
					}
				/>
				<Route
					path="products"
					element={
						<PrivateRoute>
							<ProductsPage />
						</PrivateRoute>
					}
				/>
				<Route
					path="discounts"
					element={
						<PrivateRoute>
							<DiscountsPage />
						</PrivateRoute>
					}
				/>
				<Route
					path="settings"
					element={
						<PrivateRoute>
							<SettingsPage />
						</PrivateRoute>
					}
				/>
				<Route
					path="*"
					element={<Navigate to="/" />}
				/>
			</Route>
		</Routes>
	);
}

export default App;
