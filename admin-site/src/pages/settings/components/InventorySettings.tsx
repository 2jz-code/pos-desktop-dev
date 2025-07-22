import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
	getGlobalSettings,
	updateGlobalSettings,
} from "@/services/api/settingsService";
import inventoryService from "@/services/api/inventoryService";

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
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Package, AlertTriangle, Clock, MapPin } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

const formSchema = z.object({
	default_low_stock_threshold: z.coerce
		.number()
		.min(0, "Low stock threshold cannot be negative.")
		.max(1000000, "Low stock threshold is too large."),
	default_expiration_threshold: z.coerce
		.number()
		.int()
		.min(1, "Expiration threshold must be at least 1 day.")
		.max(365, "Expiration threshold cannot exceed 365 days."),
	default_inventory_location: z.string().optional(),
});

export function InventorySettings() {
	const queryClient = useQueryClient();

	const { data: settings, isLoading } = useQuery({
		queryKey: ["globalSettings"],
		queryFn: getGlobalSettings,
	});

	const { data: locations } = useQuery({
		queryKey: ["locations"],
		queryFn: inventoryService.getLocations,
	});

	const mutation = useMutation({
		mutationFn: updateGlobalSettings,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["globalSettings"] });
			// Invalidate all inventory-related queries to ensure threshold changes are reflected
			queryClient.invalidateQueries({ predicate: (query) => 
				query.queryKey[0] && query.queryKey[0].startsWith("inventory")
			});
			toast.success("Inventory defaults updated successfully");
		},
		onError: (error: any) => {
			const errorMessage = error?.response?.data?.message || "Failed to update inventory defaults";
			toast.error("Update Failed", {
				description: errorMessage,
			});
		},
	});

	const form = useForm({
		resolver: zodResolver(formSchema),
		defaultValues: {
			default_low_stock_threshold: 10.0,
			default_expiration_threshold: 7,
			default_inventory_location: "none",
		},
	});

	// Update form when settings data is loaded
	React.useEffect(() => {
		if (settings && locations && locations.length > 0) {
			const locationValue = settings.default_inventory_location 
				? settings.default_inventory_location.toString() 
				: "none";
			
			form.reset({
				default_low_stock_threshold: parseFloat(settings.default_low_stock_threshold || 10.0),
				default_expiration_threshold: parseInt(settings.default_expiration_threshold || 7),
				default_inventory_location: locationValue,
			});
		}
	}, [settings, locations]);

	// Additional effect to ensure form is set even if data loads in different order
	React.useEffect(() => {
		if (settings?.default_inventory_location && locations?.length > 0) {
			const currentValue = form.getValues("default_inventory_location");
			const expectedValue = settings.default_inventory_location.toString();
			
			// Only update if the current value doesn't match what it should be
			if (currentValue !== expectedValue) {
				form.setValue("default_inventory_location", expectedValue);
			}
		}
	}, [settings?.default_inventory_location, locations, form]);

	const onSubmit = (data: any) => {
		// Convert "none" to null for the API
		const submitData = {
			...data,
			default_inventory_location: data.default_inventory_location === "none" ? null : data.default_inventory_location
		};
		mutation.mutate(submitData);
	};

	if (isLoading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Package className="h-5 w-5" />
						Inventory Defaults
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-center py-8">
						<div className="text-center">
							<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
							<p className="mt-2 text-sm text-muted-foreground">Loading settings...</p>
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
					<Package className="h-5 w-5" />
					Inventory Defaults
				</CardTitle>
				<CardDescription>
					Set global default thresholds for inventory warnings. These can be overridden for individual products.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
						<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
							<FormField
								control={form.control}
								name="default_low_stock_threshold"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="flex items-center gap-2">
											<AlertTriangle className="h-4 w-4 text-amber-500" />
											Low Stock Threshold
										</FormLabel>
										<FormControl>
											<Input
												type="number"
												step="0.01"
												min="0"
												placeholder="10.00"
												{...field}
											/>
										</FormControl>
										<FormDescription>
											Products will show as "low stock" when quantity falls to or below this value.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="default_expiration_threshold"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="flex items-center gap-2">
											<Clock className="h-4 w-4 text-orange-500" />
											Expiration Warning (Days)
										</FormLabel>
										<FormControl>
											<Input
												type="number"
												min="1"
												max="365"
												placeholder="7"
												{...field}
											/>
										</FormControl>
										<FormDescription>
											Products will show as "expiring soon" this many days before their expiration date.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="default_inventory_location"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="flex items-center gap-2">
											<MapPin className="h-4 w-4 text-blue-500" />
											Default Stock Location
										</FormLabel>
										<Select onValueChange={field.onChange} value={field.value}>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder="Select location" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												<SelectItem value="none">None (Manual Selection)</SelectItem>
												{locations?.map((location) => (
													<SelectItem key={location.id} value={location.id.toString()}>
														{location.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormDescription>
											Default location for stock operations and sales deductions.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<div className="bg-muted/50 rounded-lg p-4">
							<h4 className="text-sm font-medium mb-2">3-Tier Threshold System:</h4>
							<ul className="text-sm text-muted-foreground space-y-1">
								<li>• <strong>Global defaults</strong> (set here) - used as fallback for all locations</li>
								<li>• <strong>Location-specific defaults</strong> - override global defaults per location</li>
								<li>• <strong>Individual stock overrides</strong> - override location/global defaults per product</li>
								<li>• Priority: Individual → Location → Global</li>
							</ul>
						</div>

						<Button
							type="submit"
							disabled={mutation.isPending}
							className="w-full sm:w-auto"
						>
							{mutation.isPending ? "Saving..." : "Save Changes"}
						</Button>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
}