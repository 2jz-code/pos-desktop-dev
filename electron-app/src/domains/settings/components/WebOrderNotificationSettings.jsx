import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import apiClient from "@/shared/lib/apiClient";

import { Button } from "@/shared/components/ui/button";
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
	enable_notifications: z.boolean(),
	play_notification_sound: z.boolean(),
	auto_print_receipt: z.boolean(),
	auto_print_kitchen: z.boolean(),
	web_receipt_terminals: z.array(z.string()).optional(),
});

export function WebOrderNotificationSettings() {
	const queryClient = useQueryClient();
	const { connectionStatus, isConnected } = useNotificationManager();

	const { data, isLoading, isError } = useQuery({
		queryKey: ["webOrderSettings"],
		queryFn: async () => {
			const terminalsRes = await apiClient.get(
				"settings/terminal-registrations/"
			);
			const webOrderSettingsRes = await apiClient.get(
				"settings/web-order-settings/"
			);
			return {
				terminals: terminalsRes.data.results,
				settings: webOrderSettingsRes.data,
			};
		},
	});

	const { mutate: updateSettings, isPending: isUpdating } = useMutation({
		mutationFn: (formData) =>
			apiClient.patch("settings/web-order-settings/", formData),
		onSuccess: () => {
			toast.success("Settings updated successfully!");
			queryClient.invalidateQueries({ queryKey: ["webOrderSettings"] });
		},
		onError: (error) =>
			toast.error("Failed to update settings.", { description: error.message }),
	});

	const form = useForm({
		resolver: zodResolver(webOrderSettingsSchema),
		defaultValues: {
			enable_notifications: false,
			play_notification_sound: false,
			auto_print_receipt: false,
			auto_print_kitchen: false,
			web_receipt_terminals: [],
		},
	});

	useEffect(() => {
		if (data) {
			form.reset({
				enable_notifications: data.settings.enable_notifications,
				play_notification_sound: data.settings.play_notification_sound,
				auto_print_receipt: data.settings.auto_print_receipt,
				auto_print_kitchen: data.settings.auto_print_kitchen,
				web_receipt_terminals:
					data.settings.web_receipt_terminals?.map(
						(terminal) => terminal.device_id
					) || [],
			});
		}
	}, [data, form]);

	const onSubmit = (formData) => {
		// Find the selected terminal object for receipt printing
		if (
			formData.web_receipt_terminals &&
			formData.web_receipt_terminals.length > 0
		) {
			const selectedDeviceId = formData.web_receipt_terminals[0]; // Assuming one for now
			const selectedTerminal = data.terminals.find(
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

	if (isLoading)
		return (
			<div className="flex items-center space-x-2">
				<Loader2 className="w-5 h-5 animate-spin" />
				<p>Loading settings...</p>
			</div>
		);
	if (isError) return <p className="text-red-500">Error loading settings.</p>;

	return (
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
								name="enable_notifications"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
										<div className="space-y-0.5">
											<FormLabel className="text-base">
												Enable Notifications
											</FormLabel>
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
								name="play_notification_sound"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
										<div className="space-y-0.5">
											<FormLabel className="text-base">Play Sound</FormLabel>
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
								name="auto_print_receipt"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
										<div className="space-y-0.5">
											<FormLabel className="text-base">
												Auto-Print Customer Receipts
											</FormLabel>
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
								name="auto_print_kitchen"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
										<div className="space-y-0.5">
											<FormLabel className="text-base">
												Auto-Print Kitchen Tickets
											</FormLabel>
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
								name="web_receipt_terminals"
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
										{data?.terminals?.map((terminal) => (
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
										{data?.terminals?.length === 0 && (
											<p className="text-sm text-muted-foreground pt-2">
												No registered POS terminals found.
											</p>
										)}
									</div>
								)}
							/>
						</CardContent>
					</Card>

					<Button
						type="submit"
						disabled={isUpdating}
					>
						{isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						Save Changes
					</Button>
				</form>
			</Form>
		</div>
	);
}
