import React from "react";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Toaster } from "@/shared/components/ui/toaster";
import { Separator } from "@/shared/components/ui/separator";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Bell } from "lucide-react";

import { StoreLocationsManagement } from "../components/StoreLocationsManagement";
import { FinancialSettings } from "../components/FinancialSettings";
import { ReceiptSettings } from "../components/ReceiptSettings";
import { DeviceSettings } from "../components/DeviceSettings";
import { PrinterSettings } from "../components/PrinterSettings";
import { PaymentSettings } from "../components/PaymentSettings";
import { WebOrderNotificationSettings } from "../components/WebOrderNotificationSettings";
import { InventorySettings } from "../components/InventorySettings";
import { StoreInfoSettings } from "../components/StoreInfoSettings";

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

				{/* Settings Content - Scrollable */}
				<div className="flex flex-col flex-1 min-h-0 px-4 md:px-8 pb-4">
					<ScrollArea className="h-full">
						<div className="space-y-8">
							{/* Business Setup Section */}
							<div className="space-y-6">
								<div>
									<h3 className="text-xl font-semibold tracking-tight">
										Business Setup
									</h3>
									<p className="text-sm text-muted-foreground">
										Configure your store information, hours, and locations
									</p>
								</div>

								<div className="space-y-6">
									<StoreInfoSettings />
									<StoreLocationsManagement />
								</div>
							</div>

							<Separator />

							{/* Operations & Finance Section */}
							<div className="space-y-6">
								<div>
									<h3 className="text-xl font-semibold tracking-tight">
										Operations & Finance
									</h3>
									<p className="text-sm text-muted-foreground">
										Manage financial settings and inventory
									</p>
								</div>

								<div className="space-y-6">
									<FinancialSettings />
									<InventorySettings />
								</div>
							</div>

							<Separator />

							{/* Device & Hardware Section */}
							<div className="space-y-6">
								<div>
									<h3 className="text-xl font-semibold tracking-tight">
										Device & Hardware
									</h3>
									<p className="text-sm text-muted-foreground">
										Configure this device, printers, and payment processing
									</p>
								</div>

								<div className="space-y-6">
									<DeviceSettings />
									<PrinterSettings />
									<PaymentSettings />
								</div>
							</div>

							<Separator />

							{/* Customer Experience Section */}
							<div className="space-y-6">
								<div>
									<h3 className="text-xl font-semibold tracking-tight">
										Customer Experience
									</h3>
									<p className="text-sm text-muted-foreground">
										Configure receipts and order notifications
									</p>
								</div>

								<div className="space-y-6">
									<ReceiptSettings />
									<Card>
										<CardHeader>
											<CardTitle className="flex items-center gap-2">
												<Bell className="h-5 w-5" />
												Web Order Notifications
											</CardTitle>
											<CardDescription>
												Configure notifications and auto-printing for web orders
											</CardDescription>
										</CardHeader>
										<CardContent>
											<WebOrderNotificationSettings />
										</CardContent>
									</Card>
								</div>
							</div>
						</div>
					</ScrollArea>
				</div>
			</div>
		</>
	);
}
