import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
	getStockReasons,
	deleteStockReason,
	getStockReasonCategories,
} from "@/services/api/settingsService";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
	Tag,
	Plus,
	Search,
	MoreVertical,
	Edit,
	Trash2,
	Shield,
	BarChart3,
	Filter,
	Eye,
	Power,
	PowerOff,
} from "lucide-react";
import { StockReasonDialog } from "./StockReasonDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface StockReason {
	id: number;
	name: string;
	description?: string;
	category: string;
	category_display: string;
	is_system_reason: boolean;
	is_active: boolean;
	usage_count: number;
	can_be_deleted: boolean;
	created_at: string;
}

const getCategoryColor = (category: string) => {
	const colors = {
		SYSTEM: "bg-muted text-muted-foreground",
		MANUAL: "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300",
		INVENTORY: "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300",
		WASTE: "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300",
		RESTOCK: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300",
		TRANSFER: "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300",
		CORRECTION: "bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300",
		BULK: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300",
		OTHER: "bg-muted text-muted-foreground",
	};
	return colors[category as keyof typeof colors] || colors.OTHER;
};

export function StockReasonSettings() {
	const [searchTerm, setSearchTerm] = useState("");
	const [selectedCategory, setSelectedCategory] = useState<string>("all");
	const [dialogOpen, setDialogOpen] = useState(false);
	const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
	const [selectedReason, setSelectedReason] = useState<StockReason | null>(null);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [reasonToDelete, setReasonToDelete] = useState<StockReason | null>(null);

	const queryClient = useQueryClient();

	const { data: reasons, isLoading: reasonsLoading } = useQuery({
		queryKey: ["stock-reasons"],
		queryFn: getStockReasons,
	});

	const { data: categories } = useQuery({
		queryKey: ["stock-reason-categories"],
		queryFn: getStockReasonCategories,
	});

	const deleteMutation = useMutation({
		mutationFn: deleteStockReason,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["stock-reasons"] });
			toast.success("Stock reason deleted successfully");
			setDeleteDialogOpen(false);
			setReasonToDelete(null);
		},
		onError: (error: any) => {
			const errorMessage = error?.response?.data?.message || "Failed to delete stock reason";
			toast.error("Deletion Failed", {
				description: errorMessage,
			});
		},
	});

	// Filter reasons based on search and category
	const filteredReasons = useMemo(() => {
		if (!reasons) return [];

		return reasons.filter((reason: StockReason) => {
			const matchesSearch =
				searchTerm === "" ||
				reason.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
				reason.description?.toLowerCase().includes(searchTerm.toLowerCase());

			const matchesCategory =
				selectedCategory === "all" || reason.category === selectedCategory;

			return matchesSearch && matchesCategory;
		});
	}, [reasons, searchTerm, selectedCategory]);

	// Group reasons by category for better organization
	const groupedReasons = useMemo(() => {
		const groups: { [key: string]: StockReason[] } = {};
		
		filteredReasons.forEach((reason: StockReason) => {
			if (!groups[reason.category]) {
				groups[reason.category] = [];
			}
			groups[reason.category].push(reason);
		});

		// Sort each group: system reasons first, then by usage, then by name
		Object.keys(groups).forEach(category => {
			groups[category].sort((a, b) => {
				if (a.is_system_reason && !b.is_system_reason) return -1;
				if (!a.is_system_reason && b.is_system_reason) return 1;
				if (b.usage_count !== a.usage_count) return b.usage_count - a.usage_count;
				return a.name.localeCompare(b.name);
			});
		});

		return groups;
	}, [filteredReasons]);

	const handleCreate = () => {
		setDialogMode("create");
		setSelectedReason(null);
		setDialogOpen(true);
	};

	const handleEdit = (reason: StockReason) => {
		setDialogMode("edit");
		setSelectedReason(reason);
		setDialogOpen(true);
	};

	const handleView = (reason: StockReason) => {
		setDialogMode("edit");
		setSelectedReason(reason);
		setDialogOpen(true);
	};

	const handleDelete = (reason: StockReason) => {
		setReasonToDelete(reason);
		setDeleteDialogOpen(true);
	};

	const confirmDelete = () => {
		if (reasonToDelete?.id) {
			deleteMutation.mutate(reasonToDelete.id);
		}
	};

	if (reasonsLoading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Tag className="h-5 w-5" />
						Stock Reasons
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-center py-8">
						<div className="text-center">
							<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
							<p className="mt-2 text-sm text-muted-foreground">Loading stock reasons...</p>
						</div>
					</div>
				</CardContent>
			</Card>
		);
	}

	const systemReasonsCount = reasons?.filter((r: StockReason) => r.is_system_reason).length || 0;
	const customReasonsCount = reasons?.filter((r: StockReason) => !r.is_system_reason).length || 0;
	const activeReasonsCount = reasons?.filter((r: StockReason) => r.is_active).length || 0;

	return (
		<>
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle className="flex items-center gap-2">
								<Tag className="h-5 w-5" />
								Stock Reasons
							</CardTitle>
							<CardDescription>
								Manage stock action reasons for your team. Only owners can add, edit, or delete custom reasons.
							</CardDescription>
						</div>
						<Button onClick={handleCreate}>
							<Plus className="h-4 w-4 mr-2" />
							Add Reason
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					{/* Stats */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
						<div className="text-center p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
							<div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{systemReasonsCount}</div>
							<div className="text-sm text-blue-700 dark:text-blue-300">System Reasons</div>
						</div>
						<div className="text-center p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
							<div className="text-2xl font-bold text-green-600 dark:text-green-400">{customReasonsCount}</div>
							<div className="text-sm text-green-700 dark:text-green-300">Custom Reasons</div>
						</div>
						<div className="text-center p-3 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
							<div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{activeReasonsCount}</div>
							<div className="text-sm text-purple-700 dark:text-purple-300">Active Reasons</div>
						</div>
					</div>

					{/* Filters */}
					<div className="flex flex-col sm:flex-row gap-4 mb-4">
						<div className="relative flex-1">
							<Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
							<Input
								placeholder="Search reasons..."
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
								className="pl-9"
							/>
						</div>
						<Select value={selectedCategory} onValueChange={setSelectedCategory}>
							<SelectTrigger className="w-full sm:w-[200px]">
								<Filter className="h-4 w-4 mr-2" />
								<SelectValue placeholder="Filter by category" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Categories</SelectItem>
								{categories?.map((category: any) => (
									<SelectItem key={category.value} value={category.value}>
										{category.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Reasons Table */}
					<div className="space-y-6">
						{Object.entries(groupedReasons).map(([category, categoryReasons]) => (
							<div key={category}>
								<div className="flex items-center gap-2 mb-3">
									<Badge className={getCategoryColor(category)}>
										{categories?.find((cat: any) => cat.value === category)?.label || category}
									</Badge>
									<span className="text-sm text-muted-foreground">
										{categoryReasons.length} reason{categoryReasons.length !== 1 ? "s" : ""}
									</span>
								</div>

								<div className="border rounded-md">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Name</TableHead>
												<TableHead className="hidden sm:table-cell">Description</TableHead>
												<TableHead className="text-center">Usage</TableHead>
												<TableHead className="text-center">Status</TableHead>
												<TableHead className="w-[70px]">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{categoryReasons.map((reason: StockReason) => (
												<TableRow key={reason.id}>
													<TableCell>
														<div className="flex items-center gap-2">
															{reason.is_system_reason && (
																<Shield className="h-4 w-4 text-blue-500" />
															)}
															<span className="font-medium">{reason.name}</span>
														</div>
													</TableCell>
													<TableCell className="hidden sm:table-cell">
														<div className="max-w-xs">
															<span className="text-sm text-muted-foreground truncate">
																{reason.description || "No description"}
															</span>
														</div>
													</TableCell>
													<TableCell className="text-center">
														<div className="flex items-center justify-center gap-1">
															<BarChart3 className="h-3 w-3 text-muted-foreground" />
															<span className="text-sm">{reason.usage_count}</span>
														</div>
													</TableCell>
													<TableCell className="text-center">
														{reason.is_active ? (
															<Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300">
																<Power className="h-3 w-3 mr-1" />
																Active
															</Badge>
														) : (
															<Badge variant="secondary">
																<PowerOff className="h-3 w-3 mr-1" />
																Inactive
															</Badge>
														)}
													</TableCell>
													<TableCell>
														<DropdownMenu>
															<DropdownMenuTrigger asChild>
																<Button variant="ghost" size="sm">
																	<MoreVertical className="h-4 w-4" />
																</Button>
															</DropdownMenuTrigger>
															<DropdownMenuContent align="end">
																<DropdownMenuLabel>Actions</DropdownMenuLabel>
																<DropdownMenuSeparator />
																<DropdownMenuItem onClick={() => handleView(reason)}>
																	<Eye className="h-4 w-4 mr-2" />
																	View Details
																</DropdownMenuItem>
																{!reason.is_system_reason && (
																	<>
																		<DropdownMenuItem onClick={() => handleEdit(reason)}>
																			<Edit className="h-4 w-4 mr-2" />
																			Edit
																		</DropdownMenuItem>
																		{reason.can_be_deleted && (
																			<DropdownMenuItem
																				className="text-red-600"
																				onClick={() => handleDelete(reason)}
																			>
																				<Trash2 className="h-4 w-4 mr-2" />
																				Delete
																			</DropdownMenuItem>
																		)}
																	</>
																)}
															</DropdownMenuContent>
														</DropdownMenu>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
							</div>
						))}

						{filteredReasons.length === 0 && (
							<div className="text-center py-8">
								<Tag className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
								<p className="text-muted-foreground">
									{searchTerm || selectedCategory !== "all"
										? "No reasons match your search criteria."
										: "No stock reasons found."}
								</p>
							</div>
						)}
					</div>

					{/* Usage tip */}
					<div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
						<div className="flex items-start gap-3">
							<Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
							<div className="text-sm text-blue-700 dark:text-blue-300">
								<p className="font-medium mb-1">System vs Custom Reasons:</p>
								<ul className="space-y-1 text-xs">
									<li>• <strong>System reasons</strong> are built-in and cannot be modified or deleted</li>
									<li>• <strong>Custom reasons</strong> can be created, edited, and deleted by owners</li>
									<li>• Usage counts help you understand which reasons are most commonly used</li>
									<li>• Inactive reasons are hidden from staff but preserved for historical data</li>
								</ul>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Create/Edit Dialog */}
			<StockReasonDialog
				isOpen={dialogOpen}
				onClose={() => setDialogOpen(false)}
				reason={selectedReason}
				mode={dialogMode}
			/>

			{/* Delete Confirmation Dialog */}
			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Stock Reason</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete "{reasonToDelete?.name}"? This action cannot be undone.
							{reasonToDelete?.usage_count > 0 && (
								<>
									<br />
									<br />
									<strong>Warning:</strong> This reason has been used {reasonToDelete.usage_count} time
									{reasonToDelete.usage_count !== 1 ? "s" : ""} in stock history. Historical records will still reference this reason.
								</>
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={confirmDelete}
							className="bg-red-600 hover:bg-red-700"
							disabled={deleteMutation.isPending}
						>
							{deleteMutation.isPending ? "Deleting..." : "Delete"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}