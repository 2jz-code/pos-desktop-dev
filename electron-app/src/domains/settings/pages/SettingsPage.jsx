import React, { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/shared/components/ui/toaster";
import { Separator } from "@/shared/components/ui/separator";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Bell, Building2, Palette, CreditCard, RefreshCw, AlertCircle } from "lucide-react";
import { useOfflineSettings } from "@/shared/hooks/useOfflineSettings";
import { useOnlineStatus } from "@/shared/hooks";
import terminalRegistrationService from "@/services/TerminalRegistrationService";

import { FinancialSettings } from "../components/FinancialSettings";
import { ReceiptSettings } from "../components/ReceiptSettings";
import { DeviceSettings } from "../components/DeviceSettings";
import { PrinterSettings } from "../components/PrinterSettings";
import { PaymentSettings } from "../components/PaymentSettings";
import { WebOrderNotificationSettings } from "../components/WebOrderNotificationSettings";
import { InventorySettings } from "../components/InventorySettings";
import { StoreInfoSettings } from "../components/StoreInfoSettings";

export function SettingsPage() {
	const queryClient = useQueryClient();
	const isOnline = useOnlineStatus();
	const { data: offlineSettings, loading, error, refetch } = useOfflineSettings();

	// Get location ID and device ID for seeding query caches
	const locationId = terminalRegistrationService.getLocationId();
	const terminalConfig = terminalRegistrationService.getTerminalConfig();
	const deviceId = terminalConfig?.device_id;

	// Seed React Query cache when offline data is available
	// This allows child components to use their existing useQuery hooks
	// and get data from cache immediately
	useEffect(() => {
		if (offlineSettings?.global_settings) {
			queryClient.setQueryData(["globalSettings"], offlineSettings.global_settings);
		}
		if (offlineSettings?.store_location && locationId) {
			queryClient.setQueryData(
				["storeLocation", locationId],
				offlineSettings.store_location
			);
		}
		// Seed printers cache for PrinterSettings component
		if (offlineSettings?.printers) {
			queryClient.setQueryData(["printers"], offlineSettings.printers);
		}
		// Seed kitchen zones cache for PrinterSettings component
		if (offlineSettings?.kitchen_zones) {
			queryClient.setQueryData(["kitchenZones"], offlineSettings.kitchen_zones);
		}
		// Seed terminal registration cache for DeviceSettings component
		if (offlineSettings?.terminal && deviceId) {
			queryClient.setQueryData(["terminalRegistration", deviceId], offlineSettings.terminal);
		}
	}, [offlineSettings, queryClient, locationId, deviceId]);

	// Use cached data for display
	const globalSettings = offlineSettings?.global_settings;

	// Loading state
	if (loading && !globalSettings) {
		return (
			<div className="flex flex-col h-full">
				<div className="flex-shrink-0 p-4 pt-6 pb-4 md:px-8">
					<h2 className="text-3xl font-bold tracking-tight">Settings</h2>
				</div>
				<div className="flex items-center justify-center flex-1">
					<div className="text-center">
						<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
						<p className="mt-2 text-sm text-muted-foreground">
							Loading settings...
						</p>
					</div>
				</div>
			</div>
		);
	}

	// Error state (no cache and API failed)
	if (error && !globalSettings) {
		return (
			<div className="flex flex-col h-full">
				<div className="flex-shrink-0 p-4 pt-6 pb-4 md:px-8">
					<h2 className="text-3xl font-bold tracking-tight">Settings</h2>
				</div>
				<div className="flex items-center justify-center flex-1">
					<Card className="max-w-md">
						<CardContent className="pt-6">
							<div className="text-center space-y-4">
								<AlertCircle className="h-12 w-12 text-destructive mx-auto" />
								<div>
									<h3 className="font-semibold">Failed to load settings</h3>
									<p className="text-sm text-muted-foreground mt-1">
										{error.message || "Unable to load settings data"}
									</p>
								</div>
								<Button
									onClick={() => refetch({ forceApi: true })}
									disabled={!isOnline}
								>
									<RefreshCw className="h-4 w-4 mr-2" />
									Try Again
								</Button>
								{!isOnline && (
									<p className="text-xs text-muted-foreground">
										You're offline. Connect to the internet to retry.
									</p>
								)}
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		);
	}

	return (
		<>
			<Toaster />
			<div className="p-4 md:p-8 space-y-8">
				{/* Header */}
				<h2 className="text-3xl font-bold tracking-tight">Settings</h2>

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

				{/* Location Information */}
				<div className="space-y-6">
					<div>
						<h3 className="text-xl font-semibold tracking-tight">Location Information</h3>
						<p className="text-sm text-muted-foreground">
							Configure information for this store location
						</p>
					</div>
					<StoreInfoSettings />
				</div>

				<Separator />

				{/* Operations & Finance */}
				<div className="space-y-6">
					<div>
						<h3 className="text-xl font-semibold tracking-tight">Operations & Finance</h3>
						<p className="text-sm text-muted-foreground">
							Manage financial settings and inventory
						</p>
					</div>
					<FinancialSettings />
					<InventorySettings />
				</div>

				<Separator />

				{/* Device & Hardware */}
				<div className="space-y-6">
					<div>
						<h3 className="text-xl font-semibold tracking-tight">Device & Hardware</h3>
						<p className="text-sm text-muted-foreground">
							Configure this device, printers, and payment processing
						</p>
					</div>
					<DeviceSettings />
					<PrinterSettings />
					<PaymentSettings />
				</div>

				<Separator />

				{/* Customer Experience */}
				<div className="space-y-6">
					<div>
						<h3 className="text-xl font-semibold tracking-tight">Customer Experience</h3>
						<p className="text-sm text-muted-foreground">
							Configure receipts and order notifications
						</p>
					</div>
					<ReceiptSettings />
					<WebOrderNotificationSettings />
				</div>
			</div>
		</>
	);
}
