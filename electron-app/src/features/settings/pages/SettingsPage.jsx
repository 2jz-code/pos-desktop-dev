import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/toaster";
import {
	Settings,
	Building,
	Monitor,
	CreditCard,
	Printer,
	Wrench,
	CheckCircle,
	Edit,
	ShieldX,
} from "lucide-react";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { RoleBasedAccessSummary } from "@/components/RoleBasedAccessSummary";

// Terminal Settings Components (user-editable)
// import TerminalSyncSettings from "../components/TerminalSyncSettings"; // Commented out for offline mode reimplementation later
import TerminalDisplaySettings from "../components/TerminalDisplaySettings";
import TerminalBehaviorSettings from "../components/TerminalBehaviorSettings";

// Business Settings Components (now editable)
import BusinessStoreInfo from "../components/BusinessStoreInfo";
import BusinessFinancialSettings from "../components/BusinessFinancialSettings";
import BusinessReceiptSettings from "../components/BusinessReceiptSettings";
import BusinessHoursSettings from "../components/BusinessHoursSettings";

// Mixed/Legacy Components
import PrinterSettings from "../components/PrinterSettings";
import GlobalSettings from "../components/GlobalSettings";
import TerminalSettings from "../components/TerminalSettings";
// import SyncManager from "@/components/SyncManager"; // Commented out for offline mode reimplementation later

const SettingsPage = () => {
	const permissions = useRolePermissions();

	return (
		<div className="flex flex-col flex-1 min-h-0">
			{/* Header */}
			<div className="flex-shrink-0 p-6 border-b bg-background">
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-3xl font-bold">Settings</h1>
						<p className="text-muted-foreground mt-1">
							Configure your POS system settings and preferences
						</p>
					</div>
					<Badge
						variant="outline"
						className="text-sm"
					>
						Role: {permissions.role}
					</Badge>
				</div>
			</div>

			{/* Tabbed Content */}
			<div className="flex-1 min-h-0">
				<Tabs
					defaultValue={
						permissions.canAccessTerminalSettings()
							? "terminal"
							: permissions.canAccessBusinessSettings()
							? "business"
							: permissions.canAccessHardwareSettings()
							? "hardware"
							: permissions.canAccessAdvancedSettings()
							? "advanced"
							: "terminal"
					}
					className="h-full flex flex-col"
				>
					{/* Tab Navigation */}
					<div className="flex-shrink-0 px-6 pt-6">
						{/* Calculate available tabs based on permissions */}
						{(() => {
							const availableTabs = [];

							if (permissions.canAccessTerminalSettings()) {
								availableTabs.push("terminal");
							}
							if (permissions.canAccessBusinessSettings()) {
								availableTabs.push("business");
							}
							if (permissions.canAccessHardwareSettings()) {
								availableTabs.push("hardware");
							}
							if (permissions.canAccessAdvancedSettings()) {
								availableTabs.push("advanced");
								// Add debug tab for owners only (development/testing)
								if (permissions.isOwner) {
									availableTabs.push("debug");
								}
							}

							const gridCols =
								availableTabs.length === 1
									? "grid-cols-1"
									: availableTabs.length === 2
									? "grid-cols-2"
									: availableTabs.length === 3
									? "grid-cols-3"
									: "grid-cols-4";

							return (
								<TabsList className={`grid w-full ${gridCols}`}>
									{permissions.canAccessTerminalSettings() && (
										<TabsTrigger
											value="terminal"
											className="flex items-center gap-2"
										>
											<Monitor className="h-4 w-4" />
											Terminal
											<Badge
												variant="secondary"
												className="text-xs"
											>
												{permissions.isCashier ? "Limited" : "Editable"}
											</Badge>
										</TabsTrigger>
									)}
									{permissions.canAccessBusinessSettings() && (
										<TabsTrigger
											value="business"
											className="flex items-center gap-2"
										>
											<Building className="h-4 w-4" />
											Business
											<Badge
												variant="secondary"
												className="text-xs"
											>
												Editable
											</Badge>
										</TabsTrigger>
									)}
									{permissions.canAccessHardwareSettings() && (
										<TabsTrigger
											value="hardware"
											className="flex items-center gap-2"
										>
											<Printer className="h-4 w-4" />
											Hardware
										</TabsTrigger>
									)}
									{permissions.canAccessAdvancedSettings() && (
										<TabsTrigger
											value="advanced"
											className="flex items-center gap-2"
										>
											<Wrench className="h-4 w-4" />
											Advanced
										</TabsTrigger>
									)}
									{permissions.isOwner && (
										<TabsTrigger
											value="debug"
											className="flex items-center gap-2"
										>
											<ShieldX className="h-4 w-4" />
											Debug
										</TabsTrigger>
									)}
								</TabsList>
							);
						})()}
					</div>

					{/* Tab Content - Scrollable */}
					<div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
						{/* Terminal Settings Tab */}
						{permissions.canAccessTerminalSettings() && (
							<TabsContent
								value="terminal"
								className="mt-6 space-y-6"
							>
								<div>
									<div className="flex items-center gap-2 mb-2">
										<h2 className="text-xl font-semibold">Terminal Settings</h2>
										<Badge
											variant="secondary"
											className="flex items-center gap-1"
										>
											<Edit className="h-3 w-3" />
											Editable
										</Badge>
									</div>
									<p className="text-muted-foreground mb-6">
										Settings specific to this POS terminal. These changes affect
										only this device and can be modified by terminal operators.
									</p>

									<Alert className="mb-6">
										<Settings className="h-4 w-4" />
										<AlertDescription>
											<strong>Terminal Settings:</strong> These settings are
											stored locally and affect only this specific POS terminal.
											Changes take effect immediately.
										</AlertDescription>
									</Alert>

									<div className="space-y-6">
										{/* Sync Settings - temporarily disabled for offline mode reimplementation */}
										{/* 
										{permissions.canEditSyncSettings() && (
											<TerminalSyncSettings />
										)}
										*/}

										{/* Display Settings - accessible to all users */}
										<TerminalDisplaySettings />

										{/* Behavior Settings - only show to managers/owners */}
										{permissions.canEditBehaviorSettings() && (
											<TerminalBehaviorSettings />
										)}
									</div>
								</div>
							</TabsContent>
						)}

						{/* Business Settings Tab */}
						{permissions.canAccessBusinessSettings() && (
							<TabsContent
								value="business"
								className="mt-6 space-y-6"
							>
								<div>
									<div className="flex items-center gap-2 mb-2">
										<h2 className="text-xl font-semibold">Business Settings</h2>
										<Badge
											variant="secondary"
											className="flex items-center gap-1"
										>
											<CheckCircle className="h-3 w-3" />
											Editable
										</Badge>
									</div>
									<p className="text-muted-foreground mb-6">
										Business-wide settings that affect all terminals. These
										changes are synced across all devices in your store and take
										effect immediately.
									</p>

									<Alert className="mb-6">
										<Building className="h-4 w-4" />
										<AlertDescription>
											<strong>Business Settings:</strong> These settings affect
											all terminals in your store. Changes are saved to the
											central database and automatically synchronized across all
											devices.
										</AlertDescription>
									</Alert>

									<div className="space-y-6">
										<BusinessStoreInfo />
										<BusinessHoursSettings />
										<BusinessFinancialSettings />
										<BusinessReceiptSettings />
									</div>
								</div>
							</TabsContent>
						)}

						{/* Hardware Settings Tab */}
						{permissions.canAccessHardwareSettings() && (
							<TabsContent
								value="hardware"
								className="mt-6 space-y-6"
							>
								<div>
									<h2 className="text-xl font-semibold mb-2">
										Hardware Configuration
									</h2>
									<p className="text-muted-foreground mb-6">
										Configure printers, payment terminals, and other hardware
										devices connected to this terminal.
									</p>

									<Alert className="mb-6">
										<Printer className="h-4 w-4" />
										<AlertDescription>
											<strong>Mixed Settings:</strong> Some hardware settings
											are terminal-specific (printer connections) while others
											are business-wide (payment provider). Look for the badges
											to identify which settings you can modify.
										</AlertDescription>
									</Alert>

									<div className="space-y-6">
										<PrinterSettings />
										<GlobalSettings />
										<TerminalSettings />
									</div>
								</div>
							</TabsContent>
						)}

						{/* Advanced Settings Tab */}
						{permissions.canAccessAdvancedSettings() && (
							<TabsContent
								value="advanced"
								className="mt-6 space-y-6"
							>
								<div>
									<h2 className="text-xl font-semibold mb-2">
										Advanced Settings
									</h2>
									<p className="text-muted-foreground mb-6">
										API key management, debugging tools, and advanced system
										diagnostics.
									</p>
									{/* Sync Manager temporarily disabled for offline mode reimplementation later */}
									{/* 
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
									*/}
									<Alert>
										<Settings className="h-4 w-4" />
										<AlertDescription>
											<strong>Coming Soon:</strong> Advanced sync and offline
											features will be added in a future update. The POS system
											currently operates in online-only mode.
										</AlertDescription>
									</Alert>
								</div>
							</TabsContent>
						)}

						{/* Debug: Role Access Summary - only for development/testing */}
						{permissions.isOwner && (
							<TabsContent
								value="debug"
								className="mt-6 space-y-6"
							>
								<RoleBasedAccessSummary />
							</TabsContent>
						)}
					</div>
				</Tabs>
			</div>

			{/* Toast Notifications */}
			<Toaster />
		</div>
	);
};

export default SettingsPage;
