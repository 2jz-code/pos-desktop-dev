import React from "react";
import {
	BrowserRouter as Router,
	Routes,
	Route,
	Navigate,
	Outlet,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { LoginPage } from "@/pages/auth/LoginPage";
import OrdersPage from "@/pages/orders/OrdersPage";
import OrderDetailsPage from "@/pages/orders/OrderDetailsPage";
import { ProductsPage } from "@/pages/products/ProductsPage";
import { ProductDetailsPage } from "@/pages/products/ProductDetailsPage";
import ModifierManagementPage from "@/pages/products/ModifierManagementPage";
import { UsersPage } from "@/pages/users/UsersPage.tsx";
import { InventoryPage } from "@/pages/inventory/InventoryPage";
import { BulkOperationsPage } from "@/pages/inventory/BulkOperationsPage";
import { StockHistoryPage } from "@/pages/inventory/StockHistoryPage";
import ReportsPage from "@/pages/reports/ReportsPage";
import { AuditPage } from "@/pages/audit/AuditPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";
import PaymentsPage from "@/pages/payments/PaymentsPage";
import PaymentDetailsPage from "@/pages/payments/PaymentDetailsPage";
import { DiscountsPage } from "@/pages/discounts/DiscountsPage";
import { Layout } from "@/components/layout/Layout";
import { RoleProtectedRoute } from "@/components/shared/RoleProtectedRoute";
import { Toaster } from "@/components/ui/toaster";

// Create a client
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: 1,
			refetchOnWindowFocus: false,
		},
	},
});

// Protected route wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
	const { isAuthenticated, loading, tenant } = useAuth();

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
					<p className="text-muted-foreground">Loading...</p>
				</div>
			</div>
		);
	}

	if (!isAuthenticated) {
		return (
			<Navigate
				to="/login"
				replace
			/>
		);
	}

	return <>{children}</>;
};

// Application routes
const AppRoutes = () => {
	const { isAuthenticated, tenant } = useAuth();

	return (
		<Routes>
			<Route
				path="/login"
				element={
					isAuthenticated && tenant ? (
						<Navigate
							to={`/${tenant.slug}/dashboard`}
							replace
						/>
					) : (
						<LoginPage />
					)
				}
			/>
			<Route
				path="/"
				element={
					isAuthenticated && tenant ? (
						<Navigate
							to={`/${tenant.slug}/dashboard`}
							replace
						/>
					) : (
						<Navigate
							to="/login"
							replace
						/>
					)
				}
			/>

			{/* All tenant-scoped routes wrapped under /:tenantSlug */}
			<Route path="/:tenantSlug" element={<Outlet />}>
				<Route
					path="dashboard"
					element={
						<ProtectedRoute>
							<Layout>
								<DashboardPage />
							</Layout>
						</ProtectedRoute>
					}
				/>
				<Route
					path="orders"
					element={
						<ProtectedRoute>
							<Layout>
								<OrdersPage />
							</Layout>
						</ProtectedRoute>
					}
				/>
				<Route
					path="orders/:orderId"
					element={
						<ProtectedRoute>
							<Layout>
								<OrderDetailsPage />
							</Layout>
						</ProtectedRoute>
					}
				/>
				<Route
					path="products"
					element={
						<ProtectedRoute>
							<Layout>
								<ProductsPage />
							</Layout>
						</ProtectedRoute>
					}
				/>
				<Route
					path="products/:productId"
					element={
						<ProtectedRoute>
							<Layout>
								<ProductDetailsPage />
							</Layout>
						</ProtectedRoute>
					}
				/>
				<Route
					path="products/modifiers"
					element={
						<ProtectedRoute>
							<Layout>
								<ModifierManagementPage />
							</Layout>
						</ProtectedRoute>
					}
				/>
				<Route
					path="users"
					element={
						<ProtectedRoute>
							<Layout>
								<RoleProtectedRoute
									requiredPermission={(p: any) => p.canAccessUsers()}
								>
									<UsersPage />
								</RoleProtectedRoute>
							</Layout>
						</ProtectedRoute>
					}
				/>
				<Route
					path="inventory"
					element={
						<ProtectedRoute>
							<Layout>
								<RoleProtectedRoute
									requiredPermission={(p: any) => p.canAccessInventory()}
								>
									<InventoryPage />
								</RoleProtectedRoute>
							</Layout>
						</ProtectedRoute>
					}
				/>
				<Route
					path="inventory/bulk-operations"
					element={
						<ProtectedRoute>
							<Layout>
								<RoleProtectedRoute
									requiredPermission={(p: any) => p.canAccessInventory()}
								>
									<BulkOperationsPage />
								</RoleProtectedRoute>
							</Layout>
						</ProtectedRoute>
					}
				/>
				<Route
					path="inventory/stock-history"
					element={
						<ProtectedRoute>
							<Layout>
								<RoleProtectedRoute
									requiredPermission={(p: any) => p.canAccessInventory()}
								>
									<StockHistoryPage />
								</RoleProtectedRoute>
							</Layout>
						</ProtectedRoute>
					}
				/>
				<Route
					path="reports"
					element={
						<ProtectedRoute>
							<Layout>
								<RoleProtectedRoute
									requiredPermission={(p: any) => p.canAccessReports()}
								>
									<ReportsPage />
								</RoleProtectedRoute>
							</Layout>
						</ProtectedRoute>
					}
				/>
				<Route
					path="audit"
					element={
						<ProtectedRoute>
							<Layout>
								<RoleProtectedRoute
									requiredPermission={(p: any) => p.canAccessAudits()}
								>
									<AuditPage />
								</RoleProtectedRoute>
							</Layout>
						</ProtectedRoute>
					}
				/>
				<Route
					path="payments"
					element={
						<ProtectedRoute>
							<Layout>
								<RoleProtectedRoute
									requiredPermission={(p: any) => p.canAccessPayments()}
								>
									<PaymentsPage />
								</RoleProtectedRoute>
							</Layout>
						</ProtectedRoute>
					}
				/>
				<Route
					path="payments/:paymentId"
					element={
						<ProtectedRoute>
							<Layout>
								<RoleProtectedRoute
									requiredPermission={(p: any) => p.canAccessPayments()}
								>
									<PaymentDetailsPage />
								</RoleProtectedRoute>
							</Layout>
						</ProtectedRoute>
					}
				/>
				<Route
					path="discounts"
					element={
						<ProtectedRoute>
							<Layout>
								<RoleProtectedRoute
									requiredPermission={(p: any) => p.canAccessDiscounts()}
								>
									<DiscountsPage />
								</RoleProtectedRoute>
							</Layout>
						</ProtectedRoute>
					}
				/>
				<Route
					path="settings"
					element={
						<ProtectedRoute>
							<Layout>
								<SettingsPage />
							</Layout>
						</ProtectedRoute>
					}
				/>
			</Route>

			<Route
				path="*"
				element={
					<Navigate
						to="/login"
						replace
					/>
				}
			/>
		</Routes>
	);
};

const App = () => {
	return (
		<QueryClientProvider client={queryClient}>
			<AuthProvider>
				<Router>
					<AppRoutes />
					<Toaster />
				</Router>
			</AuthProvider>
		</QueryClientProvider>
	);
};

export default App;
