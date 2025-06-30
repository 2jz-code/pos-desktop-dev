import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
	getGlobalSettings,
	updateGlobalSettings,
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
import { Textarea } from "@/shared/components/ui/textarea";
import { toast } from "sonner";

const formSchema = z.object({
	receipt_header: z.string().optional(),
	receipt_footer: z.string().optional(),
});

export function ReceiptSettings() {
	const queryClient = useQueryClient();

	const { data: settings, isLoading } = useQuery({
		queryKey: ["globalSettings"],
		queryFn: getGlobalSettings,
	});

	const mutation = useMutation({
		mutationFn: updateGlobalSettings,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["globalSettings"] });
			toast.success("Receipt settings updated successfully!");
		},
		onError: (error) => {
			toast.error("Failed to update settings:", error.message);
		},
	});

	const form = useForm({
		resolver: zodResolver(formSchema),
		values: {
			receipt_header: settings?.receipt_header || "",
			receipt_footer: settings?.receipt_footer || "",
		},
		disabled: isLoading || mutation.isPending,
	});

	const onSubmit = (values) => {
		mutation.mutate(values);
	};

	if (isLoading) {
		return <div>Loading receipt settings...</div>;
	}

	return (
		<Form {...form}>
			<form
				onSubmit={form.handleSubmit(onSubmit)}
				className="space-y-8"
			>
				<FormField
					control={form.control}
					name="receipt_header"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Receipt Header</FormLabel>
							<FormControl>
								<Textarea
									placeholder="Your company slogan or a welcome message."
									{...field}
								/>
							</FormControl>
							<FormDescription>
								This text will appear at the top of every receipt.
							</FormDescription>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="receipt_footer"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Receipt Footer</FormLabel>
							<FormControl>
								<Textarea
									placeholder="Thank you for your business! Find us at yourstore.com"
									{...field}
								/>
							</FormControl>
							<FormDescription>
								This text will appear at the bottom of every receipt.
							</FormDescription>
							<FormMessage />
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
