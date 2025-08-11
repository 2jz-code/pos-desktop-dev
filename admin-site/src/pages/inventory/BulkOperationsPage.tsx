import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useFieldArray, useForm, Controller, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ProductCombobox } from "@/components/shared/ProductCombobox";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	PlusCircle,
	Trash2,
	RefreshCw,
	ArrowUpDown,
	Edit,
	Warehouse,
	ArrowLeft,
	CheckCircle2,
	AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
// @ts-expect-error - No types for JS file
import inventoryService from "@/services/api/inventoryService";
import { useAuth } from "@/contexts/AuthContext";

// Helper component for adjustment quantity field with stock validation
const AdjustmentQuantityField = ({ index, control, productStockLevels }) => {
	const locationId = useWatch({
		control,
		name: `adjustments.${index}.location_id`,
	});
	const adjustmentType = useWatch({
		control,
		name: `adjustments.${index}.adjustment_type`,
	});

	return (
		<Controller
			name={`adjustments.${index}.quantity`}
			control={control}
			render={({ field }) => {
				const adjustmentKey = `adjustment_${index}`;
				const currentStockLevels = productStockLevels[adjustmentKey] || {};
				const availableStock = currentStockLevels[locationId] || 0;
				const maxQuantity = adjustmentType === 'Subtract' ? availableStock : Number.MAX_SAFE_INTEGER;
				
				return (
					<Input
						type="number"
						min="0"
						max={adjustmentType === 'Subtract' ? availableStock : undefined}
						step="0.01"
						value={field.value}
						onChange={(e) => {
							const value = parseFloat(e.target.value);
							if (isNaN(value) || value < 0) {
								field.onChange(0);
							} else if (value > maxQuantity) {
								field.onChange(maxQuantity);
							} else {
								field.onChange(e.target.value);
							}
						}}
						onBlur={(e) => {
							const value = parseFloat(e.target.value);
							if (isNaN(value) || value < 0) {
								field.onChange('0');
							} else if (value > maxQuantity) {
								field.onChange(maxQuantity.toString());
							}
						}}
					/>
				);
			}}
		/>
	);
};

// Helper component for transfer quantity field with stock validation
const TransferQuantityField = ({ index, control, productStockLevels }) => {
	const fromLocationId = useWatch({
		control,
		name: `transfers.${index}.from_location_id`,
	});

	return (
		<Controller
			name={`transfers.${index}.quantity`}
			control={control}
			render={({ field }) => {
				const transferKey = `transfer_${index}`;
				const currentStockLevels = productStockLevels[transferKey] || {};
				const availableStock = currentStockLevels[fromLocationId] || 0;
				
				return (
					<Input
						type="number"
						min="0"
						max={availableStock || undefined}
						step="0.01"
						value={field.value}
						onChange={(e) => {
							const value = parseFloat(e.target.value);
							if (isNaN(value) || value < 0) {
								field.onChange(0);
							} else if (value > availableStock) {
								field.onChange(availableStock);
							} else {
								field.onChange(e.target.value);
							}
						}}
						onBlur={(e) => {
							const value = parseFloat(e.target.value);
							if (isNaN(value) || value < 0) {
								field.onChange('0');
							} else if (value > availableStock) {
								field.onChange(availableStock.toString());
							}
						}}
					/>
				);
			}}
		/>
	);
};

export const BulkOperationsPage = () => {
	const navigate = useNavigate();
	const { user } = useAuth();
	const queryClient = useQueryClient();

	// State for tracking stock levels for selected products
	const [productStockLevels, setProductStockLevels] = useState({});

	// Fetch stock levels for a specific product
	const fetchStockLevelsForProduct = async (productId) => {
		if (!productId) {
			return {};
		}
		try {
			const response = await inventoryService.getStockByProduct(productId);
			const levels = (
				response.data?.results ||
				response.data ||
				response.results ||
				response
			).reduce((acc, stock) => {
				acc[stock.location.id] = stock.quantity;
				return acc;
			}, {});
			return levels;
		} catch (error) {
			console.error("Failed to fetch stock levels:", error);
			return {};
		}
	};

	const { data: stockItems, isLoading: stockLoading } = useQuery({
		queryKey: ["inventory-stock"],
		queryFn: () => inventoryService.getAllStock(),
	});

	const products = useMemo(() => {
		if (!stockItems) return [];
		const uniqueProducts = new Map();
		stockItems.forEach((item) => {
			if (!uniqueProducts.has(item.product.id)) {
				uniqueProducts.set(item.product.id, item.product);
			}
		});
		return Array.from(uniqueProducts.values());
	}, [stockItems]);

	const { data: locations, isLoading: locationsLoading } = useQuery({
		queryKey: ["locations"],
		queryFn: () => inventoryService.getLocations(),
		select: (data) => data.results,
	});

	const { mutate: bulkAdjustStock, isPending: isAdjusting } = useMutation({
		mutationFn: (data) => inventoryService.bulkAdjustStock(data),
		onSuccess: () => {
			toast.success("Bulk stock adjustment successful");
			queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
			resetAdjustmentForm();
		},
		onError: (error) => {
			toast.error("Bulk stock adjustment failed", {
				description: error.message,
			});
		},
	});

	const { mutate: bulkTransferStock, isPending: isTransferring } = useMutation({
		mutationFn: (data) => inventoryService.bulkTransferStock(data),
		onSuccess: () => {
			toast.success("Bulk stock transfer successful");
			queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
			resetTransferForm();
		},
		onError: (error) => {
			toast.error("Bulk stock transfer failed", {
				description: error.message,
			});
		},
	});

	const {
		control: adjustmentControl,
		handleSubmit: handleAdjustmentSubmit,
		reset: resetAdjustmentForm,
	} = useForm({
		defaultValues: {
			adjustments: [
				{ product_id: "", location_id: "", quantity: "", reason: "" },
			],
		},
	});

	const {
		fields: adjustmentFields,
		append: appendAdjustment,
		remove: removeAdjustment,
	} = useFieldArray({
		control: adjustmentControl,
		name: "adjustments",
	});

	const onAdjustmentSubmit = (data) => {
		// Convert string values to appropriate types for backend
		const processedData = {
			adjustments: data.adjustments
				.filter(
					(adjustment) =>
						adjustment.product_id &&
						adjustment.location_id &&
						adjustment.adjustment_type &&
						adjustment.quantity
				)
				.map((adjustment) => ({
					product_id: parseInt(adjustment.product_id),
					location_id: parseInt(adjustment.location_id),
					adjustment_type: adjustment.adjustment_type,
					quantity: parseFloat(adjustment.quantity),
					reason: adjustment.reason || "",
				})),
			user_id: user.id,
		};

		if (processedData.adjustments.length === 0) {
			toast.error(
				"Please fill in all required fields for at least one adjustment"
			);
			return;
		}

		bulkAdjustStock(processedData);
	};

	const {
		control: transferControl,
		handleSubmit: handleTransferSubmit,
		reset: resetTransferForm,
	} = useForm({
		defaultValues: {
			transfers: [
				{
					product_id: "",
					from_location_id: "",
					to_location_id: "",
					quantity: "",
				},
			],
			notes: "",
		},
	});

	const {
		fields: transferFields,
		append: appendTransfer,
		remove: removeTransfer,
	} = useFieldArray({
		control: transferControl,
		name: "transfers",
	});

	const onTransferSubmit = (data) => {
		// Convert string values to appropriate types for backend
		const processedData = {
			transfers: data.transfers
				.filter(
					(transfer) =>
						transfer.product_id &&
						transfer.from_location_id &&
						transfer.to_location_id &&
						transfer.quantity
				)
				.map((transfer) => ({
					product_id: parseInt(transfer.product_id),
					from_location_id: parseInt(transfer.from_location_id),
					to_location_id: parseInt(transfer.to_location_id),
					quantity: parseFloat(transfer.quantity),
				})),
			user_id: user.id,
			notes: data.notes || "",
		};

		if (processedData.transfers.length === 0) {
			toast.error(
				"Please fill in all required fields for at least one transfer"
			);
			return;
		}

		bulkTransferStock(processedData);
	};

	if (stockLoading || locationsLoading) {
		return (
			<div className="flex flex-col h-[calc(100vh-4rem)] bg-muted/40 p-4">
				<div className="flex items-center justify-center h-full">
					<div className="flex items-center space-x-2">
						<RefreshCw className="h-4 w-4 animate-spin" />
						<span className="text-muted-foreground">
							Loading inventory data...
						</span>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-[calc(100vh-4rem)] bg-muted/40 p-4 gap-4">
			<header className="flex items-center justify-between flex-shrink-0">
				<div className="space-y-1">
					<h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
						<Warehouse className="h-6 w-6" />
						Bulk Stock Operations
					</h1>
					<p className="text-sm text-muted-foreground">
						Perform bulk adjustments and transfers across multiple products and
						locations
					</p>
				</div>
				<div className="flex items-center space-x-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => navigate("/inventory")}
					>
						<ArrowLeft className="h-4 w-4 mr-2" />
						Back to Inventory
					</Button>
				</div>
			</header>

			{/* Summary Cards */}
			<div className="grid gap-4 md:grid-cols-2 flex-shrink-0">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Total Products
						</CardTitle>
						<Warehouse className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{products?.length || 0}</div>
						<p className="text-xs text-muted-foreground">
							Available for operations
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Locations</CardTitle>
						<ArrowUpDown className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{locations?.length || 0}</div>
						<p className="text-xs text-muted-foreground">Storage locations</p>
					</CardContent>
				</Card>
			</div>

			<Tabs
				defaultValue="adjustments"
				className="flex-1 flex flex-col min-h-0"
			>
				<TabsList className="grid w-full grid-cols-2 flex-shrink-0">
					<TabsTrigger
						value="adjustments"
						className="flex items-center gap-2"
					>
						<Edit className="h-4 w-4" />
						Bulk Adjustments
					</TabsTrigger>
					<TabsTrigger
						value="transfers"
						className="flex items-center gap-2"
					>
						<ArrowUpDown className="h-4 w-4" />
						Bulk Transfers
					</TabsTrigger>
				</TabsList>

				<TabsContent
					value="adjustments"
					className="flex-grow overflow-y-auto min-h-0"
				>
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Edit className="h-5 w-5" />
								Bulk Stock Adjustments
							</CardTitle>
							<CardDescription>
								Add or subtract stock quantities across multiple products and
								locations simultaneously
							</CardDescription>
						</CardHeader>
						<CardContent>
							<form onSubmit={handleAdjustmentSubmit(onAdjustmentSubmit)}>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Product</TableHead>
											<TableHead>Location</TableHead>
											<TableHead>Type</TableHead>
											<TableHead>Quantity</TableHead>
											<TableHead>Reason</TableHead>
											<TableHead></TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{adjustmentFields.map((field, index) => (
											<TableRow
												key={field.id}
												className="border-b border-spacing-y-2"
												style={{ height: "80px" }}
											>
												<TableCell className="align-top">
													<Controller
														name={`adjustments.${index}.product_id`}
														control={adjustmentControl}
														render={({ field }) => (
															<ProductCombobox
																products={products}
																selectedValue={field.value}
																onSelect={async (productId) => {
																	field.onChange(productId);
																	if (productId) {
																		const stockLevels =
																			await fetchStockLevelsForProduct(
																				productId
																			);
																		setProductStockLevels((prev) => ({
																			...prev,
																			[`adjustment_${index}`]: stockLevels,
																		}));
																	} else {
																		setProductStockLevels((prev) => ({
																			...prev,
																			[`adjustment_${index}`]: {},
																		}));
																	}
																}}
															/>
														)}
													/>
												</TableCell>
												<TableCell className="align-top">
													<Controller
														name={`adjustments.${index}.location_id`}
														control={adjustmentControl}
														render={({ field: locationField }) => {
															const adjustmentKey = `adjustment_${index}`;
															const currentStockLevels =
																productStockLevels[adjustmentKey] || {};
															return (
																<div className="space-y-1">
																	<Select
																		onValueChange={locationField.onChange}
																		defaultValue={locationField.value}
																	>
																		<SelectTrigger>
																			<SelectValue placeholder="Select a location" />
																		</SelectTrigger>
																		<SelectContent>
																			{locations?.map((location) => (
																				<SelectItem
																					key={location.id}
																					value={location.id.toString()}
																				>
																					{location.name}
																				</SelectItem>
																			))}
																		</SelectContent>
																	</Select>
																	{locationField.value &&
																		currentStockLevels[locationField.value] !==
																			undefined && (
																			<p className="text-xs text-gray-500">
																				Available:{" "}
																				{currentStockLevels[
																					locationField.value
																				] || 0}
																			</p>
																		)}
																</div>
															);
														}}
													/>
												</TableCell>
												<TableCell className="align-top">
													<Controller
														name={`adjustments.${index}.adjustment_type`}
														control={adjustmentControl}
														render={({ field }) => (
															<Select
																onValueChange={field.onChange}
																defaultValue={field.value}
															>
																<SelectTrigger>
																	<SelectValue placeholder="Type" />
																</SelectTrigger>
																<SelectContent>
																	<SelectItem value="Add">Add</SelectItem>
																	<SelectItem value="Subtract">
																		Subtract
																	</SelectItem>
																</SelectContent>
															</Select>
														)}
													/>
												</TableCell>
												<TableCell className="align-top">
													<AdjustmentQuantityField 
														index={index} 
														control={adjustmentControl}
														productStockLevels={productStockLevels}
													/>
												</TableCell>
												<TableCell className="align-top">
													<Input
														{...adjustmentControl.register(
															`adjustments.${index}.reason`
														)}
													/>
												</TableCell>
												<TableCell className="align-top">
													<Button
														type="button"
														variant="ghost"
														size="icon"
														onClick={() => removeAdjustment(index)}
													>
														<Trash2 className="h-4 w-4" />
													</Button>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="mt-4"
									onClick={() =>
										appendAdjustment({
											product_id: "",
											location_id: "",
											quantity: "",
											reason: "",
										})
									}
								>
									<PlusCircle className="h-4 w-4 mr-2" />
									Add Row
								</Button>
								<div className="flex justify-between items-center mt-6 pt-4 border-t">
									<p className="text-sm text-muted-foreground">
										{adjustmentFields.length} adjustment
										{adjustmentFields.length !== 1 ? "s" : ""} configured
									</p>
									<Button
										type="submit"
										disabled={isAdjusting}
										className="min-w-[140px]"
									>
										{isAdjusting ? (
											<>
												<RefreshCw className="mr-2 h-4 w-4 animate-spin" />
												Processing...
											</>
										) : (
											<>
												<CheckCircle2 className="mr-2 h-4 w-4" />
												Submit Adjustments
											</>
										)}
									</Button>
								</div>
							</form>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent
					value="transfers"
					className="flex-grow overflow-y-auto min-h-0"
				>
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<ArrowUpDown className="h-5 w-5" />
								Bulk Stock Transfers
							</CardTitle>
							<CardDescription>
								Transfer stock quantities between locations for multiple
								products at once
							</CardDescription>
						</CardHeader>
						<CardContent>
							<form onSubmit={handleTransferSubmit(onTransferSubmit)}>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Product</TableHead>
											<TableHead>From Location</TableHead>
											<TableHead>To Location</TableHead>
											<TableHead>Quantity</TableHead>
											<TableHead></TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{transferFields.map((field, index) => (
											<TableRow
												key={field.id}
												className="border-b border-spacing-y-2"
												style={{ height: "80px" }}
											>
												<TableCell className="align-top">
													<Controller
														name={`transfers.${index}.product_id`}
														control={transferControl}
														render={({ field }) => (
															<ProductCombobox
																products={products}
																selectedValue={field.value}
																onSelect={async (productId) => {
																	field.onChange(productId);
																	if (productId) {
																		const stockLevels =
																			await fetchStockLevelsForProduct(
																				productId
																			);
																		setProductStockLevels((prev) => ({
																			...prev,
																			[`transfer_${index}`]: stockLevels,
																		}));
																	} else {
																		setProductStockLevels((prev) => ({
																			...prev,
																			[`transfer_${index}`]: {},
																		}));
																	}
																}}
															/>
														)}
													/>
												</TableCell>
												<TableCell className="align-top">
													<Controller
														name={`transfers.${index}.from_location_id`}
														control={transferControl}
														render={({ field: fromLocationField }) => {
															const transferKey = `transfer_${index}`;
															const currentStockLevels =
																productStockLevels[transferKey] || {};
															return (
																<div className="space-y-1">
																	<Select
																		onValueChange={fromLocationField.onChange}
																		defaultValue={fromLocationField.value}
																	>
																		<SelectTrigger>
																			<SelectValue placeholder="From location" />
																		</SelectTrigger>
																		<SelectContent>
																			{locations?.map((location) => (
																				<SelectItem
																					key={location.id}
																					value={location.id.toString()}
																					disabled={
																						!currentStockLevels[location.id] ||
																						currentStockLevels[location.id] <= 0
																					}
																				>
																					{location.name}
																				</SelectItem>
																			))}
																		</SelectContent>
																	</Select>
																	{fromLocationField.value &&
																		currentStockLevels[
																			fromLocationField.value
																		] !== undefined && (
																			<p className="text-xs text-gray-500">
																				Available:{" "}
																				{currentStockLevels[
																					fromLocationField.value
																				] || 0}
																			</p>
																		)}
																</div>
															);
														}}
													/>
												</TableCell>
												<TableCell className="align-top">
													<Controller
														name={`transfers.${index}.to_location_id`}
														control={transferControl}
														render={({ field: toLocationField }) => {
															const transferKey = `transfer_${index}`;
															const currentStockLevels =
																productStockLevels[transferKey] || {};
															return (
																<div className="space-y-1">
																	<Select
																		onValueChange={toLocationField.onChange}
																		defaultValue={toLocationField.value}
																	>
																		<SelectTrigger>
																			<SelectValue placeholder="To location" />
																		</SelectTrigger>
																		<SelectContent>
																			{locations?.map((location) => (
																				<SelectItem
																					key={location.id}
																					value={location.id.toString()}
																				>
																					{location.name}
																				</SelectItem>
																			))}
																		</SelectContent>
																	</Select>
																	{toLocationField.value &&
																		currentStockLevels[
																			toLocationField.value
																		] !== undefined && (
																			<p className="text-xs text-gray-500">
																				Available:{" "}
																				{currentStockLevels[
																					toLocationField.value
																				] || 0}
																			</p>
																		)}
																</div>
															);
														}}
													/>
												</TableCell>
												<TableCell className="align-top">
													<TransferQuantityField 
														index={index} 
														control={transferControl}
														productStockLevels={productStockLevels}
													/>
												</TableCell>
												<TableCell className="align-top">
													<Button
														type="button"
														variant="ghost"
														size="icon"
														onClick={() => removeTransfer(index)}
													>
														<Trash2 className="h-4 w-4" />
													</Button>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="mt-4"
									onClick={() =>
										appendTransfer({
											product_id: "",
											from_location_id: "",
											to_location_id: "",
											quantity: "",
										})
									}
								>
									<PlusCircle className="h-4 w-4 mr-2" />
									Add Row
								</Button>
								<div className="mt-4 space-y-2">
									<Label
										htmlFor="notes"
										className="text-sm font-medium"
									>
										Transfer Notes (Optional)
									</Label>
									<Input
										id="notes"
										placeholder="Add notes about this bulk transfer..."
										{...transferControl.register("notes")}
									/>
								</div>
								<div className="flex justify-between items-center mt-6 pt-4 border-t">
									<p className="text-sm text-muted-foreground">
										{transferFields.length} transfer
										{transferFields.length !== 1 ? "s" : ""} configured
									</p>
									<Button
										type="submit"
										disabled={isTransferring}
										className="min-w-[140px]"
									>
										{isTransferring ? (
											<>
												<RefreshCw className="mr-2 h-4 w-4 animate-spin" />
												Processing...
											</>
										) : (
											<>
												<CheckCircle2 className="mr-2 h-4 w-4" />
												Submit Transfers
											</>
										)}
									</Button>
								</div>
							</form>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	);
};
