import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, CreditCard, Printer, Wrench, Store } from "lucide-react";
import GlobalSettings from "../components/GlobalSettings";
import TerminalSettings from "../components/TerminalSettings";
import PrinterSettings from "../components/PrinterSettings";
import SystemSettings from "../components/SystemSettings";
import StoreSettings from "../components/StoreSettings";
import SyncManager from "@/components/SyncManager";

const SettingsPage = () => {
	return (
		<div className="flex flex-col flex-1 min-h-0">
			{/* Header */}
			<div className="flex-shrink-0 p-6 border-b bg-background">
				<h1 className="text-3xl font-bold">Settings</h1>
				<p className="text-muted-foreground mt-1">
					Configure your POS system settings and preferences
				</p>
			</div>

			{/* Tabbed Content */}
			<div className="flex-1 min-h-0">
				<Tabs
					defaultValue="system"
					className="h-full flex flex-col"
				>
					{/* Tab Navigation */}
					<div className="flex-shrink-0 px-6 pt-6">
						<TabsList className="grid w-full grid-cols-5">
							<TabsTrigger
								value="system"
								className="flex items-center gap-2"
							>
								<Settings className="h-4 w-4" />
								System
							</TabsTrigger>
							<TabsTrigger
								value="payments"
								className="flex items-center gap-2"
							>
								<CreditCard className="h-4 w-4" />
								Payments
							</TabsTrigger>
							<TabsTrigger
								value="hardware"
								className="flex items-center gap-2"
							>
								<Printer className="h-4 w-4" />
								Hardware
							</TabsTrigger>
							<TabsTrigger
								value="store"
								className="flex items-center gap-2"
							>
								<Store className="h-4 w-4" />
								Store
							</TabsTrigger>
							<TabsTrigger
								value="advanced"
								className="flex items-center gap-2"
							>
								<Wrench className="h-4 w-4" />
								Advanced
							</TabsTrigger>
						</TabsList>
					</div>

					{/* Tab Content - Scrollable */}
					<div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
						{/* System Settings */}
						<TabsContent
							value="system"
							className="mt-6 space-y-6"
						>
							<div>
								<h2 className="text-xl font-semibold mb-2">
									System Configuration
								</h2>
								<p className="text-muted-foreground mb-6">
									Configure sync intervals, backup settings, and system
									interface options.
								</p>
								<SystemSettings />
							</div>
						</TabsContent>

						{/* Payment & Terminal Settings */}
						<TabsContent
							value="payments"
							className="mt-6 space-y-6"
						>
							<div>
								<h2 className="text-xl font-semibold mb-2">
									Payment Configuration
								</h2>
								<p className="text-muted-foreground mb-6">
									Configure payment processors, terminal settings, and payment
									preferences.
								</p>
								<div className="space-y-6">
									<GlobalSettings />
									<TerminalSettings />
								</div>
							</div>
						</TabsContent>

						{/* Hardware Settings */}
						<TabsContent
							value="hardware"
							className="mt-6 space-y-6"
						>
							<div>
								<h2 className="text-xl font-semibold mb-2">
									Hardware Configuration
								</h2>
								<p className="text-muted-foreground mb-6">
									Configure printers, cash drawers, and other hardware devices.
								</p>
								<PrinterSettings />
							</div>
						</TabsContent>

						{/* Store Settings */}
						<TabsContent
							value="store"
							className="mt-6 space-y-6"
						>
							<div>
								<h2 className="text-xl font-semibold mb-2">
									Store Configuration
								</h2>
								<p className="text-muted-foreground mb-6">
									Configure store information, receipts, and business settings.
								</p>
								<StoreSettings />
							</div>
						</TabsContent>

						{/* Advanced Settings */}
						<TabsContent
							value="advanced"
							className="mt-6 space-y-6"
						>
							<div>
								<h2 className="text-xl font-semibold mb-2">
									Advanced Settings
								</h2>
								<p className="text-muted-foreground mb-6">
									API key management, manual sync operations, and advanced
									system diagnostics.
								</p>
								<Card>
									<CardHeader>
										<CardTitle className="flex items-center gap-2">
											<Wrench className="h-5 w-5" />
											Sync Management
										</CardTitle>
									</CardHeader>
									<CardContent>
										<SyncManager />
									</CardContent>
								</Card>
							</div>
						</TabsContent>
					</div>
				</Tabs>
			</div>
		</div>
	);
};

export default SettingsPage;
