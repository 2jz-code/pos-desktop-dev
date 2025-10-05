import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster } from "@/components/ui/toaster";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/components/ui/tabs";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Store,
	Clock,
	MapPin,
	DollarSign,
	Package,
	FileText,
	Printer,
	Receipt,
	Bell,
	Monitor,
	Settings as SettingsIcon,
} from "lucide-react";

import { StoreLocationsManagement } from "./components/StoreLocationsManagement";
import { FinancialSettings } from "./components/FinancialSettings";
import { ReceiptSettings } from "./components/ReceiptSettings";
import { WebOrderNotificationSettings } from "./components/WebOrderNotificationSettings";
import { PrinterSettings } from "./components/PrinterSettings";
import { InventorySettings } from "./components/InventorySettings";
import { StockReasonSettings } from "./components/StockReasonSettings";
import { StoreInfoSettings } from "./components/StoreInfoSettings";
import { TerminalSettings } from "./components/TerminalSettings";
import { BusinessHours } from "./components/business-hours";

export function SettingsPage() {
	return (
		<>
			<Toaster />
			<div className="flex flex-col h-full">
				{/* Tabs Content - Full Height */}
				<div className="flex-1 overflow-hidden">
					<Tabs defaultValue="store-info" className="h-full flex flex-col">
						{/* Tabs Navigation */}
						<div className="flex-shrink-0 border-b border-border bg-muted/20">
							<ScrollArea className="w-full">
								<TabsList className="inline-flex h-12 items-center justify-start w-full bg-transparent p-0 px-6">
									<TabsTrigger
										value="store-info"
										className="inline-flex items-center gap-2 px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
									>
										<Store className="h-4 w-4" />
										<span className="hidden sm:inline">Store Info</span>
									</TabsTrigger>
									<TabsTrigger
										value="business-hours"
										className="inline-flex items-center gap-2 px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
									>
										<Clock className="h-4 w-4" />
										<span className="hidden sm:inline">Hours</span>
									</TabsTrigger>
									<TabsTrigger
										value="locations"
										className="inline-flex items-center gap-2 px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
									>
										<MapPin className="h-4 w-4" />
										<span className="hidden sm:inline">Locations</span>
									</TabsTrigger>
									<TabsTrigger
										value="financial"
										className="inline-flex items-center gap-2 px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
									>
										<DollarSign className="h-4 w-4" />
										<span className="hidden sm:inline">Financial</span>
									</TabsTrigger>
									<TabsTrigger
										value="inventory"
										className="inline-flex items-center gap-2 px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
									>
										<Package className="h-4 w-4" />
										<span className="hidden sm:inline">Inventory</span>
									</TabsTrigger>
									<TabsTrigger
										value="stock-reasons"
										className="inline-flex items-center gap-2 px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
									>
										<FileText className="h-4 w-4" />
										<span className="hidden sm:inline">Stock Reasons</span>
									</TabsTrigger>
									<TabsTrigger
										value="printers"
										className="inline-flex items-center gap-2 px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
									>
										<Printer className="h-4 w-4" />
										<span className="hidden sm:inline">Printers</span>
									</TabsTrigger>
									<TabsTrigger
										value="receipts"
										className="inline-flex items-center gap-2 px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
									>
										<Receipt className="h-4 w-4" />
										<span className="hidden sm:inline">Receipts</span>
									</TabsTrigger>
									<TabsTrigger
										value="notifications"
										className="inline-flex items-center gap-2 px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
									>
										<Bell className="h-4 w-4" />
										<span className="hidden sm:inline">Notifications</span>
									</TabsTrigger>
									<TabsTrigger
										value="terminals"
										className="inline-flex items-center gap-2 px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
									>
										<Monitor className="h-4 w-4" />
										<span className="hidden sm:inline">Terminals</span>
									</TabsTrigger>
								</TabsList>
							</ScrollArea>
						</div>

						{/* Tab Content Panels */}
						<div className="flex-1 overflow-hidden">
							<ScrollArea className="h-full">
								<div className="p-6">
									<TabsContent value="store-info" className="mt-0">
										<StoreInfoSettings />
									</TabsContent>

									<TabsContent value="business-hours" className="mt-0">
										<BusinessHours />
									</TabsContent>

									<TabsContent value="locations" className="mt-0">
										<StoreLocationsManagement />
									</TabsContent>

									<TabsContent value="financial" className="mt-0">
										<FinancialSettings />
									</TabsContent>

									<TabsContent value="inventory" className="mt-0">
										<InventorySettings />
									</TabsContent>

									<TabsContent value="stock-reasons" className="mt-0">
										<StockReasonSettings />
									</TabsContent>

									<TabsContent value="printers" className="mt-0">
										<PrinterSettings />
									</TabsContent>

									<TabsContent value="receipts" className="mt-0">
										<ReceiptSettings />
									</TabsContent>

									<TabsContent value="notifications" className="mt-0">
										<Card className="border-border bg-card">
											<CardHeader>
												<div className="flex items-center gap-2">
													<div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
														<Bell className="h-4 w-4 text-purple-600 dark:text-purple-400" />
													</div>
													<div>
														<CardTitle className="text-foreground">Web Order Notifications</CardTitle>
														<CardDescription>
															Configure notifications and auto-printing for web orders
														</CardDescription>
													</div>
												</div>
											</CardHeader>
											<CardContent>
												<WebOrderNotificationSettings />
											</CardContent>
										</Card>
									</TabsContent>

									<TabsContent value="terminals" className="mt-0">
										<TerminalSettings />
									</TabsContent>
								</div>
							</ScrollArea>
						</div>
					</Tabs>
				</div>
			</div>
		</>
	);
}
