// desktop-combined/electron-app/src/pages/DashboardPage.jsx

import React, { useEffect } from "react"; // Ensure React and useEffect are imported
import { useAuth } from "@/context/AuthContext"; // Import useAuth
import { usePosStore } from "@/store/posStore"; // Import usePosStore
import FullScreenLoader from "@/components/FullScreenLoader"; // Import FullScreenLoader
import { DashboardCard } from "@/components/DashboardCard"; // Keep your existing DashboardCard import

export function DashboardPage() {
	// Get user and loading state from AuthContext
	const { user: authUser, loading: authLoading } = useAuth();

	// Get the action to set currentUser in posStore
	const setCurrentUserInPosStore = usePosStore((state) => state.setCurrentUser);

	// Synchronize AuthContext user with posStore's currentUser
	useEffect(() => {
		// Only attempt to set user once AuthContext has finished its initial loading
		if (!authLoading) {
			setCurrentUserInPosStore(authUser);
		}
	}, [authUser, authLoading, setCurrentUserInPosStore]);

	// Show a loader while authentication status is being checked
	if (authLoading) {
		return <FullScreenLoader />;
	}

	// Redirect or show a message if the user is not authenticated
	// (Assuming your router handles protected routes, but this adds a client-side check)
	if (!authUser) {
		return (
			<p className="p-4 text-center text-red-500">
				Please log in to view the dashboard.
			</p>
		);
	}

	return (
		<div className="p-4 sm:p-6">
			<h1 className="mb-6 text-2xl font-bold tracking-tight">Dashboard</h1>
			<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
				<DashboardCard
					to="/users"
					title="Users"
					description="Manage staff, roles, and permissions."
					iconName="Users"
				/>
				<DashboardCard
					to="/products"
					title="Products"
					description="View all products and menu items."
					iconName="Package"
				/>
				<DashboardCard
					to="/settings"
					title="Settings"
					description="Configure app settings and data sync."
					iconName="Settings"
				/>
				{/* New cards can be added here as we build more features */}
			</div>
		</div>
	);
}
