import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
	getStoreInfo,
	updateStoreInfo,
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
import { Textarea } from "@/components/ui/textarea";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Store, Phone, Mail, MapPin } from "lucide-react";
import { formatPhoneNumber, isValidPhoneNumber } from "@ajeen/ui";

const formSchema = z.object({
	store_name: z.string().min(1, "Store name is required"),
	store_address: z.string().optional(),
	store_phone: z
		.string()
		.optional()
		.refine((phone) => {
			return !phone || isValidPhoneNumber(phone);
		}, "Please enter a valid phone number"),
	store_email: z.string().email("Invalid email address").or(z.literal("")),
});

export function StoreInfoSettings() {
	const queryClient = useQueryClient();

	const { data: storeInfo, isLoading } = useQuery({
		queryKey: ["storeInfo"],
		queryFn: getStoreInfo,
	});

	const mutation = useMutation({
		mutationFn: updateStoreInfo,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["storeInfo"] });
			queryClient.invalidateQueries({ queryKey: ["globalSettings"] });
			toast.success("Store information updated successfully!");
		},
		onError: (error) => {
			toast.error("Failed to update store information", {
				description: error.message,
			});
		},
	});

	const form = useForm({
		resolver: zodResolver(formSchema),
		defaultValues: {
			store_name: "",
			store_address: "",
			store_phone: "",
			store_email: "",
		},
	});

	// Update form when data is loaded
	React.useEffect(() => {
		if (storeInfo) {
			form.reset({
				store_name: storeInfo.store_name || "",
				store_address: storeInfo.store_address || "",
				store_phone: storeInfo.store_phone || "",
				store_email: storeInfo.store_email || "",
			});
		}
	}, [storeInfo, form]);

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
					Store Information
				</CardTitle>
				<CardDescription>
					Configure your business information that appears on receipts and communications.
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
							name="store_name"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="flex items-center gap-2">
										<Store className="h-4 w-4" />
										Store Name
									</FormLabel>
									<FormControl>
										<Input
											placeholder="Your Business Name"
											{...field}
										/>
									</FormControl>
									<FormDescription>
										The name of your business as it appears on receipts and documents.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="store_address"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="flex items-center gap-2">
										<MapPin className="h-4 w-4" />
										Store Address
									</FormLabel>
									<FormControl>
										<Textarea
											placeholder="123 Main Street&#10;City, State 12345"
											rows={3}
											{...field}
										/>
									</FormControl>
									<FormDescription>
										Full business address that appears on receipts.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							<FormField
								control={form.control}
								name="store_phone"
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
											Business phone number for customer contact.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="store_email"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="flex items-center gap-2">
											<Mail className="h-4 w-4" />
											Email Address
										</FormLabel>
										<FormControl>
											<Input
												type="email"
												placeholder="contact@yourbusiness.com"
												{...field}
											/>
										</FormControl>
										<FormDescription>
											Business email address for customer contact.
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