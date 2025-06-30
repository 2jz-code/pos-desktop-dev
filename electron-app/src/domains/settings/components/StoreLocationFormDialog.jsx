import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	createStoreLocation,
	updateStoreLocation,
} from "../services/settingsService";

import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/shared/components/ui/dialog";
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
import { toast } from "sonner";

const formSchema = z.object({
	name: z.string().min(2, "Location name must be at least 2 characters."),
	address: z.string().optional(),
	phone: z.string().optional(),
	email: z
		.string()
		.email("Please enter a valid email.")
		.optional()
		.or(z.literal("")),
});

const StoreLocationFormDialog = ({ isOpen, setIsOpen, locationData }) => {
	const queryClient = useQueryClient();
	const isEditing = !!locationData;

	const form = useForm({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: "",
			address: "",
			phone: "",
			email: "",
		},
	});

	useEffect(() => {
		if (locationData) {
			form.reset(locationData);
		} else {
			form.reset({ name: "", address: "", phone: "", email: "" });
		}
	}, [locationData, form]);

	const mutation = useMutation({
		mutationFn: isEditing
			? (data) => updateStoreLocation(locationData.id, data)
			: createStoreLocation,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["storeLocations"] });
			toast.success(
				`Location ${isEditing ? "updated" : "created"} successfully!`
			);
			setIsOpen(false);
		},
		onError: (error) => {
			toast.error(
				`Failed to ${isEditing ? "update" : "create"} location: ${
					error.message
				}`
			);
		},
	});

	const onSubmit = (values) => {
		mutation.mutate(values);
	};

	return (
		<Dialog
			open={isOpen}
			onOpenChange={setIsOpen}
		>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>
						{isEditing ? "Edit Location" : "Add New Location"}
					</DialogTitle>
					<DialogDescription>
						{isEditing
							? "Update the details for this location."
							: "Add a new store location to your system."}
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="space-y-4 py-4"
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Location Name</FormLabel>
									<FormControl>
										<Input
											placeholder="e.g., Downtown Branch"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="address"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Address</FormLabel>
									<FormControl>
										<Textarea
											placeholder="123 Main St, Anytown, USA"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="phone"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Phone Number</FormLabel>
									<FormControl>
										<Input
											placeholder="(123) 456-7890"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="email"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Email Address</FormLabel>
									<FormControl>
										<Input
											placeholder="contact@downtown.com"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<DialogFooter>
							<Button
								type="button"
								variant="ghost"
								onClick={() => setIsOpen(false)}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={mutation.isPending}
							>
								{mutation.isPending ? "Saving..." : "Save Location"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

export default StoreLocationFormDialog;
