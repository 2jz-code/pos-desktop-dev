import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/shared/components/ui/tabs";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Toaster } from "@/shared/components/ui/toaster";

import { StoreLocationsManagement } from "../components/StoreLocationsManagement";
import { FinancialSettings } from "../components/FinancialSettings";
import { ReceiptSettings } from "../components/ReceiptSettings";
import { DeviceSettings } from "../components/DeviceSettings";
import { PrinterSettings } from "../components/PrinterSettings";
import { PaymentSettings } from "../components/PaymentSettings";
import { WebOrderNotificationSettings } from "../components/WebOrderNotificationSettings";

export function SettingsPage() {
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
						defaultValue="general"
						className="w-full flex flex-col h-full"
					>
						{/* Tabs List - Fixed */}
						<TabsList className="flex-shrink-0 grid w-full grid-cols-1 md:grid-cols-3 lg:grid-cols-7 mb-4">
							<TabsTrigger value="general">General</TabsTrigger>
							<TabsTrigger value="locations">Locations</TabsTrigger>
							<TabsTrigger value="financials">Financial</TabsTrigger>
							<TabsTrigger value="receipts">Receipts</TabsTrigger>
							<TabsTrigger value="device">This Device</TabsTrigger>
							<TabsTrigger value="printers">Printers & Zones</TabsTrigger>
							<TabsTrigger value="payments">Payments</TabsTrigger>
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
									value="receipts"
									className="mt-0"
								>
									<ReceiptSettings />
								</TabsContent>
								<TabsContent
									value="device"
									className="mt-0"
								>
									<DeviceSettings />
								</TabsContent>
								<TabsContent
									value="printers"
									className="mt-0"
								>
									<PrinterSettings />
								</TabsContent>
								<TabsContent
									value="payments"
									className="mt-0"
								>
									<PaymentSettings />
								</TabsContent>
							</ScrollArea>
						</div>
					</Tabs>
				</div>
			</div>
		</>
	);
}
