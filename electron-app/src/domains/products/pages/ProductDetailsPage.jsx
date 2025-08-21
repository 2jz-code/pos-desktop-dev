import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getProductById, archiveProduct, unarchiveProduct } from "@/domains/products/services/productService";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Separator } from "@/shared/components/ui/separator";
import { ArrowLeft, Edit, Archive, ArchiveRestore, Package } from "lucide-react";
import { formatCurrency } from "@/shared/lib/utils";
import { toast } from "@/shared/components/ui/use-toast";
import { ProductFormDialog } from "@/domains/products/components/dialogs/ProductFormDialog";
import { useRolePermissions } from "@/shared/hooks/useRolePermissions";

const ProductDetailsPage = () => {
	const { productId } = useParams();
	const navigate = useNavigate();
	
	const [product, setProduct] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	
	// Role-based permissions
	const { canEditProducts, canDeleteProducts } = useRolePermissions();

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
		navigate("/products");
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

	return (
		<>
			<div className="container mx-auto py-6 px-4">
				{/* Header */}
				<div className="flex items-center justify-between mb-6">
					<div className="flex items-center gap-4">
						<Button
							variant="ghost"
							onClick={handleBack}
							className="flex items-center gap-2"
						>
							<ArrowLeft className="h-4 w-4" />
							Back to Products
						</Button>
						<div>
							<h1 className="text-3xl font-bold">{product.name}</h1>
							<p className="text-muted-foreground">
								Product ID: {product.id}
							</p>
						</div>
					</div>
					{(canEditProducts() || canDeleteProducts()) && (
						<div className="flex items-center gap-2">
							{canEditProducts() && (
								<Button
									variant="outline"
									onClick={handleEdit}
								>
									<Edit className="mr-2 h-4 w-4" />
									Edit Product
								</Button>
							)}
							{canDeleteProducts() && (
								<Button
									variant={product.is_active ? "destructive" : "default"}
									onClick={handleArchiveToggle}
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
							)}
						</div>
					)}
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					{/* Product Image */}
					<div className="lg:col-span-1">
						<Card>
							<CardContent className="p-0">
								{product.image ? (
									<img
										src={product.image}
										alt={product.name}
										className="w-full max-h-96 object-contain rounded-lg bg-gray-50"
									/>
								) : (
									<div className="w-full h-64 bg-muted rounded-lg flex items-center justify-center">
										<div className="text-center">
											<Package className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
											<p className="text-sm text-muted-foreground">No image available</p>
										</div>
									</div>
								)}
							</CardContent>
						</Card>
					</div>

					{/* Product Details */}
					<div className="lg:col-span-2">
						<Card>
							<CardHeader>
								<CardTitle>Product Information</CardTitle>
							</CardHeader>
							<CardContent className="space-y-6">
								{/* Basic Info */}
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div>
										<h3 className="font-semibold mb-2">Name</h3>
										<p className="text-muted-foreground">{product.name}</p>
									</div>
									<div>
										<h3 className="font-semibold mb-2">Price</h3>
										<p className="text-2xl font-bold text-primary">
											{formatCurrency(product.price)}
										</p>
									</div>
								</div>

								<Separator />

								{/* Category and Type */}
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div>
										<h3 className="font-semibold mb-2">Category</h3>
										{product.category ? (
											<Badge variant="outline">{product.category.name}</Badge>
										) : (
											<span className="text-muted-foreground">No Category</span>
										)}
									</div>
									<div>
										<h3 className="font-semibold mb-2">Product Type</h3>
										{product.product_type ? (
											<Badge variant="secondary">{product.product_type.name}</Badge>
										) : (
											<span className="text-muted-foreground">No Type</span>
										)}
									</div>
								</div>

								<Separator />

								{/* Description */}
								<div>
									<h3 className="font-semibold mb-2">Description</h3>
									<p className="text-muted-foreground">
										{product.description || "No description available."}
									</p>
								</div>

								<Separator />

								{/* Additional Details */}
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div>
										<h3 className="font-semibold mb-2">Barcode</h3>
										<p className="text-muted-foreground font-mono">
											{product.barcode || "No barcode"}
										</p>
									</div>
									<div>
										<h3 className="font-semibold mb-2">Status</h3>
										<Badge variant={product.is_active ? "default" : "destructive"}>
											{product.is_active ? "Active" : "Archived"}
										</Badge>
									</div>
								</div>

								{/* Inventory Tracking */}
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div>
										<h3 className="font-semibold mb-2">Inventory Tracking</h3>
										<Badge variant={product.track_inventory ? "default" : "outline"}>
											{product.track_inventory ? "Enabled" : "Disabled"}
										</Badge>
									</div>
									<div>
										<h3 className="font-semibold mb-2">Public Visibility</h3>
										<Badge variant={product.is_public ? "default" : "outline"}>
											{product.is_public ? "Public" : "Private"}
										</Badge>
									</div>
								</div>

								<Separator />

								{/* Timestamps */}
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div>
										<h3 className="font-semibold mb-2">Created</h3>
										<p className="text-muted-foreground">
											{new Date(product.created_at).toLocaleDateString()}
										</p>
									</div>
									<div>
										<h3 className="font-semibold mb-2">Last Updated</h3>
										<p className="text-muted-foreground">
											{new Date(product.updated_at).toLocaleDateString()}
										</p>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>

			{/* Edit Dialog */}
			<ProductFormDialog
				open={isEditDialogOpen}
				onOpenChange={setIsEditDialogOpen}
				productId={product.id}
				onSuccess={handleEditSuccess}
			/>
		</>
	);
};

export default ProductDetailsPage;