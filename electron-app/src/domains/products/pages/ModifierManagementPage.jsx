import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/shared/components/ui/tabs";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
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
import { useToast } from "@/shared/components/ui/use-toast";
import { useConfirmation } from "@/shared/components/ui/confirmation-dialog";
import { PageHeader } from "@/shared/components/layout/PageHeader";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { useOfflineModifiers, useOnlineStatus } from "@/shared/hooks";
import { OfflineOverlay } from "@/shared/components/ui/OfflineOverlay";
import * as modifierService from "@/domains/products/services/modifierService";
import ModifierQuickCreate from "@/domains/products/components/modifiers/ModifierQuickCreate";
import UsageAnalytics from "@/domains/products/components/modifiers/UsageAnalytics";
import ModifierSetEditor from "@/domains/products/components/modifiers/ModifierSetEditor";

const ModifierManagementPage = () => {
	const navigate = useNavigate();
	const [activeTab, setActiveTab] = useState("library");
	const [searchTerm, setSearchTerm] = useState("");
	const [selectedType, setSelectedType] = useState("all");
	const [selectedModifierSet, setSelectedModifierSet] = useState(null);
	const [isEditorOpen, setIsEditorOpen] = useState(false);
	const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
	const { toast } = useToast();
	const confirmation = useConfirmation();
	const isOnline = useOnlineStatus();

	// Use offline-first hook for modifier sets
	const {
		data: modifierSets,
		loading,
		error,
		refetch,
		isFromCache,
	} = useOfflineModifiers();

	const fetchModifierSets = () => {
		refetch({ forceApi: isOnline });
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

	const handleEditModifierSet = (modifierSet) => {
		setSelectedModifierSet(modifierSet);
		setIsEditorOpen(true);
	};

	const handleDeleteModifierSet = async (modifierSet) => {
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

	const handleDuplicateModifierSet = async (modifierSet) => {
		try {
			const duplicateData = {
				...modifierSet,
				name: `${modifierSet.name} (Copy)`,
				internal_name: `${modifierSet.internal_name}-copy-${Date.now()}`,
			};
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

	const modifierSetsArray = Array.isArray(modifierSets) ? modifierSets : [];
	const filteredModifierSets = modifierSetsArray.filter((set) => {
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

	const getTypeColor = (type, hasMin) => {
		if (hasMin) return "bg-blue-100 border-blue-300 text-blue-800";
		if (type === "MULTIPLE")
			return "bg-green-100 border-green-300 text-green-800";
		return "bg-gray-100 border-gray-300 text-gray-800";
	};

	const getTypeIcon = (type) => {
		return type === "MULTIPLE" ? "☑" : "○";
	};

	const headerActions = (
		<div className="flex items-center gap-3">
			<Button
				variant="outline"
				onClick={() => navigate("/products")}
				className="flex items-center gap-2"
			>
				<ArrowLeft className="h-4 w-4" />
				Back to Products
			</Button>
			<Button
				onClick={() => isOnline && handleCreateNew()}
				className="flex items-center gap-2"
				disabled={!isOnline}
			>
				<Plus className="h-4 w-4" />
				Create Modifier Set
			</Button>
			<Button
				onClick={() => isOnline && handleAdvancedCreate()}
				variant="outline"
				className="flex items-center gap-2"
				disabled={!isOnline}
			>
				<Settings className="h-4 w-4" />
				Advanced Editor
			</Button>
		</div>
	);

	return (
		<div className="flex flex-col h-full">
			<PageHeader
				icon={Settings}
				title="Modifier Management"
				description="Manage your modifier sets and options across all products"
				actions={headerActions}
				className="shrink-0"
			/>

			{/* Main Content */}
			<div className="flex-1 min-h-0 p-4">
				<ScrollArea className="h-full">
					<div className="pb-6">
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
								<div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
								<p className="text-sm text-muted-foreground">
									Loading modifier sets...
								</p>
							</div>
						) : filteredModifierSets.length === 0 ? (
							<div className="col-span-full text-center py-12 bg-muted/40 rounded-lg border-2 border-dashed border-border/60">
								<div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
									<Library className="h-6 w-6 text-muted-foreground" />
								</div>
								<h4 className="text-lg font-medium text-foreground mb-2">
									No modifier sets found
								</h4>
								<p className="text-muted-foreground mb-6 max-w-sm mx-auto">
									{searchTerm || selectedType !== "all"
										? "Try adjusting your search criteria"
										: "Create your first modifier set to get started"}
								</p>
								<Button
									onClick={() => isOnline && handleCreateNew()}
									disabled={!isOnline}
								>
									<Plus className="mr-2 h-4 w-4" />
									Create First Modifier Set
								</Button>
							</div>
						) : (
							filteredModifierSets.map((modifierSet) => (
								<Card
									key={modifierSet.id}
									className="hover:shadow-lg transition-shadow"
								>
									<CardHeader className="pb-2">
										<div className="flex items-start justify-between">
											<div className="flex-1">
												<CardTitle className="text-lg">
													{modifierSet.name}
												</CardTitle>
												<CardDescription className="text-sm text-gray-500">
													{modifierSet.internal_name}
												</CardDescription>
											</div>
											<div className="flex gap-1">
												<Button
													variant="ghost"
													size="sm"
													onClick={() => isOnline && handleEditModifierSet(modifierSet)}
													disabled={!isOnline}
													className={!isOnline ? "opacity-50" : ""}
												>
													<Edit3 className="h-4 w-4" />
												</Button>
												<Button
													variant="ghost"
													size="sm"
													onClick={() =>
														isOnline && handleDuplicateModifierSet(modifierSet)
													}
													disabled={!isOnline}
													className={!isOnline ? "opacity-50" : ""}
												>
													<Copy className="h-4 w-4" />
												</Button>
												<Button
													variant="ghost"
													size="sm"
													onClick={() =>
														isOnline && handleDeleteModifierSet(modifierSet)
													}
													disabled={!isOnline}
													className={!isOnline ? "opacity-50" : "text-red-600 hover:text-red-700"}
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											</div>
										</div>
									</CardHeader>
									<CardContent className="pt-2">
										<div className="space-y-3">
											<div className="flex items-center gap-2">
												<Badge
													variant="outline"
													className={getTypeColor(
														modifierSet.selection_type,
														modifierSet.min_selections > 0
													)}
												>
													{getTypeIcon(modifierSet.selection_type)}{" "}
													{modifierSet.selection_type === "MULTIPLE"
														? "Multi"
														: "Single"}
													{modifierSet.min_selections > 0 && " • Required"}
												</Badge>
												{modifierSet.triggered_by_option && (
													<Badge
														variant="outline"
														className="bg-orange-100 border-orange-300 text-orange-800"
													>
														<Zap className="mr-1 h-3 w-3" />
														Conditional
													</Badge>
												)}
											</div>
											<div className="text-sm text-gray-600">
												<div className="flex items-center gap-4">
													<span className="flex items-center gap-1">
														<Settings className="h-3 w-3" />
														{modifierSet.options?.length || 0} options
													</span>
													<span className="flex items-center gap-1">
														<ShoppingBag className="h-3 w-3" />
														{modifierSet.product_count || 0} products
													</span>
												</div>
											</div>
											{modifierSet.options &&
												modifierSet.options.length > 0 && (
													<div className="flex flex-wrap gap-1">
														{modifierSet.options.slice(0, 3).map((option) => (
															<Badge
																key={option.id}
																variant="secondary"
																className="text-xs"
															>
																{option.name}
																{option.price_delta !== 0 && (
																	<span className="ml-1">
																		{option.price_delta > 0 ? "+" : ""}$
																		{option.price_delta}
																	</span>
																)}
															</Badge>
														))}
														{modifierSet.options.length > 3 && (
															<Badge
																variant="secondary"
																className="text-xs"
															>
																+{modifierSet.options.length - 3} more
															</Badge>
														)}
													</div>
												)}
										</div>
									</CardContent>
								</Card>
							))
						)}
					</div>
				</TabsContent>

				<TabsContent value="analytics">
					<OfflineOverlay
						title="Analytics Unavailable"
						message="Usage analytics requires an internet connection to fetch real-time data."
					>
						<UsageAnalytics modifierSets={modifierSetsArray} />
					</OfflineOverlay>
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
					</div>
				</ScrollArea>
			</div>

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
		</div>
	);
};

export default ModifierManagementPage;
