import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import terminalRegistrationService from "@/services/TerminalRegistrationService";
import {
	getStoreLocation,
	updateStoreLocation,
} from "../services/settingsService";

import { OnlineOnlyButton } from "@/shared/components/ui/OnlineOnlyButton";
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
import { Textarea } from "@/shared/components/ui/textarea";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { toast } from "sonner";
import { Store, Phone, Mail, MapPin } from "lucide-react";
import { formatPhoneNumber, isValidPhoneNumber } from "@ajeen/ui";

const formSchema = z.object({
	name: z.string().min(1, "Location name is required"),
	address_line1: z.string().optional(),
	city: z.string().optional(),
	state: z.string().optional(),
	postal_code: z.string().optional(),
	phone: z
		.string()
		.optional()
		.refine((phone) => {
			return !phone || isValidPhoneNumber(phone);
		}, "Please enter a valid phone number"),
	email: z.string().email("Invalid email address").or(z.literal("")),
});

export function StoreInfoSettings() {
	const queryClient = useQueryClient();

	// Get location ID from terminal config
	const locationId = terminalRegistrationService.getLocationId();

	const { data: storeLocation, isLoading } = useQuery({
		queryKey: ["storeLocation", locationId],
		queryFn: () => getStoreLocation(locationId),
		enabled: !!locationId,
	});

	const mutation = useMutation({
		mutationFn: (data) => updateStoreLocation(locationId, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["storeLocation", locationId] });
			toast.success("Location information updated successfully!");
		},
		onError: (error) => {
			toast.error("Failed to update location information", {
				description: error.message,
			});
		},
	});

	const form = useForm({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: "",
			address_line1: "",
			city: "",
			state: "",
			postal_code: "",
			phone: "",
			email: "",
		},
	});

	// Update form when data is loaded
	React.useEffect(() => {
		if (storeLocation) {
			form.reset({
				name: storeLocation.name || "",
				address_line1: storeLocation.address_line1 || "",
				city: storeLocation.city || "",
				state: storeLocation.state || "",
				postal_code: storeLocation.postal_code || "",
				phone: storeLocation.phone || "",
				email: storeLocation.email || "",
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [storeLocation]); // 'form' is a stable reference from useForm(), no need to include it

	const onSubmit = (values) => {
		mutation.mutate(values);
	};

	if (isLoading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Store className="h-5 w-5" />
						Store Information
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-center py-8">
						<div className="text-center">
							<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
							<p className="mt-2 text-sm text-muted-foreground">
								Loading store information...
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
					<Store className="h-5 w-5" />
					Location Information
				</CardTitle>
				<CardDescription>
					Configure information for this store location that appears on receipts and communications.
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
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="flex items-center gap-2">
										<Store className="h-4 w-4" />
										Location Name
									</FormLabel>
									<FormControl>
										<Input
											placeholder="Downtown Branch"
											{...field}
										/>
									</FormControl>
									<FormDescription>
										The name of this location (e.g., "Downtown", "Airport").
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="address_line1"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="flex items-center gap-2">
										<MapPin className="h-4 w-4" />
										Street Address
									</FormLabel>
									<FormControl>
										<Input
											placeholder="123 Main Street"
											{...field}
										/>
									</FormControl>
									<FormDescription>
										Primary street address for this location.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							<FormField
								control={form.control}
								name="city"
								render={({ field }) => (
									<FormItem>
										<FormLabel>City</FormLabel>
										<FormControl>
											<Input
												placeholder="New York"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="state"
								render={({ field }) => (
									<FormItem>
										<FormLabel>State/Province</FormLabel>
										<FormControl>
											<Input
												placeholder="NY"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<FormField
							control={form.control}
							name="postal_code"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Postal Code</FormLabel>
									<FormControl>
										<Input
											placeholder="10001"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							<FormField
								control={form.control}
								name="phone"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="flex items-center gap-2">
											<Phone className="h-4 w-4" />
											Phone Number
										</FormLabel>
										<FormControl>
											<Input
												placeholder="(555) 123-4567"
												{...field}
												onChange={(e) => {
													const formatted = formatPhoneNumber(e.target.value);
													field.onChange(formatted);
												}}
											/>
										</FormControl>
										<FormDescription>
											Location phone number for customer contact.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="email"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="flex items-center gap-2">
											<Mail className="h-4 w-4" />
											Email Address
										</FormLabel>
										<FormControl>
											<Input
												type="email"
												placeholder="downtown@yourbusiness.com"
												{...field}
											/>
										</FormControl>
										<FormDescription>
											Location email address for customer contact.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<div className="bg-muted/50 rounded-lg p-4">
							<h4 className="text-sm font-medium mb-2">
								Where This Information Appears:
							</h4>
							<ul className="text-sm text-muted-foreground space-y-1">
								<li>• Receipt headers and footers</li>
								<li>• Customer order confirmations</li>
								<li>• Business contact information</li>
								<li>• System-generated documents</li>
							</ul>
						</div>

						<OnlineOnlyButton
							type="submit"
							disabled={mutation.isPending || !form.formState.isDirty}
							disabledMessage="Saving location information requires internet connection"
						>
							{mutation.isPending ? "Saving..." : "Save Changes"}
						</OnlineOnlyButton>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
}