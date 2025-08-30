import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import {
	createStockReason,
	updateStockReason,
	getStockReasonCategories,
} from "@/services/api/settingsService";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Tag, AlertTriangle } from "lucide-react";

const formSchema = z.object({
	name: z
		.string()
		.min(1, "Reason name is required")
		.max(100, "Reason name cannot exceed 100 characters"),
	description: z
		.string()
		.max(500, "Description cannot exceed 500 characters")
		.optional(),
	category: z
		.string()
		.min(1, "Category is required"),
	is_active: z.boolean().default(true),
});

interface StockReason {
	id?: number;
	name: string;
	description?: string;
	category: string;
	is_system_reason: boolean;
	is_active: boolean;
	usage_count?: number;
	can_be_deleted?: boolean;
}

interface StockReasonDialogProps {
	isOpen: boolean;
	onClose: () => void;
	reason?: StockReason | null;
	mode: "create" | "edit";
}

export function StockReasonDialog({
	isOpen,
	onClose,
	reason,
	mode,
}: StockReasonDialogProps) {
	const queryClient = useQueryClient();

	const { data: categories, isLoading: categoriesLoading } = useQuery({
		queryKey: ["stock-reason-categories"],
		queryFn: getStockReasonCategories,
	});

	const createMutation = useMutation({
		mutationFn: createStockReason,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["stock-reasons"] });
			toast.success("Stock reason created successfully");
			onClose();
		},
		onError: (error: any) => {
			const errorMessage = error?.response?.data?.message || "Failed to create stock reason";
			toast.error("Creation Failed", {
				description: errorMessage,
			});
		},
	});

	const updateMutation = useMutation({
		mutationFn: ({ id, data }: { id: number; data: any }) => updateStockReason(id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["stock-reasons"] });
			toast.success("Stock reason updated successfully");
			onClose();
		},
		onError: (error: any) => {
			const errorMessage = error?.response?.data?.message || "Failed to update stock reason";
			toast.error("Update Failed", {
				description: errorMessage,
			});
		},
	});

	const form = useForm({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: "",
			description: "",
			category: "",
			is_active: true,
		},
	});

	// Update form when reason data changes
	React.useEffect(() => {
		if (reason && mode === "edit") {
			form.reset({
				name: reason.name,
				description: reason.description || "",
				category: reason.category,
				is_active: reason.is_active,
			});
		} else if (mode === "create") {
			form.reset({
				name: "",
				description: "",
				category: "",
				is_active: true,
			});
		}
	}, [reason, mode, form]);

	const onSubmit = async (data: any) => {
		if (mode === "create") {
			createMutation.mutate(data);
		} else if (mode === "edit" && reason?.id) {
			updateMutation.mutate({ id: reason.id, data });
		}
	};

	const handleClose = () => {
		form.reset();
		onClose();
	};

	const isSystemReason = reason?.is_system_reason;
	const isSubmitting = createMutation.isPending || updateMutation.isPending;

	return (
		<Dialog open={isOpen} onOpenChange={handleClose}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Tag className="h-5 w-5" />
						{mode === "create" ? "Add Stock Reason" : "Edit Stock Reason"}
					</DialogTitle>
					<DialogDescription>
						{mode === "create"
							? "Create a new custom stock action reason for your team to use."
							: isSystemReason
							? "View system reason details. System reasons cannot be modified."
							: "Modify this custom stock reason."}
					</DialogDescription>
				</DialogHeader>

				{isSystemReason && (
					<div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
						<AlertTriangle className="h-4 w-4 text-amber-600" />
						<span className="text-sm text-amber-700">
							This is a system reason and cannot be modified or deleted.
						</span>
					</div>
				)}

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Reason Name *</FormLabel>
									<FormControl>
										<Input
											placeholder="e.g., Manual adjustment"
											disabled={isSystemReason}
											{...field}
										/>
									</FormControl>
									<FormDescription>
										A clear, concise name for this stock action reason.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="category"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Category *</FormLabel>
									<Select
										onValueChange={field.onChange}
										value={field.value}
										disabled={categoriesLoading || isSystemReason}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Select a category" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{categories?.map((category: any) => (
												<SelectItem key={category.value} value={category.value}>
													{category.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FormDescription>
										Choose the category that best fits this reason.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="description"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Description</FormLabel>
									<FormControl>
										<Textarea
											placeholder="Optional description for when this reason should be used..."
											className="min-h-[80px]"
											disabled={isSystemReason}
											{...field}
										/>
									</FormControl>
									<FormDescription>
										Optional description to help staff understand when to use this reason.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						{!isSystemReason && (
							<FormField
								control={form.control}
								name="is_active"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
										<div className="space-y-0.5">
											<FormLabel className="text-base">Active</FormLabel>
											<FormDescription>
												Whether this reason is available for selection in stock operations.
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
						)}
					</form>
				</Form>

				{!isSystemReason && (
					<DialogFooter>
						<Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
							Cancel
						</Button>
						<Button
							type="submit"
							onClick={form.handleSubmit(onSubmit)}
							disabled={isSubmitting || !form.formState.isValid}
						>
							{isSubmitting
								? mode === "create"
									? "Creating..."
									: "Updating..."
								: mode === "create"
								? "Create Reason"
								: "Update Reason"}
						</Button>
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
}