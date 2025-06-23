import { useEffect, useState } from "react";
import {
	getProducts,
	createProduct,
	updateProduct,
	deleteProduct,
} from "../api/services/productService";
import { getCategories } from "../api/services/categoryService";
import { getProductTypes } from "@/api/services/productTypeService";
import inventoryService from "@/api/services/inventoryService";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { MoreHorizontal, Package } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
	DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { ProductTypeManagementDialog } from "@/components/dialogs/ProductTypeManagementDialog";
import { CategoryManagementDialog } from "@/components/dialogs/CategoryManagementDialog";

function useDebounce(value, delay) {
	const [debouncedValue, setDebouncedValue] = useState(value);
	useEffect(() => {
		const handler = setTimeout(() => {
			setDebouncedValue(value);
		}, delay);
		return () => {
			clearTimeout(handler);
		};
	}, [value, delay]);
	return debouncedValue;
}

export default function ProductsPage() {
	const [filteredProducts, setFilteredProducts] = useState([]);
	const [categories, setCategories] = useState([]);
	const [productTypes, setProductTypes] = useState([]);
	const [locations, setLocations] = useState([]);
	const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
	const [isCategoryManagementDialogOpen, setIsCategoryManagementDialogOpen] =
		useState(false);
	const [
		isProductTypeManagementDialogOpen,
		setIsProductTypeManagementDialogOpen,
	] = useState(false);
	const [editingProduct, setEditingProduct] = useState(null);
	const [productFormData, setProductFormData] = useState({
		name: "",
		price: "",
		description: "",
		category: null,
		product_type_id: null,
		track_inventory: false,
		initial_stock: 0,
		location_id: null,
	});
	const [selectedCategory, setSelectedCategory] = useState("all");
	const [searchTerm, setSearchTerm] = useState("");
	const debouncedSearchTerm = useDebounce(searchTerm, 300);

	const { toast } = useToast();
	const { isOwner } = useAuth();

	useEffect(() => {
		fetchCategories();
		fetchProductTypes();
		fetchLocations();
	}, []);

	useEffect(() => {
		fetchProducts();
	}, [selectedCategory, debouncedSearchTerm]);

	const fetchProducts = async () => {
		try {
			const params = {};
			if (selectedCategory && selectedCategory !== "all") {
				params.category = selectedCategory;
			}
			if (debouncedSearchTerm) {
				params.search = debouncedSearchTerm;
			}
			const response = await getProducts(params);
			setFilteredProducts(response.data || []);
		} catch (error) {
			console.error("Failed to fetch products:", error);
			setFilteredProducts([]); // Ensure filteredProducts is always an array
			toast({
				title: "Error",
				description: "Failed to fetch products.",
				variant: "destructive",
			});
		}
	};

	const fetchCategories = async () => {
		try {
			const response = await getCategories();
			setCategories(response.data || []);
		} catch (error) {
			console.error("Failed to fetch categories:", error);
			setCategories([]); // Ensure categories is always an array
			toast({
				title: "Error",
				description: "Failed to fetch categories.",
				variant: "destructive",
			});
		}
	};

	const fetchProductTypes = async () => {
		try {
			const response = await getProductTypes();
			setProductTypes(response.data || []);
		} catch (error) {
			console.error("Failed to fetch product types:", error);
			setProductTypes([]); // Ensure productTypes is always an array
			toast({
				title: "Error",
				description: "Failed to fetch product types.",
				variant: "destructive",
			});
		}
	};

	const fetchLocations = async () => {
		try {
			const data = await inventoryService.getLocations();
			setLocations(data || []);
		} catch (error) {
			console.error("Failed to fetch locations:", error);
			setLocations([]); // Ensure locations is always an array
			toast({
				title: "Error",
				description: "Failed to fetch locations.",
				variant: "destructive",
			});
		}
	};

	const handleProductFormChange = (e) => {
		const { name, value } = e.target;
		setProductFormData((prev) => ({ ...prev, [name]: value }));
	};

	const handleProductCategoryChange = (value) => {
		setProductFormData((prev) => ({ ...prev, category: value }));
	};

	const handleProductTypeChange = (value) => {
		setProductFormData((prev) => ({ ...prev, product_type_id: value }));
	};

	const handleTrackInventoryChange = (checked) => {
		setProductFormData((prev) => ({ ...prev, track_inventory: checked }));
	};

	const handleLocationChange = (value) => {
		setProductFormData((prev) => ({ ...prev, location_id: value }));
	};

	const handleFilterCategoryChange = (value) => {
		setSelectedCategory(value);
	};

	const openProductDialog = (product = null) => {
		setEditingProduct(product);
		setProductFormData(
			product
				? {
						name: product.name,
						price: product.price,
						description: product.description,
						category: product.category ? product.category.id : null,
						product_type_id: product.product_type
							? product.product_type.id
							: null,
						track_inventory: product.track_inventory || false,
						initial_stock: 0, // Not applicable for editing existing products
						location_id: null, // Not applicable for editing existing products
				  }
				: {
						name: "",
						price: "",
						description: "",
						category: null,
						product_type_id: null,
						track_inventory: false,
						initial_stock: 0,
						location_id: null,
				  }
		);
		setIsProductDialogOpen(true);
	};

	const closeProductDialog = () => {
		setIsProductDialogOpen(false);
		setEditingProduct(null);
	};

	const handleProductFormSubmit = async (e) => {
		e.preventDefault();
		try {
			const dataToSubmit = {
				...productFormData,
				category_id: productFormData.category,
			};

			if (editingProduct) {
				const updatedProduct = await updateProduct(
					editingProduct.id,
					dataToSubmit
				);
				setFilteredProducts((prev) =>
					prev.map((p) =>
						p.id === editingProduct.id ? updatedProduct.data : p
					)
				);
				toast({
					title: "Success",
					description: "Product updated successfully.",
				});
			} else {
				const newProduct = await createProduct(dataToSubmit);
				setFilteredProducts((prev) => [newProduct.data, ...prev]);
				toast({
					title: "Success",
					description: "Product created successfully.",
				});
			}
			closeProductDialog();
			fetchProducts();
		} catch (error) {
			console.error("Failed to save product:", error);
			toast({
				title: "Error",
				description: "Failed to save product.",
				variant: "destructive",
			});
		}
	};

	const handleDelete = async (productId) => {
		try {
			await deleteProduct(productId);
			toast({
				title: "Success",
				description: "Product deleted successfully.",
			});
			fetchProducts();
		} catch (error) {
			console.error("Failed to delete product:", error);
			toast({
				title: "Error",
				description: "Failed to delete product.",
				variant: "destructive",
			});
		}
	};

	const renderCategoryOptions = (parentId = null, level = 0) => {
		return (categories || [])
			.filter((c) => (c.parent || null) === parentId)
			.flatMap((c) => [
				<SelectItem
					key={c.id}
					value={String(c.id)}
				>
					{"\u00A0".repeat(level * 4)}
					{c.name}
				</SelectItem>,
				...renderCategoryOptions(c.id, level + 1),
			]);
	};

	return (
		<div className="p-4 md:p-8">
			<div className="flex items-center justify-between mb-4">
				<div className="flex items-center gap-2">
					<Package className="h-6 w-6" />
					<h1 className="text-2xl font-bold">Products</h1>
				</div>
				{isOwner && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline">Actions</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuLabel>Product Actions</DropdownMenuLabel>
							<DropdownMenuGroup>
								<DropdownMenuItem onClick={() => openProductDialog()}>
									Add New Product
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() => setIsCategoryManagementDialogOpen(true)}
								>
									Manage Categories
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() => setIsProductTypeManagementDialogOpen(true)}
								>
									Manage Product Types
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>
			<p className="text-muted-foreground mb-4">
				Manage your products and view their sales performance.
			</p>
			<Card>
				<CardContent className="pt-6">
					<div className="flex justify-between items-center mb-4">
						<div className="flex gap-2">
							<Select
								onValueChange={handleFilterCategoryChange}
								value={selectedCategory}
							>
								<SelectTrigger className="w-[280px]">
									<SelectValue placeholder="Filter by category..." />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Categories</SelectItem>
									{renderCategoryOptions()}
								</SelectContent>
							</Select>
						</div>

						<Input
							placeholder="Search products..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="max-w-sm"
						/>
					</div>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Category</TableHead>
								<TableHead>Type</TableHead>
								<TableHead>Price</TableHead>
								{isOwner && <TableHead>Actions</TableHead>}
							</TableRow>
						</TableHeader>
						<TableBody>
							{(filteredProducts || []).map((product) => (
								<TableRow key={product.id}>
									<TableCell>{product.name}</TableCell>
									<TableCell>{product.category?.name}</TableCell>
									<TableCell>{product.product_type?.name}</TableCell>
									<TableCell>${product.price}</TableCell>
									{isOwner && (
										<TableCell>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button
														variant="ghost"
														className="h-8 w-8 p-0"
													>
														<span className="sr-only">Open menu</span>
														<MoreHorizontal className="h-4 w-4" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuLabel>Actions</DropdownMenuLabel>
													<DropdownMenuItem
														onClick={() => openProductDialog(product)}
													>
														Edit
													</DropdownMenuItem>
													<DropdownMenuItem
														onClick={() => handleDelete(product.id)}
														className="text-red-600"
													>
														Delete
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</TableCell>
									)}
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<ProductTypeManagementDialog
				open={isProductTypeManagementDialogOpen}
				onOpenChange={setIsProductTypeManagementDialogOpen}
			/>
			<CategoryManagementDialog
				open={isCategoryManagementDialogOpen}
				onOpenChange={setIsCategoryManagementDialogOpen}
			/>

			<Dialog
				open={isProductDialogOpen}
				onOpenChange={setIsProductDialogOpen}
			>
				<DialogContent className="sm:max-w-[425px]">
					<DialogHeader>
						<DialogTitle>
							{editingProduct ? "Edit Product" : "Add Product"}
						</DialogTitle>
						<DialogDescription>
							{editingProduct
								? "Edit the product details."
								: "Add a new product to your inventory."}
						</DialogDescription>
					</DialogHeader>
					<form onSubmit={handleProductFormSubmit}>
						<div className="grid gap-4 py-4">
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="name"
									className="text-right"
								>
									Name
								</Label>
								<Input
									id="name"
									name="name"
									value={productFormData.name}
									onChange={handleProductFormChange}
									className="col-span-3"
								/>
							</div>
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="price"
									className="text-right"
								>
									Price
								</Label>
								<Input
									id="price"
									name="price"
									type="number"
									value={productFormData.price}
									onChange={handleProductFormChange}
									className="col-span-3"
								/>
							</div>
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="description"
									className="text-right"
								>
									Description
								</Label>
								<Input
									id="description"
									name="description"
									value={productFormData.description}
									onChange={handleProductFormChange}
									className="col-span-3"
								/>
							</div>
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="category"
									className="text-right"
								>
									Category
								</Label>
								<Select
									value={
										productFormData.category
											? String(productFormData.category)
											: ""
									}
									onValueChange={handleProductCategoryChange}
								>
									<SelectTrigger className="col-span-3">
										<SelectValue placeholder="Select a category" />
									</SelectTrigger>
									<SelectContent>{renderCategoryOptions()}</SelectContent>
								</Select>
							</div>
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="product_type"
									className="text-right"
								>
									Product Type
								</Label>
								<Select
									value={
										productFormData.product_type_id
											? String(productFormData.product_type_id)
											: ""
									}
									onValueChange={handleProductTypeChange}
								>
									<SelectTrigger className="col-span-3">
										<SelectValue placeholder="Select a product type" />
									</SelectTrigger>
									<SelectContent>
										{(productTypes || []).map((type) => (
											<SelectItem
												key={type.id}
												value={String(type.id)}
											>
												{type.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="track_inventory"
									className="text-right"
								>
									Track Inventory
								</Label>
								<div className="col-span-3 flex items-center space-x-2">
									<Switch
										id="track_inventory"
										checked={productFormData.track_inventory}
										onCheckedChange={handleTrackInventoryChange}
									/>
									<Label
										htmlFor="track_inventory"
										className="text-sm text-muted-foreground"
									>
										{productFormData.track_inventory ? "Enabled" : "Disabled"}
									</Label>
								</div>
							</div>

							{/* Inventory Configuration Fields - Only show when track_inventory is enabled and not editing */}
							{productFormData.track_inventory && !editingProduct && (
								<>
									<div className="grid grid-cols-4 items-center gap-4">
										<Label
											htmlFor="initial_stock"
											className="text-right"
										>
											Initial Stock
										</Label>
										<Input
											id="initial_stock"
											name="initial_stock"
											type="number"
											min="0"
											step="0.01"
											value={productFormData.initial_stock}
											onChange={handleProductFormChange}
											className="col-span-3"
											placeholder="Enter initial stock quantity"
										/>
									</div>
									<div className="grid grid-cols-4 items-center gap-4">
										<Label
											htmlFor="location"
											className="text-right"
										>
											Location
										</Label>
										<Select
											value={
												productFormData.location_id
													? String(productFormData.location_id)
													: ""
											}
											onValueChange={handleLocationChange}
										>
											<SelectTrigger className="col-span-3">
												<SelectValue placeholder="Select a location (optional)" />
											</SelectTrigger>
											<SelectContent>
												{(locations || []).map((location) => (
													<SelectItem
														key={location.id}
														value={String(location.id)}
													>
														{location.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</>
							)}
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={closeProductDialog}
							>
								Cancel
							</Button>
							<Button type="submit">Save</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
