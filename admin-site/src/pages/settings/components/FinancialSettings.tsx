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
import { toast } from "sonner";
import { useEffect } from "react";
import type { GlobalSettings } from "@/types";

const formSchema = z.object({
	tax_rate: z.coerce
		.number()
		.min(0, "Tax rate cannot be negative.")
		.max(1, "Tax rate must be less than 1 (e.g., 0.08 for 8%)."),
	surcharge_percentage: z.coerce
		.number()
		.min(0, "Surcharge cannot be negative.")
		.optional(),
	currency: z
		.string()
		.length(3, "Currency must be a 3-letter code (e.g., USD).")
		.toUpperCase(),
	allow_discount_stacking: z.boolean().optional(),
});

type SettingsFormValues = z.infer<typeof formSchema>;

export function FinancialSettings() {
	const queryClient = useQueryClient();

	const { data: settings, isLoading } = useQuery<GlobalSettings>({
		queryKey: ["globalSettings"],
		queryFn: getGlobalSettings,
	});

	const mutation = useMutation<void, Error, SettingsFormValues>({
		mutationFn: updateGlobalSettings,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["globalSettings"] });
			toast.success("Financial settings updated successfully!");
		},
		onError: (error: Error) => {
			toast.error(`Failed to update settings: ${error.message}`);
		},
	});

	const form = useForm<SettingsFormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			tax_rate: 0,
			surcharge_percentage: 0,
			currency: "USD",
			allow_discount_stacking: false,
		},
	});

	useEffect(() => {
		if (settings) {
			form.reset({
				tax_rate: settings.tax_rate || 0,
				surcharge_percentage: settings.surcharge_percentage || 0,
				currency: settings.currency || "USD",
				allow_discount_stacking: settings.allow_discount_stacking || false,
			});
		}
	}, [settings, form]);

	const onSubmit = (values: SettingsFormValues) => {
		mutation.mutate(values);
	};

	if (isLoading) {
		return <div>Loading financial settings...</div>;
	}

	return (
		<Form {...form}>
			<form
				onSubmit={form.handleSubmit(onSubmit)}
				className="space-y-8"
			>
				<FormField
					control={form.control}
					name="tax_rate"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Default Tax Rate</FormLabel>
							<FormControl>
								<Input
									type="number"
									step="0.001"
									placeholder="0.08"
									{...field}
								/>
							</FormControl>
							<FormDescription>
								The sales tax rate as a decimal (e.g., 0.08 for 8%).
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
							<FormLabel>Surcharge Percentage (Optional)</FormLabel>
							<FormControl>
								<Input
									type="number"
									step="0.001"
									placeholder="0.02"
									{...field}
								/>
							</FormControl>
							<FormDescription>
								A percentage-based surcharge applied to the subtotal (e.g., 0.02
								for 2%).
							</FormDescription>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="currency"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Currency Code</FormLabel>
							<FormControl>
								<Input
									placeholder="USD"
									{...field}
								/>
							</FormControl>
							<FormDescription>
								The 3-letter ISO 4217 currency code.
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
									If enabled, multiple discounts can be applied to a single
									order. If disabled, only one discount is allowed at a time.
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
				<Button
					type="submit"
					disabled={form.formState.isSubmitting || !form.formState.isDirty}
				>
					{form.formState.isSubmitting ? "Saving..." : "Save Changes"}
				</Button>
			</form>
		</Form>
	);
}
