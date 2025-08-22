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
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { toast } from "sonner";
import { Receipt } from "lucide-react";

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
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Receipt className="h-5 w-5" />
						Receipt Settings
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-center py-8">
						<div className="text-center">
							<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
							<p className="mt-2 text-sm text-muted-foreground">
								Loading receipt settings...
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
					<Receipt className="h-5 w-5" />
					Receipt Settings
				</CardTitle>
				<CardDescription>
					Customize the header and footer text that appears on customer receipts
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
