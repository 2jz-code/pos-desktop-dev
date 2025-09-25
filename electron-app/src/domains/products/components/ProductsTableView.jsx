import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/shared/components/ui/table";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
	Package,
	MoreVertical,
	Edit,
	Archive,
	ArchiveRestore,
	AlertCircle,
	X,
} from "lucide-react";
import { formatCurrency } from "@/shared/lib/utils";

export const ProductsTableView = ({
	products,
	loading,
	error,
	hasActiveFilters,
	clearAllFilters,
	fetchProducts,
	showArchivedProducts,
	onCardClick,
	onEditProduct,
	onArchiveToggle,
	canEditProducts,
	canDeleteProducts,
}) => {
	if (loading) {
		return (
			<Card>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Product</TableHead>
							<TableHead>Category</TableHead>
							<TableHead>Status</TableHead>
							<TableHead className="text-right">Price</TableHead>
							<TableHead>Barcode</TableHead>
							<TableHead className="w-[80px]">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{Array.from({ length: 8 }).map((_, i) => (
							<TableRow key={i}>
								<TableCell>
									<div className="flex items-center gap-3">
										<Skeleton className="h-12 w-12 rounded-lg" />
										<div className="space-y-1">
											<Skeleton className="h-4 w-32" />
											<Skeleton className="h-3 w-24" />
										</div>
									</div>
								</TableCell>
								<TableCell><Skeleton className="h-4 w-20" /></TableCell>
								<TableCell><Skeleton className="h-6 w-16" /></TableCell>
								<TableCell><Skeleton className="h-4 w-16" /></TableCell>
								<TableCell><Skeleton className="h-4 w-24" /></TableCell>
								<TableCell><Skeleton className="h-8 w-8" /></TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</Card>
		);
	}

	if (error) {
		return (
			<Card className="p-8 text-center">
				<div className="space-y-4">
					<AlertCircle className="h-12 w-12 text-destructive mx-auto" />
					<div>
						<h3 className="font-medium text-foreground mb-2">Error Loading Products</h3>
						<p className="text-sm text-muted-foreground mb-4">{error}</p>
						<Button onClick={() => fetchProducts(showArchivedProducts)} variant="outline">
							<Package className="mr-2 h-4 w-4" />
							Try Again
						</Button>
					</div>
				</div>
			</Card>
		);
	}

	if (products.length === 0) {
		return (
			<Card className="p-8 text-center">
				<div className="space-y-4">
					<Package className="h-16 w-16 text-muted-foreground/60 mx-auto" />
					<div>
						<h3 className="text-xl font-semibold text-foreground mb-2">
							{hasActiveFilters ? "No matching products" : "No products found"}
						</h3>
						<p className="text-muted-foreground mb-6">
							{hasActiveFilters
								? "Try adjusting your search terms or filters to find what you're looking for."
								: showArchivedProducts
								? "No archived products found. All your products are currently active."
								: "Get started by adding your first product to the catalog."
							}
						</p>
						{hasActiveFilters && (
							<Button onClick={clearAllFilters} variant="outline" size="lg">
								<X className="mr-2 h-4 w-4" />
								Clear All Filters
							</Button>
						)}
					</div>
				</div>
			</Card>
		);
	}

	return (
		<Card>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Product</TableHead>
						<TableHead>Category</TableHead>
						<TableHead>Status</TableHead>
						<TableHead className="text-right">Price</TableHead>
						<TableHead>Barcode</TableHead>
						<TableHead className="w-[80px]">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{products.map((product) => (
						<TableRow
							key={product.id}
							className="cursor-pointer hover:bg-muted/40"
							onClick={() => onCardClick(product)}
						>
							<TableCell>
								<div className="flex items-center gap-3">
									{/* Product Image */}
									<div className="flex size-12 items-center justify-center rounded-lg bg-muted/20 shrink-0 overflow-hidden">
										{product.image ? (
											<img
												src={product.image}
												alt={product.name}
												className="w-full h-full object-cover"
											/>
										) : (
											<Package className="h-6 w-6 text-muted-foreground/40" />
										)}
									</div>

									{/* Product Info */}
									<div className="space-y-1 min-w-0">
										<div className="font-medium text-foreground truncate">
											{product.name}
										</div>
										{product.description && (
											<div className="text-sm text-muted-foreground truncate max-w-[200px]">
												{product.description}
											</div>
										)}
									</div>
								</div>
							</TableCell>

							<TableCell>
								{product.category ? (
									<Badge variant="outline" className="text-xs">
										{product.category.name}
									</Badge>
								) : (
									<span className="text-muted-foreground text-sm">—</span>
								)}
							</TableCell>

							<TableCell>
								<div className="flex items-center gap-2">
									<Badge
										variant={product.is_active ? "default" : "destructive"}
										className="text-xs"
									>
										{product.is_active ? "Active" : "Archived"}
									</Badge>
									{product.product_type && (
										<Badge variant="secondary" className="text-xs">
											{product.product_type.name}
										</Badge>
									)}
								</div>
							</TableCell>

							<TableCell className="text-right font-bold">
								{formatCurrency(product.price)}
							</TableCell>

							<TableCell className="text-muted-foreground font-mono text-sm">
								{product.barcode || "—"}
							</TableCell>

							<TableCell>
								{(canEditProducts() || canDeleteProducts()) && (
									<DropdownMenu>
										<DropdownMenuTrigger
											asChild
											onClick={(e) => e.stopPropagation()}
										>
											<Button
												variant="ghost"
												size="sm"
												className="h-8 w-8 p-0"
											>
												<MoreVertical className="h-4 w-4" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end" className="w-44">
											<DropdownMenuLabel>Actions</DropdownMenuLabel>
											{canEditProducts() && (
												<DropdownMenuItem
													onClick={(e) => {
														e.stopPropagation();
														onEditProduct(product.id);
													}}
												>
													<Edit className="mr-2 h-4 w-4" />
													Edit Product
												</DropdownMenuItem>
											)}
											{canEditProducts() && canDeleteProducts() && (
												<DropdownMenuSeparator />
											)}
											{canDeleteProducts() && (
												<DropdownMenuItem
													onClick={(e) => {
														e.stopPropagation();
														onArchiveToggle(product.id, product.is_active);
													}}
													className={
														product.is_active
															? "text-orange-600 focus:text-orange-600"
															: "text-green-600 focus:text-green-600"
													}
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
												</DropdownMenuItem>
											)}
										</DropdownMenuContent>
									</DropdownMenu>
								)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</Card>
	);
};