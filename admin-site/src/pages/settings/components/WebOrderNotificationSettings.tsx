import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import apiClient from "@/services/api/client";
import type { WebOrderSettings, Terminal } from "@/types";

import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormDescription,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import {
	Card,
	CardHeader,
	CardContent,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Volume2, Printer } from "lucide-react";

const webOrderSettingsSchema = z.object({
	enable_notifications: z.boolean(),
	play_notification_sound: z.boolean(),
	auto_print_receipt: z.boolean(),
	auto_print_kitchen: z.boolean(),
	web_receipt_terminals: z.array(z.string()).optional(),
});

type WebOrderSettingsFormValues = z.infer<typeof webOrderSettingsSchema>;

interface WebOrderSettingsData {
	terminals: Terminal[];
	settings: WebOrderSettings;
}

export function WebOrderNotificationSettings() {
	const queryClient = useQueryClient();

	const { data, isLoading, isError } = useQuery<WebOrderSettingsData, Error>({
		queryKey: ["webOrderSettings"],
		queryFn: async () => {
			const terminalsRes = await apiClient.get(
				"settings/terminal-registrations/"
			);
			const webOrderSettingsRes = await apiClient.get(
				"settings/web-order-settings/"
			);
			return {
				terminals: terminalsRes.data,
				settings: webOrderSettingsRes.data,
			};
		},
	});

	const { mutate: updateSettings, isPending: isUpdating } = useMutation<
		void,
		Error,
		WebOrderSettingsFormValues
	>({
		mutationFn: (formData) =>
			apiClient.patch("settings/web-order-settings/", formData),
		onSuccess: () => {
			toast.success("Settings updated successfully!");
			queryClient.invalidateQueries({ queryKey: ["webOrderSettings"] });
		},
		onError: (error) =>
			toast.error("Failed to update settings.", {
				description: error.message,
			}),
	});

	const form = useForm<WebOrderSettingsFormValues>({
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

	const onSubmit = (formData: WebOrderSettingsFormValues) => {
		updateSettings(formData);
	};

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
														checked={(field.value ?? []).includes(
															terminal.device_id
														)}
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
						className="w-full md:w-auto"
					>
						{isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						Save All Settings
					</Button>
				</form>
			</Form>
		</div>
	);
}
