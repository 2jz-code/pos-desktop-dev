import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
	getGlobalSettings,
	updateGlobalSettings,
} from "@/services/api/settingsService";

import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Store, Palette, DollarSign, Percent, Bell } from "lucide-react";
import type { GlobalSettings } from "@/types";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";

const formSchema = z.object({
	brand_name: z.string().min(1, "Brand name is required"),
	brand_primary_color: z.string().regex(/^#[0-9A-F]{6}$/i, "Must be a valid hex color (e.g., #FF5733)").optional(),
	brand_secondary_color: z.string().regex(/^#[0-9A-F]{6}$/i, "Must be a valid hex color (e.g., #FFFFFF)").optional(),
	currency: z
		.string()
		.length(3, "Currency must be a 3-letter code (e.g., USD)")
		.toUpperCase(),
	surcharge_percentage: z.coerce
		.number()
		.min(0, "Surcharge cannot be negative")
		.optional(),
	allow_discount_stacking: z.boolean().optional(),
	// Web order notification defaults (tenant-wide)
	web_order_defaults: z.object({
		enable_notifications: z.boolean(),
		play_notification_sound: z.boolean(),
		auto_print_receipt: z.boolean(),
		auto_print_kitchen: z.boolean(),
	}),
});

type BrandFormValues = z.infer<typeof formSchema>;

export function BrandInfoSettings() {
	const queryClient = useQueryClient();

	const { data: settings, isLoading } = useQuery<GlobalSettings>({
		queryKey: ["globalSettings"],
		queryFn: getGlobalSettings,
	});

	const mutation = useMutation<void, Error, BrandFormValues>({
		mutationFn: updateGlobalSettings,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["globalSettings"] });
			toast.success("Brand information updated successfully!");
		},
		onError: (error: Error) => {
			toast.error("Failed to update brand information", {
				description: error.message,
			});
		},
	});

	const form = useForm<BrandFormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			brand_name: "",
			brand_primary_color: "#000000",
			brand_secondary_color: "#FFFFFF",
			currency: "USD",
			surcharge_percentage: 0,
			allow_discount_stacking: false,
			web_order_defaults: {
				enable_notifications: true,
				play_notification_sound: true,
				auto_print_receipt: true,
				auto_print_kitchen: true,
			},
		},
	});

	// Update form when data is loaded
	React.useEffect(() => {
		if (settings) {
			form.reset({
				brand_name: settings.brand_name || "",
				brand_primary_color: settings.brand_primary_color || "#000000",
				brand_secondary_color: settings.brand_secondary_color || "#FFFFFF",
				currency: settings.currency || "USD",
				surcharge_percentage: settings.surcharge_percentage || 0,
				allow_discount_stacking: settings.allow_discount_stacking || false,
				web_order_defaults: settings.web_order_defaults || {
					enable_notifications: true,
					play_notification_sound: true,
					auto_print_receipt: true,
					auto_print_kitchen: true,
				},
			});
		}
	}, [settings, form]);

	const onSubmit = (values: BrandFormValues) => {
		mutation.mutate(values);
	};

	if (isLoading) {
		return (
			<Card className="border-border bg-card">
				<CardHeader>
					<div className="flex items-center gap-2">
						<div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
							<Store className="h-4 w-4 text-blue-600 dark:text-blue-400" />
						</div>
						<div>
							<CardTitle className="text-foreground">Brand Information</CardTitle>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-center py-8">
						<div className="text-center">
							<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
							<p className="mt-2 text-sm text-muted-foreground">
								Loading brand information...
							</p>
						</div>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="border-border bg-card">
			<CardHeader>
				<div className="flex items-center gap-2">
					<div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
						<Store className="h-4 w-4 text-blue-600 dark:text-blue-400" />
					</div>
					<div>
						<CardTitle className="text-foreground">Brand Information</CardTitle>
						<CardDescription>
							Configure your brand identity and business rules that apply across all locations.
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="space-y-6"
					>
						{/* Brand Identity Section */}
						<div className="space-y-4">
							<div className="flex items-center gap-2 text-sm font-medium">
								<Store className="h-4 w-4" />
								<span>Brand Identity</span>
							</div>

							<FormField
								control={form.control}
								name="brand_name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Brand Name</FormLabel>
										<FormControl>
											<Input
												placeholder="Your Brand Name"
												{...field}
											/>
										</FormControl>
										<FormDescription>
											Your company's brand name used across all locations.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<FormField
									control={form.control}
									name="brand_primary_color"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="flex items-center gap-2">
												<Palette className="h-4 w-4" />
												Primary Color
											</FormLabel>
											<div className="flex gap-2">
												<FormControl>
													<Input
														type="color"
														className="w-20 h-10 p-1 cursor-pointer"
														{...field}
													/>
												</FormControl>
												<FormControl>
													<Input
														type="text"
														placeholder="#000000"
														className="flex-1"
														{...field}
													/>
												</FormControl>
											</div>
											<FormDescription>
												Main brand color for UI elements.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="brand_secondary_color"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="flex items-center gap-2">
												<Palette className="h-4 w-4" />
												Secondary Color
											</FormLabel>
											<div className="flex gap-2">
												<FormControl>
													<Input
														type="color"
														className="w-20 h-10 p-1 cursor-pointer"
														{...field}
													/>
												</FormControl>
												<FormControl>
													<Input
														type="text"
														placeholder="#FFFFFF"
														className="flex-1"
														{...field}
													/>
												</FormControl>
											</div>
											<FormDescription>
												Secondary brand color for accents.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
						</div>

						{/* Financial Rules Section */}
						<div className="space-y-4 pt-6 border-t">
							<div className="flex items-center gap-2 text-sm font-medium">
								<DollarSign className="h-4 w-4" />
								<span>Financial Rules</span>
							</div>

							<FormField
								control={form.control}
								name="currency"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Currency Code</FormLabel>
										<FormControl>
											<Input
												placeholder="USD"
												maxLength={3}
												{...field}
												onChange={(e) => field.onChange(e.target.value.toUpperCase())}
											/>
										</FormControl>
										<FormDescription>
											The 3-letter ISO 4217 currency code used across all locations.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="surcharge_percentage"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="flex items-center gap-2">
											<Percent className="h-4 w-4" />
											Surcharge Percentage
										</FormLabel>
										<FormControl>
											<Input
												type="number"
												step="0.0001"
												placeholder="0.02"
												{...field}
											/>
										</FormControl>
										<FormDescription>
											A percentage-based surcharge applied to the subtotal (e.g., 0.02 for 2%).
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="allow_discount_stacking"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
										<div className="space-y-0.5">
											<FormLabel className="text-base">
												Allow Discount Stacking
											</FormLabel>
											<FormDescription>
												If enabled, multiple discounts can be applied to a single order.
												If disabled, only one discount is allowed at a time.
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
						</div>

						{/* Web Order Notification Defaults Section - Collapsible */}
						<Collapsible className="space-y-4 pt-6 border-t">
							<CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-primary">
								<Bell className="h-4 w-4" />
								<span>Web Order Notification Defaults (Tenant-Wide)</span>
								<span className="text-xs text-muted-foreground ml-auto">(Click to expand)</span>
							</CollapsibleTrigger>
							<CollapsibleContent className="space-y-4 pt-4">
								<div className="bg-muted/30 rounded-lg p-3 text-sm text-muted-foreground mb-4">
									<p>These are tenant-wide default settings. Each location can override these in the Locations tab.</p>
								</div>

								<FormField
									control={form.control}
									name="web_order_defaults.enable_notifications"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
											<div className="space-y-0.5">
												<FormLabel className="text-base">
													Enable Notifications
												</FormLabel>
												<FormDescription>
													Default for all locations. Show POS notifications for new web orders.
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
									name="web_order_defaults.play_notification_sound"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
											<div className="space-y-0.5">
												<FormLabel className="text-base">
													Play Notification Sound
												</FormLabel>
												<FormDescription>
													Default for all locations. Play a sound when web orders arrive.
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
									name="web_order_defaults.auto_print_receipt"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
											<div className="space-y-0.5">
												<FormLabel className="text-base">
													Auto-Print Receipts
												</FormLabel>
												<FormDescription>
													Default for all locations. Automatically print customer receipts.
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
									name="web_order_defaults.auto_print_kitchen"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
											<div className="space-y-0.5">
												<FormLabel className="text-base">
													Auto-Print Kitchen Tickets
												</FormLabel>
												<FormDescription>
													Default for all locations. Automatically print kitchen tickets.
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
							</CollapsibleContent>
						</Collapsible>

						<div className="bg-muted/50 rounded-lg p-4">
							<h4 className="text-sm font-medium mb-2">
								About Brand Settings:
							</h4>
							<ul className="text-sm text-muted-foreground space-y-1">
								<li>• Brand information applies across all store locations</li>
								<li>• Currency and financial rules are consistent throughout your business</li>
								<li>• Location-specific settings (address, phone, tax rate) are configured per location</li>
								<li>• Web order notification defaults can be overridden per-location in the Locations tab</li>
							</ul>
						</div>

						<Button
							type="submit"
							disabled={mutation.isPending || !form.formState.isDirty}
						>
							{mutation.isPending ? "Saving..." : "Save Changes"}
						</Button>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
}
