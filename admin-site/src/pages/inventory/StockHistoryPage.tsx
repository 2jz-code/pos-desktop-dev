import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	History,
	RefreshCw,
	ArrowLeft,
	Search,
	Clock,
	User,
	Package,
	ArrowUpDown,
	Plus,
	Minus,
	MapPin,
	Calendar,
} from "lucide-react";
// @ts-expect-error - No types for JS file
import inventoryService from "@/services/api/inventoryService";
import { useDebounce } from "@ajeen/ui";
import { ReasonBadge } from "@/components/inventory/ReasonBadge";

interface Product {
	id: number;
	name: string;
	sku?: string;
	barcode?: string;
}

interface Location {
	id: number;
	name: string;
	description?: string;
}

interface User {
	id: number;
	first_name: string;
	last_name: string;
	username: string;
}

interface ReasonCategoryDisplay {
	label: string;
	color: string;
	description: string;
}

interface StockHistoryEntry {
	id: number;
	product: Product;
	location: Location;
	user: User;
	operation_type: string;
	operation_display: string;
	quantity_change: number;
	previous_quantity: number;
	new_quantity: number;
	reason?: string;
	notes?: string;
	reason_category: string;
	reason_category_display: ReasonCategoryDisplay;
	truncated_reason?: string;
	timestamp: string;
	reference_id?: string;
}

const OPERATION_TYPES = {
	CREATED: {
		label: "Created",
		color: "bg-green-100 text-green-800",
		icon: Plus,
	},
	ADJUSTED_ADD: {
		label: "Added",
		color: "bg-blue-100 text-blue-800",
		icon: Plus,
	},
	ADJUSTED_SUBTRACT: {
		label: "Subtracted",
		color: "bg-orange-100 text-orange-800",
		icon: Minus,
	},
	TRANSFER_FROM: {
		label: "Transfer Out",
		color: "bg-red-100 text-red-800",
		icon: ArrowUpDown,
	},
	TRANSFER_TO: {
		label: "Transfer In",
		color: "bg-purple-100 text-purple-800",
		icon: ArrowUpDown,
	},
} as const;

export const StockHistoryPage = () => {
	const navigate = useNavigate();

	// Filtering and search states
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
	const [selectedOperationType, setSelectedOperationType] = useState<
		string | null
	>(null);
	const [selectedUser, setSelectedUser] = useState<string | null>(null);
	const [dateRange, setDateRange] = useState<string>("all");
	const [activeTab, setActiveTab] = useState("all");

	// Data fetching - get all records once
	const { data: allHistoryData, isLoading: historyLoading } = useQuery<
		StockHistoryEntry[]
	>({
		queryKey: ["stock-history"],
		queryFn: () => inventoryService.getStockHistory({}),
		staleTime: 30000, // Consider data fresh for 30 seconds
		cacheTime: 300000, // Keep in cache for 5 minutes
	});

	const { data: locations, isLoading: locationsLoading } = useQuery<Location[]>(
		{
			queryKey: ["inventory-locations"],
			queryFn: inventoryService.getLocations,
			select: (data) => data.results,
		}
	);

	// Client-side filtering
	const filteredHistoryData = useMemo(() => {
		if (!allHistoryData) return [];

		let filtered = allHistoryData;

		// Filter by search query
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			filtered = filtered.filter((entry) =>
				entry.product.name.toLowerCase().includes(query) ||
				entry.product.barcode?.toLowerCase().includes(query) ||
				entry.reason?.toLowerCase().includes(query) ||
				entry.notes?.toLowerCase().includes(query) ||
				entry.reference_id?.toLowerCase().includes(query)
			);
		}

		// Filter by location
		if (selectedLocation) {
			filtered = filtered.filter((entry) => entry.location.id.toString() === selectedLocation);
		}

		// Filter by operation type
		if (selectedOperationType) {
			filtered = filtered.filter((entry) => entry.operation_type === selectedOperationType);
		}

		// Filter by user
		if (selectedUser) {
			filtered = filtered.filter((entry) => entry.user?.id.toString() === selectedUser);
		}

		// Filter by tab
		if (activeTab === "adjustments") {
			filtered = filtered.filter((entry) =>
				["ADJUSTED_ADD", "ADJUSTED_SUBTRACT", "CREATED"].includes(
					entry.operation_type
				)
			);
		} else if (activeTab === "transfers") {
			filtered = filtered.filter((entry) =>
				["TRANSFER_FROM", "TRANSFER_TO"].includes(entry.operation_type)
			);
		}

		return filtered;
	}, [allHistoryData, searchQuery, selectedLocation, selectedOperationType, selectedUser, activeTab]);

	// Calculate summary statistics
	const summaryStats = useMemo(() => {
		if (!filteredHistoryData)
			return { total: 0, creations: 0, adjustments: 0, transfers: 0 };

		const stats = filteredHistoryData.reduce(
			(acc, entry) => {
				acc.total++;
				switch (entry.operation_type) {
					case "CREATED":
						acc.creations++;
						break;
					case "ADJUSTED_ADD":
					case "ADJUSTED_SUBTRACT":
						acc.adjustments++;
						break;
					case "TRANSFER_FROM":
					case "TRANSFER_TO":
						acc.transfers++;
						break;
				}
				return acc;
			},
			{ total: 0, creations: 0, adjustments: 0, transfers: 0 }
		);

		return stats;
	}, [filteredHistoryData]);

	const getOperationTypeInfo = (operationType: string) => {
		return (
			OPERATION_TYPES[operationType as keyof typeof OPERATION_TYPES] || {
				label: operationType,
				color: "bg-gray-100 text-gray-800",
				icon: Clock,
			}
		);
	};

	const formatQuantityChange = (change: number, operationType: string) => {
		const sign = change >= 0 ? "+" : "";
		return `${sign}${change}`;
	};

	const formatTimestamp = (timestamp: string) => {
		return new Date(timestamp).toLocaleString();
	};

	const isLoading = historyLoading || locationsLoading;

	if (isLoading) {
		return (
			<div className="flex flex-col h-[calc(100vh-4rem)] bg-muted/40 p-4">
				<div className="flex items-center justify-center h-full">
					<div className="flex items-center space-x-2">
						<RefreshCw className="h-4 w-4 animate-spin" />
						<span className="text-muted-foreground">
							Loading stock history...
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
						<History className="h-6 w-6" />
						Stock History
					</h1>
					<p className="text-sm text-muted-foreground">
						View all stock creations, adjustments, and transfers across your
						inventory
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
			<div className="grid gap-4 md:grid-cols-4 flex-shrink-0">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Total Operations
						</CardTitle>
						<History className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{summaryStats.total}</div>
						<p className="text-xs text-muted-foreground">
							All recorded operations
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Stock Creations
						</CardTitle>
						<Plus className="h-4 w-4 text-green-600" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold text-green-600">
							{summaryStats.creations}
						</div>
						<p className="text-xs text-muted-foreground">New stock entries</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Adjustments</CardTitle>
						<Clock className="h-4 w-4 text-blue-600" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold text-blue-600">
							{summaryStats.adjustments}
						</div>
						<p className="text-xs text-muted-foreground">Stock modifications</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Transfers</CardTitle>
						<ArrowUpDown className="h-4 w-4 text-purple-600" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold text-purple-600">
							{summaryStats.transfers}
						</div>
						<p className="text-xs text-muted-foreground">Location movements</p>
					</CardContent>
				</Card>
			</div>

			<Tabs
				value={activeTab}
				onValueChange={setActiveTab}
				className="flex-1 flex flex-col min-h-0"
			>
				<TabsList className="grid w-full grid-cols-3 flex-shrink-0">
					<TabsTrigger value="all">All Operations</TabsTrigger>
					<TabsTrigger value="adjustments">Adjustments</TabsTrigger>
					<TabsTrigger value="transfers">Transfers</TabsTrigger>
				</TabsList>

				<TabsContent
					value={activeTab}
					className="flex-grow overflow-y-auto min-h-0"
				>
					<Card className="flex-grow flex flex-col min-h-0">
						<CardHeader className="px-7 flex-shrink-0">
							<div className="flex items-center justify-between">
								<div>
									<CardTitle>Stock Operation History</CardTitle>
									<CardDescription>
										Complete audit trail of all inventory changes
									</CardDescription>
								</div>
								<div className="flex items-center gap-2 flex-wrap">
									<div className="relative">
										<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
										<Input
											type="search"
											placeholder="Search products, reference IDs, reasons..."
											className="w-full appearance-none bg-background pl-8 shadow-none md:w-[300px]"
											value={searchQuery}
											onChange={(e) => setSearchQuery(e.target.value)}
										/>
									</div>
									<Select
										value={selectedLocation || "all"}
										onValueChange={(value) =>
											setSelectedLocation(value === "all" ? null : value)
										}
									>
										<SelectTrigger className="w-[150px]">
											<SelectValue placeholder="All Locations" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Locations</SelectItem>
											{locations?.map((loc) => (
												<SelectItem
													key={loc.id}
													value={loc.id.toString()}
												>
													{loc.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<Select
										value={selectedOperationType || "all"}
										onValueChange={(value) =>
											setSelectedOperationType(value === "all" ? null : value)
										}
									>
										<SelectTrigger className="w-[150px]">
											<SelectValue placeholder="All Types" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Types</SelectItem>
											<SelectItem value="CREATED">Created</SelectItem>
											<SelectItem value="ADJUSTED_ADD">Added</SelectItem>
											<SelectItem value="ADJUSTED_SUBTRACT">
												Subtracted
											</SelectItem>
											<SelectItem value="TRANSFER_FROM">
												Transfer Out
											</SelectItem>
											<SelectItem value="TRANSFER_TO">Transfer In</SelectItem>
										</SelectContent>
									</Select>
									<Select
										value={dateRange}
										onValueChange={setDateRange}
									>
										<SelectTrigger className="w-[150px]">
											<SelectValue placeholder="Time Period" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Time</SelectItem>
											<SelectItem value="today">Today</SelectItem>
											<SelectItem value="week">This Week</SelectItem>
											<SelectItem value="month">This Month</SelectItem>
											<SelectItem value="quarter">This Quarter</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>
						</CardHeader>
						<CardContent className="flex-grow overflow-hidden min-h-0">
							<div className="h-full overflow-y-auto">
								{filteredHistoryData && filteredHistoryData.length > 0 ? (
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Timestamp</TableHead>
												<TableHead>Operation</TableHead>
												<TableHead>Product</TableHead>
												<TableHead>Location</TableHead>
												<TableHead>User</TableHead>
												<TableHead className="text-right">Change</TableHead>
												<TableHead className="text-right">New Qty</TableHead>
												<TableHead>Reason</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{filteredHistoryData.map((entry) => {
												const operationInfo = getOperationTypeInfo(
													entry.operation_type
												);
												const Icon = operationInfo.icon;

												return (
													<TableRow key={entry.id}>
														<TableCell className="text-sm">
															<div className="flex items-center gap-2">
																<Calendar className="h-4 w-4 text-muted-foreground" />
																{formatTimestamp(entry.timestamp)}
															</div>
														</TableCell>
														<TableCell>
															<Badge className={operationInfo.color}>
																<Icon className="h-3 w-3 mr-1" />
																{operationInfo.label}
															</Badge>
														</TableCell>
														<TableCell className="font-medium">
															<div className="flex items-center gap-2">
																<Package className="h-4 w-4 text-muted-foreground" />
																{entry.product.name}
															</div>
														</TableCell>
														<TableCell>
															<div className="flex items-center gap-2">
																<MapPin className="h-4 w-4 text-muted-foreground" />
																{entry.location.name}
															</div>
														</TableCell>
														<TableCell>
															<div className="flex items-center gap-2">
																<User className="h-4 w-4 text-muted-foreground" />
																{entry.user
																	? `${entry.user.first_name} ${entry.user.last_name}`
																	: "System"}
															</div>
														</TableCell>
														<TableCell className="text-right font-mono">
															<span
																className={
																	entry.quantity_change >= 0
																		? "text-green-600"
																		: "text-red-600"
																}
															>
																{formatQuantityChange(
																	entry.quantity_change,
																	entry.operation_type
																)}
															</span>
														</TableCell>
														<TableCell className="text-right font-mono">
															{entry.new_quantity}
														</TableCell>
														<TableCell>
															<ReasonBadge
																entry={entry}
																onFilterByReferenceId={(referenceId) =>
																	setSearchQuery(referenceId)
																}
															/>
														</TableCell>
													</TableRow>
												);
											})}
										</TableBody>
									</Table>
								) : (
									<div className="flex flex-col items-center justify-center h-full text-center py-10">
										<History className="h-12 w-12 text-muted-foreground" />
										<h3 className="mt-4 text-lg font-semibold">
											No stock history found
										</h3>
										<p className="mt-2 text-sm text-muted-foreground">
											No stock operations have been recorded yet, or try
											adjusting your filters.
										</p>
									</div>
								)}
							</div>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	);
};
