import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
	getBusinessHours,
	updateBusinessHours,
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Clock, Globe } from "lucide-react";

// Common timezones for business use
const COMMON_TIMEZONES = [
	{ value: "UTC", label: "UTC (Coordinated Universal Time)" },
	{ value: "America/New_York", label: "Eastern Time (US & Canada)" },
	{ value: "America/Chicago", label: "Central Time (US & Canada)" },
	{ value: "America/Denver", label: "Mountain Time (US & Canada)" },
	{ value: "America/Los_Angeles", label: "Pacific Time (US & Canada)" },
	{ value: "America/Anchorage", label: "Alaska Time" },
	{ value: "Pacific/Honolulu", label: "Hawaii Time" },
	{ value: "Europe/London", label: "Greenwich Mean Time" },
	{ value: "Europe/Paris", label: "Central European Time" },
	{ value: "Europe/Berlin", label: "Central European Time (Germany)" },
	{ value: "Asia/Tokyo", label: "Japan Standard Time" },
	{ value: "Asia/Shanghai", label: "China Standard Time" },
	{ value: "Australia/Sydney", label: "Australian Eastern Time" },
];

const formSchema = z.object({
	opening_time: z.string().optional(),
	closing_time: z.string().optional(),
	timezone: z.string().min(1, "Timezone is required"),
	enable_business_hours: z.boolean(),
});

export function BusinessHoursSettings() {
	const queryClient = useQueryClient();

	const { data: businessHours, isLoading } = useQuery({
		queryKey: ["businessHours"],
		queryFn: getBusinessHours,
	});

	const mutation = useMutation({
		mutationFn: updateBusinessHours,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["businessHours"] });
			queryClient.invalidateQueries({ queryKey: ["globalSettings"] });
			toast.success("Business hours updated successfully!");
		},
		onError: (error) => {
			toast.error("Failed to update business hours", {
				description: error.message,
			});
		},
	});

	const form = useForm({
		resolver: zodResolver(formSchema),
		defaultValues: {
			opening_time: "",
			closing_time: "",
			timezone: "UTC",
			enable_business_hours: false,
		},
	});

	const enableBusinessHours = form.watch("enable_business_hours");

	// Update form when data is loaded
	React.useEffect(() => {
		if (businessHours) {
			console.log("BusinessHours data received:", businessHours);
			console.log("Timezone from API:", businessHours.timezone);
			
			const hasBusinessHours =
				businessHours.opening_time && businessHours.closing_time;

			const resetValues = {
				opening_time: businessHours.opening_time || "",
				closing_time: businessHours.closing_time || "",
				timezone: businessHours.timezone || "UTC",
				enable_business_hours: hasBusinessHours,
			};

			console.log("Resetting form with values:", resetValues);
			form.reset(resetValues);
		}
	}, [businessHours, form]);

	const onSubmit = (values) => {
		// If business hours are disabled, send null for opening/closing times
		const submitData = {
			...values,
			opening_time: values.enable_business_hours ? values.opening_time : null,
			closing_time: values.enable_business_hours ? values.closing_time : null,
		};

		// Remove the enable_business_hours field as it's not part of the backend model
		delete submitData.enable_business_hours;

		mutation.mutate(submitData);
	};

	if (isLoading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Clock className="h-5 w-5" />
						Business Hours
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-center py-8">
						<div className="text-center">
							<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
							<p className="mt-2 text-sm text-muted-foreground">
								Loading business hours...
							</p>
						</div>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Clock className="h-5 w-5" />
					Business Hours & Timezone
				</CardTitle>
				<CardDescription>
					Configure your business operating hours and timezone for accurate
					reporting and order management.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="space-y-6"
					>
						<FormField
							control={form.control}
							name="timezone"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="flex items-center gap-2">
										<Globe className="h-4 w-4" />
										Business Timezone
									</FormLabel>
									<Select
										onValueChange={field.onChange}
										value={field.value || "UTC"}
										key={field.value} // Force re-render when value changes
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Select timezone" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{COMMON_TIMEZONES.map((tz) => (
												<SelectItem key={tz.value} value={tz.value}>
													{tz.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FormDescription>
										The timezone your business operates in. This affects
										reporting and order timestamps.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="enable_business_hours"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
									<div className="space-y-0.5">
										<FormLabel className="text-base">
											Enable Business Hours
										</FormLabel>
										<FormDescription>
											Set specific operating hours for your business. If
											disabled, business is considered always open.
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

						{enableBusinessHours && (
							<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
								<FormField
									control={form.control}
									name="opening_time"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Opening Time</FormLabel>
											<FormControl>
												<Input
													type="time"
													{...field}
												/>
											</FormControl>
											<FormDescription>
												When your business opens each day.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="closing_time"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Closing Time</FormLabel>
											<FormControl>
												<Input
													type="time"
													{...field}
												/>
											</FormControl>
											<FormDescription>
												When your business closes each day.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
						)}

						<div className="bg-muted/50 rounded-lg p-4">
							<h4 className="text-sm font-medium mb-2">
								How Business Hours Are Used:
							</h4>
							<ul className="text-sm text-muted-foreground space-y-1">
								<li>• Order reporting and analytics</li>
								<li>• Web order restrictions</li>
								<li>• Business performance calculations</li>
								<li>• Staff scheduling and time tracking</li>
								{!enableBusinessHours && (
									<li className="text-amber-600">
										• Currently disabled - business considered always open
									</li>
								)}
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