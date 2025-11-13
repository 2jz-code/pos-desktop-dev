import React from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Bell, Building2, Palette, CreditCard } from "lucide-react";
import { getGlobalSettings } from "../services/settingsService";

import { FinancialSettings } from "../components/FinancialSettings";
import { ReceiptSettings } from "../components/ReceiptSettings";
import { DeviceSettings } from "../components/DeviceSettings";
import { PrinterSettings } from "../components/PrinterSettings";
import { PaymentSettings } from "../components/PaymentSettings";
import { WebOrderNotificationSettings } from "../components/WebOrderNotificationSettings";
import { InventorySettings } from "../components/InventorySettings";
import { StoreInfoSettings } from "../components/StoreInfoSettings";

export function SettingsPage() {
	const { data: globalSettings } = useQuery({
		queryKey: ["globalSettings"],
		queryFn: getGlobalSettings,
	});

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
							{/* Brand Information - Read Only */}
							{globalSettings && (
								<Card className="bg-muted/30">
									<CardHeader>
										<CardTitle className="flex items-center gap-2">
											<Building2 className="h-5 w-5" />
											Brand Information
										</CardTitle>
										<CardDescription>
											Global brand settings managed by the business owner
										</CardDescription>
									</CardHeader>
									<CardContent className="grid gap-4">
										<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
											<div>
												<div className="text-sm font-medium text-muted-foreground mb-1">
													Brand Name
												</div>
												<div className="text-base font-semibold">
													{globalSettings.brand_name}
												</div>
											</div>
											<div>
												<div className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
													<CreditCard className="h-3 w-3" />
													Active Terminal Provider
												</div>
												<div className="text-base">
													{globalSettings.active_terminal_provider?.replace(/_/g, ' ')}
												</div>
											</div>
										</div>
										<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
											<div>
												<div className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
													<Palette className="h-3 w-3" />
													Primary Color
												</div>
												<div className="flex items-center gap-2">
													<div
														className="w-6 h-6 rounded border"
														style={{ backgroundColor: globalSettings.brand_primary_color }}
													/>
													<span className="text-sm font-mono">
														{globalSettings.brand_primary_color}
													</span>
												</div>
											</div>
											<div>
												<div className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
													<Palette className="h-3 w-3" />
													Secondary Color
												</div>
												<div className="flex items-center gap-2">
													<div
														className="w-6 h-6 rounded border"
														style={{ backgroundColor: globalSettings.brand_secondary_color }}
													/>
													<span className="text-sm font-mono">
														{globalSettings.brand_secondary_color}
													</span>
												</div>
											</div>
										</div>
									</CardContent>
								</Card>
							)}

							<Separator />

							{/* Business Setup Section */}
							<div className="space-y-6">
								<div>
									<h3 className="text-xl font-semibold tracking-tight">
										Location Information
									</h3>
									<p className="text-sm text-muted-foreground">
										Configure information for this store location
									</p>
								</div>

								<div className="space-y-6">
									<StoreInfoSettings />
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
