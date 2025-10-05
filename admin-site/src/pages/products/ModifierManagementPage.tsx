import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/components/ui/tabs";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Plus,
	Search,
	Filter,
	Settings,
	Copy,
	Trash2,
	Edit3,
	Eye,
	BarChart3,
	Library,
	Zap,
	Users,
	ShoppingBag,
	ArrowLeft,
	AlertTriangle,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { DomainPageLayout } from "@/components/shared/DomainPageLayout";
import * as modifierService from "@/services/api/modifierService";
import ModifierQuickCreate from "@/components/modifiers/ModifierQuickCreate";
import UsageAnalytics from "@/components/modifiers/UsageAnalytics";
import ModifierSetEditor from "@/components/modifiers/ModifierSetEditor";
import { useAuth } from "@/contexts/AuthContext";

interface ModifierOption {
	id: number;
	name: string;
	price_delta: number;
}

interface ModifierSet {
	id: number;
	name: string;
	internal_name: string;
	selection_type: "SINGLE" | "MULTIPLE";
	min_selections: number;
	triggered_by_option?: number;
	options?: ModifierOption[];
	product_count?: number;
}

const ModifierManagementPage: React.FC = () => {
	const navigate = useNavigate();
	const { tenant } = useAuth();
	const tenantSlug = tenant?.slug || '';
	const [activeTab, setActiveTab] = useState("library");
	const [modifierSets, setModifierSets] = useState<ModifierSet[]>([]);
	const [loading, setLoading] = useState(false);
	const [searchTerm, setSearchTerm] = useState("");
	const [selectedType, setSelectedType] = useState("all");
	const [selectedModifierSet, setSelectedModifierSet] = useState<ModifierSet | null>(null);
	const [isEditorOpen, setIsEditorOpen] = useState(false);
	const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
	const { toast } = useToast();
	const confirmation = useConfirmation();

	useEffect(() => {
		fetchModifierSets();
	}, []);

	const fetchModifierSets = async () => {
		try {
			setLoading(true);
			const params: Record<string, string> = {};
			if (searchTerm) params.search = searchTerm;
			if (selectedType !== "all") params.selection_type = selectedType;

			const response = await modifierService.getModifierSets(params);
			const data = response.data?.results || response.data || [];
			setModifierSets(Array.isArray(data) ? data : []);
		} catch (error) {
			console.error("Error fetching modifier sets:", error);
			toast({
				title: "Error",
				description: "Failed to load modifier sets.",
				variant: "destructive",
			});
		} finally {
			setLoading(false);
		}
	};

	const handleSearch = () => {
		fetchModifierSets();
	};

	const handleCreateNew = () => {
		setIsQuickCreateOpen(true);
	};

	const handleAdvancedCreate = () => {
		setSelectedModifierSet(null);
		setIsEditorOpen(true);
	};

	const handleEditModifierSet = (modifierSet: ModifierSet) => {
		setSelectedModifierSet(modifierSet);
		setIsEditorOpen(true);
	};

	const handleDeleteModifierSet = async (modifierSet: ModifierSet) => {
		confirmation.show({
			title: "Delete Modifier Set",
			description: `Are you sure you want to delete "${modifierSet.name}"? This action cannot be undone.`,
			confirmText: "Delete",
			cancelText: "Cancel",
			variant: "destructive",
			icon: AlertTriangle,
			onConfirm: async () => {
				try {
					await modifierService.deleteModifierSet(modifierSet.id);
					await fetchModifierSets();
					toast({
						title: "Success",
						description: "Modifier set deleted successfully.",
					});
				} catch (error) {
					console.error("Error deleting modifier set:", error);
					toast({
						title: "Error",
						description: "Failed to delete modifier set.",
						variant: "destructive",
					});
				}
			},
		});
	};

	const handleDuplicateModifierSet = async (modifierSet: ModifierSet) => {
		try {
			const duplicateData = {
				...modifierSet,
				name: `${modifierSet.name} (Copy)`,
				internal_name: `${modifierSet.internal_name}-copy-${Date.now()}`,
			};
			// @ts-ignore
			delete duplicateData.id;

			await modifierService.createModifierSet(duplicateData);
			await fetchModifierSets();
			toast({
				title: "Success",
				description: "Modifier set duplicated successfully.",
			});
		} catch (error) {
			console.error("Error duplicating modifier set:", error);
			toast({
				title: "Error",
				description: "Failed to duplicate modifier set.",
				variant: "destructive",
			});
		}
	};

	const filteredModifierSets = (Array.isArray(modifierSets) ? modifierSets : []).filter((set) => {
		if (
			searchTerm &&
			!set.name.toLowerCase().includes(searchTerm.toLowerCase())
		) {
			return false;
		}
		if (selectedType !== "all" && set.selection_type !== selectedType) {
			return false;
		}
		return true;
	});

	const getTypeColor = (type: string, hasMin: boolean) => {
		if (hasMin) return "bg-blue-100 border-blue-300 text-blue-800";
		if (type === "MULTIPLE")
			return "bg-green-100 border-green-300 text-green-800";
		return "bg-gray-100 border-gray-300 text-gray-800";
	};

	const getTypeIcon = (type: string) => {
		return type === "MULTIPLE" ? "☑" : "○";
	};

	return (
		<DomainPageLayout
			pageTitle="Modifier Management"
			pageDescription="Manage your modifier sets and options across all products"
			pageIcon={Settings}
			pageActions={
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						onClick={() => navigate(`/${tenantSlug}/products`)}
						className="flex items-center gap-2"
					>
						<ArrowLeft className="h-4 w-4" />
						Back to Products
					</Button>
					<Button
						onClick={handleCreateNew}
						className="flex items-center gap-2"
					>
						<Plus className="h-4 w-4" />
						Create Modifier Set
					</Button>
					<Button
						onClick={handleAdvancedCreate}
						variant="outline"
						className="flex items-center gap-2"
					>
						<Settings className="h-4 w-4" />
						Advanced Editor
					</Button>
				</div>
			}
			showSearch={false}
		>

			<Tabs
				value={activeTab}
				onValueChange={setActiveTab}
				className="space-y-6"
			>
				<TabsList className="grid w-full grid-cols-3">
					<TabsTrigger
						value="library"
						className="flex items-center gap-2"
					>
						<Library className="h-4 w-4" />
						Modifier Library
					</TabsTrigger>
					<TabsTrigger
						value="analytics"
						className="flex items-center gap-2"
					>
						<BarChart3 className="h-4 w-4" />
						Usage Analytics
					</TabsTrigger>
					<TabsTrigger
						value="templates"
						className="flex items-center gap-2"
					>
						<Zap className="h-4 w-4" />
						Templates
					</TabsTrigger>
				</TabsList>

				<TabsContent
					value="library"
					className="space-y-6"
				>
					{/* Search and Filter Controls */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Search className="h-5 w-5" />
								Search & Filter
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="flex gap-4">
								<div className="flex-1">
									<Label htmlFor="search">Search modifier sets</Label>
									<div className="flex gap-2">
										<Input
											id="search"
											placeholder="Search by name..."
											value={searchTerm}
											onChange={(e) => setSearchTerm(e.target.value)}
											onKeyPress={(e) => e.key === "Enter" && handleSearch()}
										/>
										<Button
											onClick={handleSearch}
											variant="outline"
										>
											<Search className="h-4 w-4" />
										</Button>
									</div>
								</div>
								<div className="w-48">
									<Label>Filter by type</Label>
									<Select
										value={selectedType}
										onValueChange={setSelectedType}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Types</SelectItem>
											<SelectItem value="SINGLE">Single Choice</SelectItem>
											<SelectItem value="MULTIPLE">Multiple Choice</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Modifier Sets Grid */}
					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
							{loading ? (
								<div className="col-span-full text-center py-8">
									<div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
									<p className="text-sm text-gray-500">
										Loading modifier sets...
									</p>
								</div>
							) : filteredModifierSets.length === 0 ? (
								<div className="col-span-full text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
									<div className="mx-auto w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mb-4">
										<Library className="h-6 w-6 text-gray-400" />
									</div>
									<h4 className="text-lg font-medium text-gray-900 mb-2">
										No modifier sets found
									</h4>
									<p className="text-gray-500 mb-6 max-w-sm mx-auto">
										{searchTerm || selectedType !== "all"
											? "Try adjusting your search criteria"
											: "Create your first modifier set to get started"}
									</p>
									<Button onClick={handleCreateNew}>
										<Plus className="mr-2 h-4 w-4" />
										Create First Modifier Set
									</Button>
								</div>
							) : (
								filteredModifierSets.map((modifierSet) => (
									<Card
										key={modifierSet.id}
										className="hover:shadow-lg transition-all duration-200 border-border bg-card cursor-pointer"
										onClick={() => handleEditModifierSet(modifierSet)}
									>
										<CardHeader className="pb-3">
											<div className="flex items-start justify-between gap-3">
												<div className="flex-1 min-w-0">
													<div className="flex items-center gap-2 mb-1">
														<div className="h-2 w-2 rounded-full bg-emerald-500 flex-shrink-0" />
														<CardTitle className="text-base font-bold text-foreground truncate">
															{modifierSet.name}
														</CardTitle>
													</div>
													<CardDescription className="text-xs text-muted-foreground font-mono truncate">
														{modifierSet.internal_name}
													</CardDescription>
												</div>
												<div className="flex gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
													<Button
														variant="ghost"
														size="sm"
														onClick={() => handleEditModifierSet(modifierSet)}
														className="h-8 w-8 p-0"
													>
														<Edit3 className="h-3.5 w-3.5" />
													</Button>
													<Button
														variant="ghost"
														size="sm"
														onClick={() =>
															handleDuplicateModifierSet(modifierSet)
														}
														className="h-8 w-8 p-0"
													>
														<Copy className="h-3.5 w-3.5" />
													</Button>
													<Button
														variant="ghost"
														size="sm"
														onClick={() =>
															handleDeleteModifierSet(modifierSet)
														}
														className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
													>
														<Trash2 className="h-3.5 w-3.5" />
													</Button>
												</div>
											</div>
										</CardHeader>
										<CardContent className="pt-0 space-y-3">
											{/* Type and Conditional Badges */}
											<div className="flex items-center gap-2 flex-wrap">
												<Badge
													variant="outline"
													className={getTypeColor(
														modifierSet.selection_type,
														modifierSet.min_selections > 0
													)}
												>
													<span className="mr-1.5">{getTypeIcon(modifierSet.selection_type)}</span>
													{modifierSet.selection_type === "MULTIPLE"
														? "Multi"
														: "Single"}
													{modifierSet.min_selections > 0 && " • Required"}
												</Badge>
												{modifierSet.triggered_by_option && (
													<Badge
														variant="outline"
														className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-400"
													>
														<Zap className="mr-1 h-3 w-3" />
														Conditional
													</Badge>
												)}
											</div>

											{/* Stats Row */}
											<div className="flex items-center gap-4 text-sm text-muted-foreground">
												<div className="flex items-center gap-1.5">
													<Settings className="h-3.5 w-3.5" />
													<span className="font-medium text-foreground">
														{modifierSet.options?.length || 0}
													</span>
													<span>option{(modifierSet.options?.length || 0) !== 1 ? 's' : ''}</span>
												</div>
												<div className="h-1 w-1 rounded-full bg-muted-foreground/30" />
												<div className="flex items-center gap-1.5">
													<ShoppingBag className="h-3.5 w-3.5" />
													<span className="font-medium text-foreground">
														{modifierSet.product_count || 0}
													</span>
													<span>product{(modifierSet.product_count || 0) !== 1 ? 's' : ''}</span>
												</div>
											</div>

											{/* Option Preview */}
											{modifierSet.options &&
												modifierSet.options.length > 0 && (
													<div className="pt-2 border-t border-border">
														<div className="flex flex-wrap gap-1.5">
															{modifierSet.options.slice(0, 3).map((option) => (
																<Badge
																	key={option.id}
																	variant="secondary"
																	className="text-xs font-normal"
																>
																	{option.name}
																	{option.price_delta != 0 && (
																		<span className="ml-1 font-medium">
																			{Number(option.price_delta) > 0 ? "+" : ""}$
																			{Number(option.price_delta).toFixed(2)}
																		</span>
																	)}
																</Badge>
															))}
															{modifierSet.options.length > 3 && (
																<Badge
																	variant="outline"
																	className="text-xs"
																>
																	+{modifierSet.options.length - 3} more
																</Badge>
															)}
														</div>
													</div>
												)}
										</CardContent>
									</Card>
								))
							)}
					</div>
				</TabsContent>

				<TabsContent value="analytics">
					<UsageAnalytics modifierSets={modifierSets} />
				</TabsContent>

				<TabsContent value="templates">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Zap className="h-5 w-5" />
								Modifier Templates
							</CardTitle>
							<CardDescription>
								Create modifier sets from common templates
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="text-center py-12">
								<Zap className="h-12 w-12 text-gray-400 mx-auto mb-4" />
								<h4 className="text-lg font-medium text-gray-900 mb-2">
									Templates Coming Soon
								</h4>
								<p className="text-gray-500 max-w-sm mx-auto">
									Pre-built modifier templates for common use cases like sizes,
									add-ons, and cooking preferences.
								</p>
							</div>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>

			{/* Quick Create Dialog */}
			<ModifierQuickCreate
				open={isQuickCreateOpen}
				onOpenChange={setIsQuickCreateOpen}
				onSuccess={() => {
					fetchModifierSets();
					setIsQuickCreateOpen(false);
					toast({
						title: "Success",
						description: "Modifier set created successfully.",
					});
				}}
			/>

			{/* Advanced Editor Dialog */}
			{isEditorOpen && (
				<ModifierSetEditor
					modifierSet={selectedModifierSet}
					open={isEditorOpen}
					onOpenChange={setIsEditorOpen}
					onSuccess={() => {
						fetchModifierSets();
						setIsEditorOpen(false);
						toast({
							title: "Success",
							description: selectedModifierSet
								? "Modifier set updated successfully."
								: "Modifier set created successfully.",
						});
					}}
				/>
			)}

			{/* Confirmation Dialog */}
			{confirmation.dialog}
		</DomainPageLayout>
	);
};

export default ModifierManagementPage;