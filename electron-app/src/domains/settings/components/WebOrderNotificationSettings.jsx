import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import apiClient from "@/shared/lib/apiClient";
import terminalRegistrationService from "@/services/TerminalRegistrationService";
import { getStoreLocation, updateStoreLocation } from "../services/settingsService";
import { useOnlineStatus } from "@/shared/hooks";

import { OnlineOnlyButton } from "@/shared/components/ui/OnlineOnlyButton";
import { OfflineOverlay } from "@/shared/components/ui/OfflineOverlay";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormDescription,
} from "@/shared/components/ui/form";
import { Switch } from "@/shared/components/ui/switch";
import {
	Card,
	CardHeader,
	CardContent,
	CardTitle,
	CardDescription,
} from "@/shared/components/ui/card";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Loader2, Bell, Volume2, Printer } from "lucide-react";
import { useNotificationManager } from "@/shared/hooks/useNotificationManager";
import { Badge } from "@/shared/components/ui/badge";

const webOrderSettingsSchema = z.object({
	accepts_web_orders: z.boolean(),
	enable_web_notifications: z.boolean().nullable(),
	play_web_notification_sound: z.boolean().nullable(),
	auto_print_web_receipt: z.boolean().nullable(),
	auto_print_web_kitchen: z.boolean().nullable(),
	web_notification_terminals: z.array(z.string()).optional(),
});

export function WebOrderNotificationSettings() {
	const queryClient = useQueryClient();
	const { connectionStatus, isConnected } = useNotificationManager();
	const isOnline = useOnlineStatus();

	// Get location ID from terminal config
	const locationId = terminalRegistrationService.getLocationId();

	// Get cached store location (seeded by SettingsPage from offline settings)
	const { data: cachedStoreLocation } = useQuery({
		queryKey: ["storeLocation", locationId],
		enabled: false, // Don't fetch - just read from cache
	});

	const { data, isLoading, isError } = useQuery({
		queryKey: ["webOrderSettings", locationId],
		queryFn: async () => {
			const terminalsRes = await apiClient.get(
				`terminals/registrations/?store_location=${locationId}`
			);
			const locationRes = await getStoreLocation(locationId);

			return {
				terminals: terminalsRes.data.results || terminalsRes.data,
				location: locationRes,
			};
		},
		enabled: !!locationId && isOnline, // Only fetch when online
	});

	// Use cached data when offline, API data when online
	const locationData = data?.location || cachedStoreLocation;
	const terminalsData = data?.terminals || [];

	const { mutate: updateSettings, isPending: isUpdating } = useMutation({
		mutationFn: (formData) => {
			// Extract accepts_web_orders from formData
			const { accepts_web_orders, ...overrides } = formData;

			return updateStoreLocation(locationId, {
				accepts_web_orders,
				web_order_settings: {
					overrides
				}
			});
		},
		onSuccess: () => {
			toast.success("Settings updated successfully!");
			queryClient.invalidateQueries({ queryKey: ["webOrderSettings", locationId] });
		},
		onError: (error) =>
			toast.error("Failed to update settings.", { description: error.message }),
	});

	const form = useForm({
		resolver: zodResolver(webOrderSettingsSchema),
		defaultValues: {
			accepts_web_orders: true,
			enable_web_notifications: null,
			play_web_notification_sound: null,
			auto_print_web_receipt: null,
			auto_print_web_kitchen: null,
			web_notification_terminals: [],
		},
	});

	useEffect(() => {
		if (locationData) {
			const overrides = locationData.web_order_settings?.overrides || {};

			const formValues = {
				accepts_web_orders: locationData.accepts_web_orders ?? true,
				enable_web_notifications: overrides.enable_web_notifications ?? null,
				play_web_notification_sound: overrides.play_web_notification_sound ?? null,
				auto_print_web_receipt: overrides.auto_print_web_receipt ?? null,
				auto_print_web_kitchen: overrides.auto_print_web_kitchen ?? null,
				web_notification_terminals: overrides.web_notification_terminals || [],
			};

			form.reset(formValues);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [locationData]); // 'form' is a stable reference from useForm(), no need to include it

	const onSubmit = (formData) => {
		// Find the selected terminal object for receipt printing
		if (
			formData.web_notification_terminals &&
			formData.web_notification_terminals.length > 0
		) {
			const selectedDeviceId = formData.web_notification_terminals[0]; // Assuming one for now
			const selectedTerminal = terminalsData.find(
				(t) => t.device_id === selectedDeviceId
			);

			if (selectedTerminal?.receipt_printer) {
				localStorage.setItem(
					"localReceiptPrinter",
					JSON.stringify(selectedTerminal.receipt_printer)
				);
				toast.info(
					`Receipt printer set to: ${selectedTerminal.receipt_printer.name}`
				);
			} else {
				localStorage.removeItem("localReceiptPrinter");
			}
		} else {
			localStorage.removeItem("localReceiptPrinter");
		}

		updateSettings(formData);
	};

	const getConnectionStatusColor = () =>
		isConnected ? "text-green-600" : "text-red-600";
	const getConnectionStatusText = () =>
		isConnected ? "Connected" : "Disconnected";

	// Show loading only when online and actually fetching
	if (isLoading && isOnline)
		return (
			<div className="flex items-center space-x-2">
				<Loader2 className="w-5 h-5 animate-spin" />
				<p>Loading settings...</p>
			</div>
		);

	// Show error only when online and failed - offline uses cached data
	if (isError && isOnline && !locationData)
		return <p className="text-red-500">Error loading settings.</p>;

	return (
		<OfflineOverlay message="Web order settings are not available offline">
		<div className="space-y-6">
			{/* Connection Status Card */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Bell className="h-5 w-5" />
						Notification System Status
					</CardTitle>
					<CardDescription>
						Real-time connection status of the web order notification system
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<div className="flex items-center gap-2">
								<div
									className={`w-3 h-3 rounded-full ${
										isConnected ? "bg-green-500" : "bg-red-500"
									} ${!isConnected ? "animate-pulse" : ""}`}
								/>
								<span className={`font-medium ${getConnectionStatusColor()}`}>
									{getConnectionStatusText()}
								</span>
							</div>
						</div>
						<Badge variant={isConnected ? "default" : "destructive"}>
							{connectionStatus}
						</Badge>
					</div>
				</CardContent>
			</Card>

			{/* Notification Settings Form */}
			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className="space-y-6"
				>
					{/* Notification Settings Card */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Volume2 className="h-5 w-5" />
								Web Order Notifications
							</CardTitle>
							<CardDescription>
								Configure how the POS system handles notifications for new web
								orders
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<FormField
								control={form.control}
								name="accepts_web_orders"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 bg-muted/30">
										<div className="space-y-0.5">
											<FormLabel className="text-base font-semibold">
												Accepts Web Orders
											</FormLabel>
											<FormDescription className="text-xs text-muted-foreground">
												Whether this location accepts online orders for pickup/delivery
											</FormDescription>
										</div>
										<FormControl>
											<Switch
												checked={field.value}
												onCheckedChange={field.onChange}
											/>
										</FormControl>
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="enable_web_notifications"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
										<div className="space-y-0.5">
											<FormLabel className="text-base">
												Enable Notifications
											</FormLabel>
											<FormDescription className="text-xs text-muted-foreground">
												{field.value === null && locationData?.web_order_settings ? (
													<span className="italic">
														Using tenant default: {locationData.web_order_settings.enable_notifications ? 'Enabled' : 'Disabled'}
													</span>
												) : field.value !== null ? (
													<span className="font-medium text-primary">
														Location override active
													</span>
												) : null}
											</FormDescription>
										</div>
										<FormControl>
											<Switch
												checked={field.value ?? locationData?.web_order_settings?.enable_notifications ?? false}
												onCheckedChange={(checked) => field.onChange(checked)}
											/>
										</FormControl>
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="play_web_notification_sound"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
										<div className="space-y-0.5">
											<FormLabel className="text-base">Play Sound</FormLabel>
											<FormDescription className="text-xs text-muted-foreground">
												{field.value === null && locationData?.web_order_settings ? (
													<span className="italic">
														Using tenant default: {locationData.web_order_settings.play_notification_sound ? 'Enabled' : 'Disabled'}
													</span>
												) : field.value !== null ? (
													<span className="font-medium text-primary">
														Location override active
													</span>
												) : null}
											</FormDescription>
										</div>
										<FormControl>
											<Switch
												checked={field.value ?? locationData?.web_order_settings?.play_notification_sound ?? false}
												onCheckedChange={(checked) => field.onChange(checked)}
											/>
										</FormControl>
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="auto_print_web_receipt"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
										<div className="space-y-0.5">
											<FormLabel className="text-base">
												Auto-Print Customer Receipts
											</FormLabel>
											<FormDescription className="text-xs text-muted-foreground">
												{field.value === null && locationData?.web_order_settings ? (
													<span className="italic">
														Using tenant default: {locationData.web_order_settings.auto_print_receipt ? 'Enabled' : 'Disabled'}
													</span>
												) : field.value !== null ? (
													<span className="font-medium text-primary">
														Location override active
													</span>
												) : null}
											</FormDescription>
										</div>
										<FormControl>
											<Switch
												checked={field.value ?? locationData?.web_order_settings?.auto_print_receipt ?? false}
												onCheckedChange={(checked) => field.onChange(checked)}
											/>
										</FormControl>
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="auto_print_web_kitchen"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
										<div className="space-y-0.5">
											<FormLabel className="text-base">
												Auto-Print Kitchen Tickets
											</FormLabel>
											<FormDescription className="text-xs text-muted-foreground">
												{field.value === null && locationData?.web_order_settings ? (
													<span className="italic">
														Using tenant default: {locationData.web_order_settings.auto_print_kitchen ? 'Enabled' : 'Disabled'}
													</span>
												) : field.value !== null ? (
													<span className="font-medium text-primary">
														Location override active
													</span>
												) : null}
											</FormDescription>
										</div>
										<FormControl>
											<Switch
												checked={field.value ?? locationData?.web_order_settings?.auto_print_kitchen ?? false}
												onCheckedChange={(checked) => field.onChange(checked)}
											/>
										</FormControl>
									</FormItem>
								)}
							/>
						</CardContent>
					</Card>

					{/* Auto-Print Terminals Card */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Printer className="h-5 w-5" />
								Web Order Auto-Printing
							</CardTitle>
							<CardDescription>
								Select which printers should automatically print receipts for
								web orders. This requires &quot;Auto-Print Customer
								Receipts&quot; to be enabled.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Controller
								name="web_notification_terminals"
								control={form.control}
								render={({ field }) => (
									<div className="space-y-2">
										<FormLabel className="text-destructive">
											Available Printers
										</FormLabel>
										<FormDescription>
											These are the printers connected to registered POS
											terminals.
										</FormDescription>
										{terminalsData?.map((terminal) => (
											<FormItem
												key={terminal.device_id}
												className="flex flex-row items-center justify-between rounded-lg border p-4"
											>
												<FormLabel className="font-normal">
													<div className="flex flex-col">
														<span className="font-medium">
															{terminal.nickname}
														</span>
														<span className="text-xs text-muted-foreground">
															ID: {terminal.device_id}
														</span>
													</div>
												</FormLabel>
												<FormControl>
													<Checkbox
														checked={field.value.includes(terminal.device_id)}
														onCheckedChange={(checked) => {
															const currentValue = field.value || [];
															const newValue = checked
																? [...currentValue, terminal.device_id]
																: currentValue.filter(
																		(id) => id !== terminal.device_id
																  );
															field.onChange(newValue);
														}}
													/>
												</FormControl>
											</FormItem>
										))}
										{terminalsData?.length === 0 && (
											<p className="text-sm text-muted-foreground pt-2">
												No registered POS terminals found.
											</p>
										)}
									</div>
								)}
							/>
						</CardContent>
					</Card>

					<OnlineOnlyButton
						type="submit"
						disabled={isUpdating}
						disabledMessage="Saving notification settings requires internet connection"
					>
						{isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						Save Changes
					</OnlineOnlyButton>
				</form>
			</Form>
		</div>
		</OfflineOverlay>
	);
}
