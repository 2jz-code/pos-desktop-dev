import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import terminalRegistrationService from "@/services/TerminalRegistrationService";
import {
	getGlobalSettings,
	getStoreLocation,
	updateStoreLocation,
} from "../services/settingsService";

import { Button } from "@/shared/components/ui/button";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/shared/components/ui/form";
import { Input } from "@/shared/components/ui/input";
import { Switch } from "@/shared/components/ui/switch";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { toast } from "sonner";
import { DollarSign, Lock } from "lucide-react";

const formSchema = z.object({
	tax_rate: z.coerce
		.number()
		.min(0, "Tax rate cannot be negative.")
		.max(1, "Tax rate must be less than 1 (e.g., 0.08 for 8%)."),
});

export function FinancialSettings() {
	const queryClient = useQueryClient();

	// Get location ID from terminal config
	const locationId = terminalRegistrationService.getLocationId();

	// Fetch global settings for read-only fields (currency, surcharge, discount stacking)
	const { data: globalSettings, isLoading: isLoadingGlobal } = useQuery({
		queryKey: ["globalSettings"],
		queryFn: getGlobalSettings,
	});

	// Fetch store location for editable tax_rate
	const { data: storeLocation, isLoading: isLoadingLocation } = useQuery({
		queryKey: ["storeLocation", locationId],
		queryFn: () => getStoreLocation(locationId),
		enabled: !!locationId,
	});

	const isLoading = isLoadingGlobal || isLoadingLocation;

	const mutation = useMutation({
		mutationFn: (data) => updateStoreLocation(locationId, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["storeLocation", locationId] });
			toast.success("Tax rate updated successfully!");
		},
		onError: (error) => {
			toast.error("Failed to update settings:", error.message);
		},
	});

	const form = useForm({
		resolver: zodResolver(formSchema),
		values: {
			tax_rate: storeLocation?.tax_rate || 0,
		},
		disabled: isLoading || mutation.isPending,
	});

	const onSubmit = (values) => {
		mutation.mutate(values);
	};

	if (isLoading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<DollarSign className="h-5 w-5" />
						Financial Settings
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-center py-8">
						<div className="text-center">
							<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
							<p className="mt-2 text-sm text-muted-foreground">
								Loading financial settings...
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
					<DollarSign className="h-5 w-5" />
					Financial Settings
				</CardTitle>
				<CardDescription>
					Configure tax rate for this location. Global financial rules are managed in the admin site.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="space-y-6"
					>
						{/* Location-specific: Editable Tax Rate */}
						<FormField
							control={form.control}
							name="tax_rate"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Location Tax Rate</FormLabel>
									<FormControl>
										<Input
											type="number"
											step="0.0001"
											placeholder="0.08"
											{...field}
										/>
									</FormControl>
									<FormDescription>
										The sales tax rate for this location as a decimal (e.g., 0.08 for 8%).
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* Global Settings: Read-Only */}
						<div className="bg-muted/30 rounded-lg p-4 space-y-4">
							<div className="flex items-center gap-2 mb-2">
								<Lock className="h-4 w-4 text-muted-foreground" />
								<h4 className="text-sm font-medium">Global Financial Rules (Read-Only)</h4>
							</div>
							<p className="text-xs text-muted-foreground mb-4">
								These settings are managed tenant-wide in the admin site.
							</p>

							{/* Read-only: Currency */}
							<div>
								<FormLabel className="text-sm text-muted-foreground">Currency Code</FormLabel>
								<div className="mt-1 px-3 py-2 bg-muted rounded-md text-sm">
									{globalSettings?.currency || "USD"}
								</div>
								<FormDescription className="mt-1">
									The 3-letter ISO 4217 currency code for all transactions.
								</FormDescription>
							</div>

							{/* Read-only: Surcharge */}
							<div>
								<FormLabel className="text-sm text-muted-foreground">Surcharge Percentage</FormLabel>
								<div className="mt-1 px-3 py-2 bg-muted rounded-md text-sm">
									{globalSettings?.surcharge_percentage
										? `${(globalSettings.surcharge_percentage * 100).toFixed(2)}%`
										: "0%"}
								</div>
								<FormDescription className="mt-1">
									Percentage-based surcharge applied to all orders.
								</FormDescription>
							</div>

							{/* Read-only: Discount Stacking */}
							<div>
								<FormLabel className="text-sm text-muted-foreground">Allow Discount Stacking</FormLabel>
								<div className="mt-1 px-3 py-2 bg-muted rounded-md text-sm">
									{globalSettings?.allow_discount_stacking ? "Enabled" : "Disabled"}
								</div>
								<FormDescription className="mt-1">
									Whether multiple discounts can be applied to a single order.
								</FormDescription>
							</div>
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
