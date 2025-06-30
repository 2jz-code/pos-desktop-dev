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
import { Toaster } from "@/shared/components/ui/toaster";

import { StoreLocationsManagement } from "../components/StoreLocationsManagement";
import { FinancialSettings } from "../components/FinancialSettings";
import { ReceiptSettings } from "../components/ReceiptSettings";
import { DeviceSettings } from "../components/DeviceSettings";
import { PrinterSettings } from "../components/PrinterSettings";
import { PaymentSettings } from "../components/PaymentSettings";

export function SettingsPage() {
	return (
		<>
			<Toaster />
			<div className="flex-1 p-4 pt-6 space-y-4 md:p-8">
				<div className="flex items-center justify-between space-y-2">
					<h2 className="text-3xl font-bold tracking-tight">Settings</h2>
				</div>
				<Tabs
					defaultValue="locations"
					className="w-full"
				>
					<TabsList className="grid w-full grid-cols-1 md:grid-cols-3 lg:grid-cols-6">
						<TabsTrigger value="locations">Locations</TabsTrigger>
						<TabsTrigger value="financials">Financial</TabsTrigger>
						<TabsTrigger value="receipts">Receipts</TabsTrigger>
						<TabsTrigger value="device">This Device</TabsTrigger>
						<TabsTrigger value="printers">Printers & Zones</TabsTrigger>
						<TabsTrigger value="payments">Payments</TabsTrigger>
					</TabsList>
					<TabsContent value="locations">
						<StoreLocationsManagement />
					</TabsContent>
					<TabsContent value="financials">
						<FinancialSettings />
					</TabsContent>
					<TabsContent value="receipts">
						<ReceiptSettings />
					</TabsContent>
					<TabsContent value="device">
						<DeviceSettings />
					</TabsContent>
					<TabsContent value="printers">
						<PrinterSettings />
					</TabsContent>
					<TabsContent value="payments">
						<PaymentSettings />
					</TabsContent>
				</Tabs>
			</div>
		</>
	);
}
