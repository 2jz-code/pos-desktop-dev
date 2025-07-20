import React, { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/components/ui/tabs";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster } from "@/components/ui/toaster";

import { StoreLocationsManagement } from "./components/StoreLocationsManagement";
import { FinancialSettings } from "./components/FinancialSettings";
import { ReceiptSettings } from "./components/ReceiptSettings";
import { WebOrderNotificationSettings } from "./components/WebOrderNotificationSettings";
import { PrinterSettings } from "./components/PrinterSettings";
import { InventorySettings } from "./components/InventorySettings";

export function SettingsPage() {
	const [searchParams] = useSearchParams();
	const [activeTab, setActiveTab] = React.useState("general");

	// Handle URL tab parameter
	useEffect(() => {
		const tabParam = searchParams.get("tab");
		if (tabParam) {
			setActiveTab(tabParam);
		}
	}, [searchParams]);

	return (
		<>
			<Toaster />
			<div className="flex flex-col h-full">
				{/* Header Section - Fixed */}
				<div className="flex-shrink-0 p-4 pt-6 pb-4 md:px-8">
					<div className="flex items-center justify-between space-y-2">
						<h2 className="text-3xl font-bold tracking-tight">Settings</h2>
					</div>
				</div>

				{/* Tabs Section - Scrollable */}
				<div className="flex flex-col flex-1 min-h-0 px-4 md:px-8 pb-4">
					<Tabs
						value={activeTab}
						onValueChange={setActiveTab}
						className="w-full flex flex-col h-full"
					>
						{/* Tabs List - Fixed */}
						<TabsList className="flex-shrink-0 grid w-full grid-cols-1 md:grid-cols-3 lg:grid-cols-6 mb-4">
							<TabsTrigger value="general">General</TabsTrigger>
							<TabsTrigger value="locations">Locations</TabsTrigger>
							<TabsTrigger value="financials">Financial</TabsTrigger>
							<TabsTrigger value="inventory">Inventory</TabsTrigger>
							<TabsTrigger value="receipts">Receipts</TabsTrigger>
							<TabsTrigger value="printers">Printers & Zones</TabsTrigger>
						</TabsList>

						{/* Tab Content - Scrollable */}
						<div className="flex-1 min-h-0">
							<ScrollArea className="h-full">
								<TabsContent
									value="general"
									className="mt-0"
								>
									<WebOrderNotificationSettings />
								</TabsContent>
								<TabsContent
									value="locations"
									className="mt-0"
								>
									<StoreLocationsManagement />
								</TabsContent>
								<TabsContent
									value="financials"
									className="mt-0"
								>
									<FinancialSettings />
								</TabsContent>
								<TabsContent
									value="inventory"
									className="mt-0"
								>
									<InventorySettings />
								</TabsContent>
								<TabsContent
									value="receipts"
									className="mt-0"
								>
									<ReceiptSettings />
								</TabsContent>
								<TabsContent
									value="printers"
									className="mt-0"
								>
									<PrinterSettings />
								</TabsContent>
							</ScrollArea>
						</div>
					</Tabs>
				</div>
			</div>
		</>
	);
}
