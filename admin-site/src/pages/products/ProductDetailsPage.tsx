import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getProductById } from "@/services/api/productService";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	ArrowLeft,
	Edit,
	Archive,
	ArchiveRestore,
	Package,
	RefreshCw,
	DollarSign,
	Info,
	Eye,
	Tag,
	Clock,
	Barcode as BarcodeIcon,
	Settings
} from "lucide-react";
import { formatCurrency } from "@ajeen/ui";
import { format, formatDistanceToNow } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { archiveProduct, unarchiveProduct } from "@/services/api/productService";
import { ProductFormDialog } from "@/components/ProductFormDialog";
import { useAuth } from "@/contexts/AuthContext";

export const ProductDetailsPage = () => {
	const { productId } = useParams<{ productId: string }>();
	const navigate = useNavigate();
	const { toast } = useToast();
	const { tenant } = useAuth();
	const tenantSlug = tenant?.slug || '';
	
	const [product, setProduct] = useState<any>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

	const fetchProduct = async () => {
		if (!productId) return;
		
		try {
			setLoading(true);
			const response = await getProductById(productId);
			setProduct(response.data);
			setError(null);
		} catch (err) {
			setError("Failed to fetch product details.");
			console.error(err);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchProduct();
	}, [productId]);

	const handleBack = () => {
		navigate(`/${tenantSlug}/products`);
	};

	const handleEdit = () => {
		setIsEditDialogOpen(true);
	};

	const handleArchiveToggle = async () => {
		if (!product) return;
		
		try {
			if (product.is_active) {
				await archiveProduct(product.id);
				toast({
					title: "Success",
					description: "Product archived successfully.",
				});
			} else {
				await unarchiveProduct(product.id);
				toast({
					title: "Success",
					description: "Product restored successfully.",
				});
			}
			fetchProduct(); // Refresh product data
		} catch (err) {
			toast({
				title: "Error",
				description: "Failed to update product status.",
				variant: "destructive",
			});
			console.error("Archive/restore error:", err);
		}
	};

	const handleEditSuccess = () => {
		fetchProduct(); // Refresh product data after edit
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
					<p className="text-muted-foreground">Loading product...</p>
				</div>
			</div>
		);
	}

	if (error || !product) {
		return (
			<div className="flex flex-col items-center justify-center min-h-screen">
				<div className="text-center">
					<Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
					<h2 className="text-2xl font-semibold mb-2">Product Not Found</h2>
					<p className="text-muted-foreground mb-4">
						{error || "The product you're looking for doesn't exist."}
					</p>
					<Button onClick={handleBack}>
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back to Products
					</Button>
				</div>
			</div>
		);
	}

	const statusDotColor = product.is_active ? "bg-emerald-500" : "bg-gray-500";

	return (
		<div className="flex flex-col h-full">
			{/* Page Header */}
			<div className="flex-shrink-0 border-b border-border bg-background p-4 md:p-6">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="p-2.5 bg-muted rounded-lg">
							<Package className="h-5 w-5 text-foreground" />
						</div>
						<div>
							<h1 className="text-xl font-bold text-foreground">
								{product.name}
							</h1>
							<p className="text-muted-foreground text-sm">
								Product ID: {product.id}
							</p>
						</div>
					</div>
					<div className="flex items-center gap-3">
						<Button
							onClick={handleBack}
							variant="outline"
							size="sm"
							className="border-border"
						>
							<ArrowLeft className="mr-2 h-4 w-4" />
							Back to Products
						</Button>
						<Button
							onClick={fetchProduct}
							variant="outline"
							size="sm"
							className="border-border"
						>
							<RefreshCw className="mr-2 h-4 w-4" />
							Refresh
						</Button>
						<Button
							onClick={handleEdit}
							variant="outline"
							size="sm"
							className="border-border"
						>
							<Edit className="mr-2 h-4 w-4" />
							Edit
						</Button>
						<Button
							onClick={handleArchiveToggle}
							variant={product.is_active ? "destructive" : "default"}
							size="sm"
						>
							{product.is_active ? (
								<>
									<Archive className="mr-2 h-4 w-4" />
									Archive
								</>
							) : (
								<>
									<ArchiveRestore className="mr-2 h-4 w-4" />
									Restore
								</>
							)}
						</Button>
						<div className="flex items-center gap-2">
							<div className={`h-2 w-2 rounded-full ${statusDotColor}`} />
							<Badge
								variant={product.is_active ? "default" : "secondary"}
								className="px-3 py-1 font-semibold"
							>
								{product.is_active ? "Active" : "Archived"}
							</Badge>
						</div>
					</div>
				</div>
			</div>

			{/* Scrollable Content Area */}
			<div className="flex-1 min-h-0 p-4 md:p-6">
				<ScrollArea className="h-full">
					<div className="pb-8">
						<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
							{/* Product Image Card */}
							<Card className="lg:col-span-1 border-border bg-card">
								<CardHeader className="pb-4">
									<div className="flex items-center gap-3">
										<div className="p-2.5 bg-muted rounded-lg">
											<Package className="h-5 w-5 text-foreground" />
										</div>
										<div>
											<CardTitle className="text-lg font-semibold text-foreground">
												Product Image
											</CardTitle>
										</div>
									</div>
								</CardHeader>
								<CardContent>
									{product.image ? (
										<div className="rounded-lg border border-border overflow-hidden bg-muted">
											<img
												src={product.image}
												alt={product.name}
												className="w-full h-auto object-contain"
											/>
										</div>
									) : (
										<div className="w-full h-64 bg-muted rounded-lg border border-border flex items-center justify-center">
											<div className="text-center">
												<Package className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
												<p className="text-sm text-muted-foreground">No image available</p>
											</div>
										</div>
									)}
								</CardContent>
							</Card>

							{/* Pricing & Basic Info Card */}
							<Card className="lg:col-span-2 border-border bg-card">
								<CardHeader className="pb-4">
									<div className="flex items-center gap-3">
										<div className="p-2.5 bg-muted rounded-lg">
											<DollarSign className="h-5 w-5 text-foreground" />
										</div>
										<div>
											<CardTitle className="text-lg font-semibold text-foreground">
												Pricing & Details
											</CardTitle>
											<CardDescription className="text-muted-foreground mt-1">
												Core product information and pricing
											</CardDescription>
										</div>
									</div>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="grid grid-cols-2 gap-4">
										<div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
											<span className="text-sm text-muted-foreground block mb-1">Price</span>
											<span className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
												{formatCurrency(product.price)}
											</span>
										</div>
										<div className="p-3 bg-muted rounded-lg border border-border">
											<span className="text-sm text-muted-foreground block mb-1">Barcode</span>
											{product.barcode ? (
												<span className="text-base font-mono font-semibold text-foreground">
													{product.barcode}
												</span>
											) : (
												<span className="text-sm text-muted-foreground">No barcode</span>
											)}
										</div>
									</div>

									<Separator />

									<div className="grid grid-cols-2 gap-4">
										<div>
											<span className="text-sm text-muted-foreground block mb-2">Category</span>
											{product.category ? (
												<Badge variant="outline" className="text-sm">
													{product.category.name}
												</Badge>
											) : (
												<span className="text-sm text-muted-foreground">Uncategorized</span>
											)}
										</div>
										<div>
											<span className="text-sm text-muted-foreground block mb-2">Product Type</span>
											{product.product_type ? (
												<Badge variant="default" className="text-sm">
													{product.product_type.name}
												</Badge>
											) : (
												<span className="text-sm text-muted-foreground">No Type</span>
											)}
										</div>
									</div>
								</CardContent>
							</Card>
						</div>

						{/* Description Card */}
						{product.description && (
							<Card className="mt-6 border-border bg-card">
								<CardHeader className="pb-4">
									<div className="flex items-center gap-3">
										<div className="p-2.5 bg-muted rounded-lg">
											<Info className="h-5 w-5 text-foreground" />
										</div>
										<div>
											<CardTitle className="text-lg font-semibold text-foreground">
												Description
											</CardTitle>
										</div>
									</div>
								</CardHeader>
								<CardContent>
									<p className="text-sm text-muted-foreground leading-relaxed">
										{product.description}
									</p>
								</CardContent>
							</Card>
						)}

						{/* Settings & Visibility Card */}
						<Card className="mt-6 border-border bg-card">
							<CardHeader className="pb-4">
								<div className="flex items-center gap-3">
									<div className="p-2.5 bg-muted rounded-lg">
										<Settings className="h-5 w-5 text-foreground" />
									</div>
									<div>
										<CardTitle className="text-lg font-semibold text-foreground">
											Settings & Visibility
										</CardTitle>
										<CardDescription className="text-muted-foreground mt-1">
											Product configuration and display options
										</CardDescription>
									</div>
								</div>
							</CardHeader>
							<CardContent>
								<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
									<div className="p-3 bg-muted rounded-lg border border-border">
										<span className="text-xs text-muted-foreground block mb-2">Status</span>
										<div className="flex items-center gap-2">
											<div className={`h-2 w-2 rounded-full ${statusDotColor}`} />
											<span className="text-sm font-semibold text-foreground">
												{product.is_active ? "Active" : "Archived"}
											</span>
										</div>
									</div>
									<div className="p-3 bg-muted rounded-lg border border-border">
										<span className="text-xs text-muted-foreground block mb-2">Visibility</span>
										<Badge variant={product.is_public ? "default" : "outline"} className="text-xs">
											{product.is_public ? "Public" : "Private"}
										</Badge>
									</div>
									<div className="p-3 bg-muted rounded-lg border border-border">
										<span className="text-xs text-muted-foreground block mb-2">Inventory</span>
										<Badge variant={product.track_inventory ? "default" : "outline"} className="text-xs">
											{product.track_inventory ? "Tracked" : "Not Tracked"}
										</Badge>
									</div>
									<div className="p-3 bg-muted rounded-lg border border-border">
										<span className="text-xs text-muted-foreground block mb-2">Product ID</span>
										<span className="text-sm font-mono font-semibold text-foreground">
											{product.id}
										</span>
									</div>
								</div>
							</CardContent>
						</Card>

						{/* Timestamps Card */}
						<Card className="mt-6 border-border bg-card">
							<CardHeader className="pb-4">
								<div className="flex items-center gap-3">
									<div className="p-2.5 bg-muted rounded-lg">
										<Clock className="h-5 w-5 text-foreground" />
									</div>
									<div>
										<CardTitle className="text-lg font-semibold text-foreground">
											Timeline
										</CardTitle>
										<CardDescription className="text-muted-foreground mt-1">
											Product creation and modification history
										</CardDescription>
									</div>
								</div>
							</CardHeader>
							<CardContent>
								<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
									<div className="space-y-2">
										<span className="text-sm font-semibold text-foreground">Created</span>
										<div className="flex flex-col gap-0.5">
											<span className="text-sm text-muted-foreground">
												{formatDistanceToNow(new Date(product.created_at), { addSuffix: true })}
											</span>
											<span className="text-xs text-muted-foreground/70">
												{format(new Date(product.created_at), "MMM d, yyyy 'at' h:mm a")}
											</span>
										</div>
									</div>
									<div className="space-y-2">
										<span className="text-sm font-semibold text-foreground">Last Updated</span>
										<div className="flex flex-col gap-0.5">
											<span className="text-sm text-muted-foreground">
												{formatDistanceToNow(new Date(product.updated_at), { addSuffix: true })}
											</span>
											<span className="text-xs text-muted-foreground/70">
												{format(new Date(product.updated_at), "MMM d, yyyy 'at' h:mm a")}
											</span>
										</div>
									</div>
								</div>
							</CardContent>
						</Card>

						{/* Modifier Groups (if any) */}
						{product.modifier_groups && product.modifier_groups.length > 0 && (
							<Card className="mt-6 border-border bg-card">
								<CardHeader className="pb-4">
									<div className="flex items-center gap-3">
										<div className="p-2.5 bg-muted rounded-lg">
											<Tag className="h-5 w-5 text-foreground" />
										</div>
										<div>
											<CardTitle className="text-lg font-semibold text-foreground">
												Modifier Groups
											</CardTitle>
											<CardDescription className="text-muted-foreground mt-1">
												{product.modifier_groups.length} modifier {product.modifier_groups.length === 1 ? 'group' : 'groups'} attached to this product
											</CardDescription>
										</div>
									</div>
								</CardHeader>
								<CardContent>
									<div className="flex flex-wrap gap-2">
										{product.modifier_groups.map((group: any) => (
											<Badge
												key={group.id}
												variant="secondary"
												className="text-sm px-3 py-1"
											>
												{group.name}
											</Badge>
										))}
									</div>
								</CardContent>
							</Card>
						)}
					</div>
				</ScrollArea>
			</div>

			{/* Edit Dialog */}
			<ProductFormDialog
				open={isEditDialogOpen}
				onOpenChange={setIsEditDialogOpen}
				productId={product.id}
				onSuccess={handleEditSuccess}
			/>
		</div>
	);
};