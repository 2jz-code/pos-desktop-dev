import React from "react";
import { DashboardProvider, useDashboard } from "@/contexts/DashboardContext";
import Sidebar from "@/components/dashboard/Sidebar";
import ProfileTab from "@/components/dashboard/ProfileTab";
import OrdersTab from "@/components/dashboard/OrdersTab";
import { Loader2 } from "lucide-react"; // Correct import for a loading spinner icon

const DashboardPage = () => {
	return (
		<DashboardProvider>
			<DashboardContent />
		</DashboardProvider>
	);
};

const DashboardContent = () => {
	const { activeTab, isLoadingProfile, isLoadingOrders } = useDashboard();

	const isLoading =
		activeTab === "profile" ? isLoadingProfile : isLoadingOrders;

	return (
		<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
			<div className="flex flex-col md:flex-row md:space-x-8">
				<Sidebar />
				<div className="flex-1 mt-8 md:mt-0">
					{isLoading ? (
						<div className="bg-card rounded-lg shadow-sm p-8 flex justify-center items-center">
							<Loader2 className="h-12 w-12 animate-spin" />
						</div>
					) : (
						<>
							{activeTab === "profile" && <ProfileTab />}
							{activeTab === "orders" && <OrdersTab />}
							{/* {activeTab === "account" && <AccountTab />} */}
						</>
					)}
				</div>
			</div>
		</div>
	);
};

export default DashboardPage;
