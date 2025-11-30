import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { archiveProduct, unarchiveProduct } from "@/domains/products/services/productService";
import { useOfflineProductById, useOnlineStatus } from "@/shared/hooks";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import {
	ArrowLeft,
	Edit,
	Archive,
	ArchiveRestore,
	Package,
	MoreVertical,
	Barcode,
	Calendar,
	Tag,
	DollarSign,
	Eye,
	EyeOff,
	Tags,
	Activity,
	TrendingUp,
	AlertCircle,
	CheckCircle2,
	Copy,
	ExternalLink,
	Share2,
	Star,
	Heart,
	ShoppingCart,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { formatCurrency } from "@ajeen/ui";
import { toast } from "@/shared/components/ui/use-toast";
import { ProductFormDialog } from "@/domains/products/components/dialogs/ProductFormDialog";
import { useRolePermissions } from "@/shared/hooks/useRolePermissions";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import FullScreenLoader from "@/shared/components/common/FullScreenLoader";
import { format } from "date-fns";

const ProductDetailsPage = () => {
	const { productId } = useParams();
	const navigate = useNavigate();

	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [imageLoaded, setImageLoaded] = useState(false);

	// Role-based permissions
	const { canEditProducts, canDeleteProducts } = useRolePermissions();
	const isOnline = useOnlineStatus();

	// Fetch product with offline support
	const {
		data: product,
		loading,
		error,
		isFromCache,
		refetch,
	} = useOfflineProductById(productId, { useCache: true });

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
			refetch({ forceApi: true }); // Refresh product data
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
		refetch({ forceApi: true }); // Refresh product data after edit
	};

	const handleCopyBarcode = () => {
		if (product.barcode) {
			navigator.clipboard.writeText(product.barcode);
			toast({
				title: "Copied!",
				description: "Barcode copied to clipboard.",
			});
		}
	};

	const handleCopyProductId = () => {
		navigator.clipboard.writeText(product.id.toString());
		toast({
			title: "Copied!",
			description: "Product ID copied to clipboard.",
		});
	};

	if (loading && !product) return <FullScreenLoader />;

	if (!product && !loading) {
		return (
			<div className="flex items-center justify-center h-full">
				<Card className="border border-destructive/20 bg-destructive/5 p-8 max-w-md mx-auto text-center">
					<CardContent className="space-y-4">
						<AlertCircle className="h-16 w-16 text-destructive mx-auto" />
						<div>
							<h3 className="text-xl font-semibold text-foreground mb-2">Product Not Found</h3>
							<p className="text-sm text-muted-foreground mb-6">
								{error || "The product you're looking for doesn't exist or failed to load."}
							</p>
							<div className="flex gap-3 justify-center">
								<Button onClick={handleBack} variant="outline">
									<ArrowLeft className="mr-2 h-4 w-4" />
									Back to Products
								</Button>
								<Button onClick={() => refetch({ forceApi: true })} variant="default">
									Try Again
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	const InfoCard = ({ icon: IconComponent, title, children, className = "" }) => (
		<Card className={cn("border border-border/60 bg-card/80", className)}>
			<CardContent className="p-4">
				<div className="flex items-start gap-3">
					<div className="flex size-10 items-center justify-center rounded-lg bg-muted/30 text-muted-foreground shrink-0">
						<IconComponent className="h-5 w-5" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
						{children}
					</div>
				</div>
			</CardContent>
		</Card>
	);

	return (
		<div className="flex flex-col h-full">
			{/* Modern Header */}
			<div className="border-b border-border/60 bg-card/80 backdrop-blur-sm sticky top-0 z-20">
				<div className="p-4 md:p-6">
					{/* Navigation and Title */}
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center gap-4">
							<Button
								variant="outline"
								size="icon"
								onClick={handleBack}
								className="shrink-0"
							>
								<ArrowLeft className="h-4 w-4" />
							</Button>
							<div className="min-w-0">
								<div className="flex items-center gap-3 mb-1">
									<h1 className="text-xl font-semibold text-foreground truncate">
										{product.name}
									</h1>
									<Badge
										variant={product.is_active ? "default" : "destructive"}
										className="rounded-full px-2.5 py-1 shrink-0"
									>
										{product.is_active ? "Active" : "Archived"}
									</Badge>
								</div>
								<div className="flex items-center gap-3 text-sm text-muted-foreground">
									<span>ID: {product.id}</span>
									<Button
										variant="ghost"
										size="sm"
										onClick={handleCopyProductId}
										className="h-auto p-1 text-muted-foreground hover:text-foreground"
									>
										<Copy className="h-3 w-3" />
									</Button>
									<span>•</span>
									<span>{product.created_at ? format(new Date(product.created_at), "MMM d, yyyy") : 'N/A'}</span>
								</div>
							</div>
						</div>

						{/* Quick Actions */}
						<div className="flex items-center gap-2">
							{canEditProducts() && (
								<Button
									onClick={() => isOnline && handleEdit()}
									size="lg"
									className="hidden sm:flex"
									disabled={!isOnline}
								>
									<Edit className="mr-2 h-4 w-4" />
									Edit Product
								</Button>
							)}

							{(canEditProducts() || canDeleteProducts()) && (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button variant="outline" size="icon" className="h-10 w-10">
											<MoreVertical className="h-4 w-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" className="w-48">
										<DropdownMenuLabel>Actions</DropdownMenuLabel>
										{canEditProducts() && (
											<>
												<DropdownMenuItem
													disabled={!isOnline}
													onClick={() => isOnline && handleEdit()}
													className={cn("sm:hidden", !isOnline && "opacity-50")}
												>
													<Edit className="mr-2 h-4 w-4" />
													Edit Product
												</DropdownMenuItem>
												<DropdownMenuSeparator className="sm:hidden" />
											</>
										)}
										<DropdownMenuItem onClick={handleCopyProductId}>
											<Copy className="mr-2 h-4 w-4" />
											Copy Product ID
										</DropdownMenuItem>
										{product.barcode && (
											<DropdownMenuItem onClick={handleCopyBarcode}>
												<Barcode className="mr-2 h-4 w-4" />
												Copy Barcode
											</DropdownMenuItem>
										)}
										{canDeleteProducts() && (
											<>
												<DropdownMenuSeparator />
												<DropdownMenuItem
													disabled={!isOnline}
													onClick={() => isOnline && handleArchiveToggle()}
													className={
														!isOnline
															? "opacity-50"
															: product.is_active
																? "text-orange-600 focus:text-orange-600"
																: "text-green-600 focus:text-green-600"
													}
												>
													{product.is_active ? (
														<>
															<Archive className="mr-2 h-4 w-4" />
															Archive Product
														</>
													) : (
														<>
															<ArchiveRestore className="mr-2 h-4 w-4" />
															Restore Product
														</>
													)}
												</DropdownMenuItem>
											</>
										)}
									</DropdownMenuContent>
								</DropdownMenu>
							)}
						</div>
					</div>

					{/* Hero Card with Product Image and Key Info */}
					<Card className="border border-border/60 bg-card/90 shadow-sm">
						<CardContent className="p-0">
							<div className="flex flex-col lg:flex-row">
								{/* Product Image */}
								<div className="lg:w-80 shrink-0">
									<div className="aspect-square relative overflow-hidden rounded-t-lg lg:rounded-l-lg lg:rounded-tr-none bg-muted/20">
										{product.image ? (
											<>
												{!imageLoaded && (
													<div className="absolute inset-0 flex items-center justify-center">
														<Package className="h-16 w-16 text-muted-foreground/40 animate-pulse" />
													</div>
												)}
												<img
													src={product.image}
													alt={product.name}
													className={cn(
														"w-full h-full object-cover transition-opacity duration-300",
														imageLoaded ? "opacity-100" : "opacity-0"
													)}
													onLoad={() => setImageLoaded(true)}
												/>
											</>
										) : (
											<div className="w-full h-full flex items-center justify-center">
												<div className="text-center">
													<Package className="h-20 w-20 text-muted-foreground/40 mx-auto mb-3" />
													<p className="text-sm text-muted-foreground">No image available</p>
												</div>
											</div>
										)}

										{/* Visibility Indicator */}
										<div className="absolute top-4 left-4">
											<Badge
												variant={product.is_public ? "default" : "outline"}
												className="rounded-full px-3 py-1 shadow-sm"
											>
												{product.is_public ? (
													<><Eye className="mr-1 h-3 w-3" />Public</>
												) : (
													<><EyeOff className="mr-1 h-3 w-3" />Private</>
												)}
											</Badge>
										</div>
									</div>
								</div>

								{/* Product Details */}
								<div className="flex-1 p-6 space-y-6">
									{/* Price and Key Details */}
									<div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
										<div className="space-y-2">
											<h2 className="text-2xl font-bold text-foreground">{product.name}</h2>
											{product.description && (
												<p className="text-muted-foreground leading-relaxed">
													{product.description}
												</p>
											)}
										</div>
										<div className="text-right">
											<div className="text-3xl font-bold text-primary">
												{formatCurrency(product.price)}
											</div>
											<p className="text-sm text-muted-foreground mt-1">Base Price</p>
										</div>
									</div>

									{/* Tags and Categories */}
									<div className="flex items-center gap-2 flex-wrap">
										<Badge
											variant="outline"
											className="rounded-full border-border/60 bg-transparent px-3 py-1"
										>
											<Tags className="mr-1 h-3 w-3" />
											{product.category?.name || "Uncategorized"}
										</Badge>
										<Badge
											variant="secondary"
											className="rounded-full px-3 py-1"
										>
											<Tag className="mr-1 h-3 w-3" />
											{product.product_type?.name || "No Type"}
										</Badge>
										{product.track_inventory && (
											<Badge
												variant="outline"
												className="rounded-full border-accent/60 bg-accent/15 text-accent-foreground px-3 py-1"
											>
												<Activity className="mr-1 h-3 w-3" />
												Inventory Tracked
											</Badge>
										)}
									</div>

									{/* Quick Stats */}
									<div className="grid grid-cols-2 gap-4 pt-2">
										<div className="space-y-1">
											<p className="text-sm text-muted-foreground">Status</p>
											<div className="flex items-center gap-2">
												<div className={cn(
													"w-2 h-2 rounded-full",
													product.is_active ? "bg-primary" : "bg-destructive"
												)} />
												<span className="font-medium text-foreground">
													{product.is_active ? "Active" : "Archived"}
												</span>
											</div>
										</div>
										<div className="space-y-1">
											<p className="text-sm text-muted-foreground">Visibility</p>
											<span className="font-medium text-foreground">
												{product.is_public ? "Public" : "Private"}
											</span>
										</div>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>

			{/* Scrollable Content */}
			<div className="flex-1 overflow-hidden">
				<ScrollArea className="h-full">
					<div className="p-4 md:p-6 space-y-6 pb-20">
						{/* Product Information */}
						<div className="space-y-4">
							<h3 className="text-lg font-semibold text-foreground">Product Information</h3>

							<div className="grid gap-4 sm:grid-cols-2">
								{/* Barcode */}
								{product.barcode && (
									<InfoCard icon={Barcode} title="Barcode">
										<div className="flex items-center justify-between">
											<span className="font-mono text-foreground font-medium">
												{product.barcode}
											</span>
											<Button
												variant="ghost"
												size="sm"
												onClick={handleCopyBarcode}
												className="h-8 px-2 text-muted-foreground hover:text-foreground"
											>
												<Copy className="h-3 w-3" />
											</Button>
										</div>
									</InfoCard>
								)}

								{/* Category */}
								<InfoCard icon={Tags} title="Category">
									<span className="text-foreground font-medium">
										{product.category?.name || "Uncategorized"}
									</span>
								</InfoCard>

								{/* Product Type */}
								<InfoCard icon={Tag} title="Product Type">
									<span className="text-foreground font-medium">
										{product.product_type?.name || "No Type"}
									</span>
								</InfoCard>

								{/* Inventory Tracking */}
								<InfoCard icon={Activity} title="Inventory Tracking">
									<div className="flex items-center gap-2">
										<div className={cn(
											"w-2 h-2 rounded-full",
											product.track_inventory ? "bg-primary" : "bg-muted-foreground"
										)} />
										<span className="text-foreground font-medium">
											{product.track_inventory ? "Enabled" : "Disabled"}
										</span>
									</div>
								</InfoCard>
							</div>
						</div>

						{/* Timestamps */}
						<div className="space-y-4">
							<h3 className="text-lg font-semibold text-foreground">Timeline</h3>

							<div className="grid gap-4 sm:grid-cols-2">
								<InfoCard icon={Calendar} title="Created">
									<div>
										<p className="text-foreground font-medium">
											{product.created_at ? format(new Date(product.created_at), "PPPP") : 'N/A'}
										</p>
										<p className="text-sm text-muted-foreground">
											{product.created_at ? format(new Date(product.created_at), "p") : ''}
										</p>
									</div>
								</InfoCard>

								<InfoCard icon={Calendar} title="Last Updated">
									<div>
										<p className="text-foreground font-medium">
											{format(new Date(product.updated_at), "PPPP")}
										</p>
										<p className="text-sm text-muted-foreground">
											{format(new Date(product.updated_at), "p")}
										</p>
									</div>
								</InfoCard>
							</div>
						</div>

						{/* System Information */}
						<div className="space-y-4">
							<h3 className="text-lg font-semibold text-foreground">System Information</h3>

							<div className="grid gap-4 sm:grid-cols-2">
								<InfoCard icon={Package} title="Product ID">
									<div className="flex items-center justify-between">
										<span className="font-mono text-foreground font-medium">
											#{product.id}
										</span>
										<Button
											variant="ghost"
											size="sm"
											onClick={handleCopyProductId}
											className="h-8 px-2 text-muted-foreground hover:text-foreground"
										>
											<Copy className="h-3 w-3" />
										</Button>
									</div>
								</InfoCard>

								<InfoCard icon={DollarSign} title="Price">
									<span className="text-2xl font-bold text-primary">
										{formatCurrency(product.price)}
									</span>
								</InfoCard>
							</div>
						</div>

						{/* Additional Information */}
						{product.description && (
							<Card className="border border-border/60 bg-card/80">
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<Package className="h-5 w-5 text-primary" />
										Description
									</CardTitle>
								</CardHeader>
								<CardContent>
									<p className="text-muted-foreground leading-relaxed">
										{product.description}
									</p>
								</CardContent>
							</Card>
						)}
					</div>
				</ScrollArea>
			</div>

			{/* Floating Action Buttons for Mobile */}
			{canEditProducts() && (
				<div className="fixed bottom-6 right-6 z-30 sm:hidden">
					<Button
						size="lg"
						onClick={() => isOnline && handleEdit()}
						className="h-14 w-14 rounded-full shadow-lg"
						disabled={!isOnline}
					>
						<Edit className="h-5 w-5" />
					</Button>
				</div>
			)}

			{/* Edit Dialog */}
			<ProductFormDialog
				open={isEditDialogOpen}
				onOpenChange={setIsEditDialogOpen}
				productId={product?.id}
				onSuccess={handleEditSuccess}
			/>
		</div>
	);
};

export default ProductDetailsPage;