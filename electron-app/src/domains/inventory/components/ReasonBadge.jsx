import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/shared/components/ui/dialog";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/shared/components/ui/table";
import { Separator } from "@/shared/components/ui/separator";
import {
	Settings,
	User,
	ArrowUpDown,
	AlertTriangle,
	Package,
	Trash2,
	Plus,
	Archive,
	MoreHorizontal,
	Calendar,
	MapPin,
	Clock,
	Link2,
	RefreshCw,
	Shield,
} from "lucide-react";
import inventoryService from "../services/inventoryService";

const getCategoryIcon = (category) => {
	const icons = {
		SYSTEM: Settings,
		MANUAL: User,
		TRANSFER: ArrowUpDown,
		CORRECTION: AlertTriangle,
		INVENTORY: Package,
		WASTE: Trash2,
		RESTOCK: Plus,
		BULK: Archive,
		OTHER: MoreHorizontal,
	};
	return icons[category] || MoreHorizontal;
};

const getCategoryColorClasses = (color) => {
	const colorMap = {
		gray: "bg-gray-100 text-gray-800 hover:bg-gray-200",
		blue: "bg-blue-100 text-blue-800 hover:bg-blue-200",
		purple: "bg-purple-100 text-purple-800 hover:bg-purple-200",
		orange: "bg-orange-100 text-orange-800 hover:bg-orange-200",
		green: "bg-green-100 text-green-800 hover:bg-green-200",
		red: "bg-red-100 text-red-800 hover:bg-red-200",
		emerald: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200",
		indigo: "bg-indigo-100 text-indigo-800 hover:bg-indigo-200",
		slate: "bg-slate-100 text-slate-800 hover:bg-slate-200",
	};
	return colorMap[color] || colorMap.slate;
};

const getCategoryColorFromName = (categoryName) => {
	const categoryColors = {
		SYSTEM: "gray",
		MANUAL: "blue", 
		TRANSFER: "purple",
		CORRECTION: "orange",
		INVENTORY: "green",
		WASTE: "red",
		RESTOCK: "emerald",
		BULK: "indigo",
		OTHER: "slate",
	};
	return categoryColors[categoryName] || "slate";
};

const formatTimestamp = (timestamp) => {
	return new Date(timestamp).toLocaleString();
};

const formatQuantityChange = (change) => {
	const sign = change >= 0 ? "+" : "";
	return `${sign}${change}`;
};

export const ReasonBadge = ({
	entry,
	showTooltip = true,
	showModal = true,
	onFilterByReferenceId,
}) => {
	const [modalOpen, setModalOpen] = useState(false);
	
	// Determine if this is a new structured reason or legacy reason
	const isStructuredReason = entry.reason_config != null;
	
	// Extract display information based on reason type
	const reasonCategory = isStructuredReason ? entry.reason_config.category : entry.reason_category;
	const reasonName = isStructuredReason ? entry.reason_config.name : entry.reason_category_display.label;
	const reasonDescription = isStructuredReason ? entry.reason_config.category_display : entry.reason_category_display.description;
	const reasonColor = isStructuredReason ? getCategoryColorFromName(reasonCategory) : entry.reason_category_display.color;
	
	const Icon = getCategoryIcon(reasonCategory);
	const colorClasses = getCategoryColorClasses(reasonColor);
	
	// For structured reasons, use the full reason display; for legacy, use the old logic
	const fullReason = isStructuredReason 
		? (entry.get_full_reason || entry.detailed_reason || entry.reason_config.name)
		: (entry.reason || entry.notes || "No reason provided");
	
	const displayText = isStructuredReason 
		? entry.reason_config.name
		: (entry.truncated_reason || entry.reason_category_display.label);

	// Fetch related operations when modal opens and there's a reference_id
	const { data: relatedOperations, isLoading: relatedLoading } = useQuery({
		queryKey: ["related-stock-operations", entry.reference_id],
		queryFn: () => inventoryService.getRelatedStockOperations(entry.reference_id),
		enabled: modalOpen && !!entry.reference_id,
	});

	const badgeContent = (
		<Badge 
			className={`${colorClasses} cursor-pointer transition-colors inline-flex items-center gap-1.5`}
			onClick={showModal ? () => setModalOpen(true) : undefined}
		>
			<Icon className="h-3 w-3" />
			<span className="font-medium">{reasonName}</span>
			{isStructuredReason && entry.reason_config?.is_system_reason && (
				<Shield className="h-3 w-3 opacity-70" />
			)}
			{!isStructuredReason && entry.truncated_reason && (
				<span className="text-xs opacity-80">
					{entry.truncated_reason}
				</span>
			)}
		</Badge>
	);

	const tooltipContent = showTooltip ? (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					{badgeContent}
				</TooltipTrigger>
				<TooltipContent side="top" className="max-w-xs">
					<div className="space-y-1">
						<div className="flex items-center gap-2">
							<p className="font-medium">{reasonName}</p>
							{isStructuredReason && entry.reason_config?.is_system_reason && (
								<Badge variant="secondary" className="text-xs">System</Badge>
							)}
						</div>
						<p className="text-sm opacity-90">{reasonDescription}</p>
						{isStructuredReason && entry.detailed_reason && (
							<div className="pt-1 border-t border-white/20">
								<p className="text-xs font-medium opacity-80">Details:</p>
								<p className="text-xs opacity-90">{entry.detailed_reason}</p>
							</div>
						)}
						{!isStructuredReason && fullReason !== "No reason provided" && (
							<p className="text-sm opacity-90">{fullReason}</p>
						)}
					</div>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	) : badgeContent;

	if (!showModal) {
		return tooltipContent;
	}

	return (
		<Dialog open={modalOpen} onOpenChange={setModalOpen}>
			<DialogTrigger asChild>
				{tooltipContent}
			</DialogTrigger>
			<DialogContent className="max-w-6xl sm:max-w-6xl max-h-[90vh] flex flex-col">
				<DialogHeader className="flex-shrink-0">
					<DialogTitle className="flex items-center gap-2">
						<Package className="h-5 w-5" />
						Stock Operation Details
					</DialogTitle>
					<DialogDescription>
						Complete information about this stock operation
					</DialogDescription>
				</DialogHeader>
				
				<div className="flex-1 overflow-y-auto space-y-6 pr-2">
					{/* Operation Summary */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div className="space-y-2">
							<label className="text-sm font-medium text-muted-foreground">Operation Type</label>
							<div className="flex items-center gap-2 flex-wrap">
								<Badge className={getCategoryColorClasses(entry.reason_category_display.color)}>
									<Icon className="h-3 w-3 mr-1" />
									{entry.operation_display}
								</Badge>
							</div>
						</div>
						<div className="space-y-2">
							<label className="text-sm font-medium text-muted-foreground">Category</label>
							<div className="flex items-center gap-2 flex-wrap">
								<Badge variant="outline">
									{entry.reason_category_display.label}
								</Badge>
								<span className="text-sm text-muted-foreground break-words">
									{entry.reason_category_display.description}
								</span>
							</div>
						</div>
					</div>

					{/* Product & Location */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div className="space-y-2">
							<label className="text-sm font-medium text-muted-foreground">Product</label>
							<div className="flex items-center gap-2 flex-wrap">
								<Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
								<span className="font-medium break-words min-w-0">{entry.product.name}</span>
							</div>
							{entry.product.barcode && (
								<p className="text-sm text-muted-foreground ml-6 break-all">
									Barcode: {entry.product.barcode}
								</p>
							)}
						</div>
						<div className="space-y-2">
							<label className="text-sm font-medium text-muted-foreground">Location</label>
							<div className="flex items-center gap-2 flex-wrap">
								<MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
								<span className="font-medium break-words min-w-0">{entry.location.name}</span>
							</div>
						</div>
					</div>

					{/* Quantity Changes */}
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
						<div className="space-y-2">
							<label className="text-sm font-medium text-muted-foreground">Previous Quantity</label>
							<div className="text-lg font-mono break-all">{entry.previous_quantity}</div>
						</div>
						<div className="space-y-2">
							<label className="text-sm font-medium text-muted-foreground">Change</label>
							<div className={`text-lg font-mono break-all ${
								entry.quantity_change >= 0 ? 'text-green-600' : 'text-red-600'
							}`}>
								{formatQuantityChange(entry.quantity_change)}
							</div>
						</div>
						<div className="space-y-2">
							<label className="text-sm font-medium text-muted-foreground">New Quantity</label>
							<div className="text-lg font-mono font-semibold break-all">{entry.new_quantity}</div>
						</div>
					</div>

					{/* Reason & Notes */}
					{(entry.reason || entry.notes) && (
						<div className="space-y-4">
							{entry.reason && (
								<div className="space-y-2">
									<label className="text-sm font-medium text-muted-foreground">Reason</label>
									<div className="p-3 bg-muted rounded-md max-h-32 overflow-y-auto">
										<p className="text-sm whitespace-pre-wrap break-words">{entry.reason}</p>
									</div>
								</div>
							)}
							{entry.notes && (
								<div className="space-y-2">
									<label className="text-sm font-medium text-muted-foreground">Notes</label>
									<div className="p-3 bg-muted rounded-md max-h-32 overflow-y-auto">
										<p className="text-sm whitespace-pre-wrap break-words">{entry.notes}</p>
									</div>
								</div>
							)}
						</div>
					)}

					{/* Metadata */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
						<div className="space-y-2">
							<label className="text-sm font-medium text-muted-foreground">Performed By</label>
							<div className="flex items-center gap-2 flex-wrap">
								<User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
								<span className="break-words min-w-0">
									{entry.user 
										? `${entry.user.first_name} ${entry.user.last_name} (${entry.user.username})`
										: 'System'
									}
								</span>
							</div>
						</div>
						<div className="space-y-2">
							<label className="text-sm font-medium text-muted-foreground">Timestamp</label>
							<div className="flex items-center gap-2 flex-wrap">
								<Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
								<span className="break-words min-w-0">{formatTimestamp(entry.timestamp)}</span>
							</div>
						</div>
					</div>

					{entry.reference_id && (
						<div className="space-y-2">
							<label className="text-sm font-medium text-muted-foreground">Reference ID</label>
							<div className="flex items-center gap-2 flex-wrap">
								<Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
								<code className="px-2 py-1 bg-muted rounded text-sm break-all min-w-0">{entry.reference_id}</code>
								{onFilterByReferenceId && (
									<Button
										variant="outline"
										size="sm"
										className="flex-shrink-0"
										onClick={() => {
											onFilterByReferenceId(entry.reference_id);
											setModalOpen(false);
										}}
									>
										Filter by this ID
									</Button>
								)}
							</div>
						</div>
					)}

					{/* Related Operations */}
					{entry.reference_id && (
						<>
							<Separator />
							<div className="space-y-4">
								<div className="flex items-center gap-2">
									<Link2 className="h-5 w-5 text-muted-foreground" />
									<h3 className="text-lg font-semibold">Related Operations</h3>
									{relatedLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
								</div>
								
								{relatedLoading ? (
									<div className="flex items-center justify-center py-4">
										<div className="flex items-center space-x-2">
											<RefreshCw className="h-4 w-4 animate-spin" />
											<span className="text-sm text-muted-foreground">Loading related operations...</span>
										</div>
									</div>
								) : relatedOperations && relatedOperations.operations.length > 1 ? (
									<div className="space-y-2">
										<p className="text-sm text-muted-foreground">
											{relatedOperations.count} operations share this reference ID
										</p>
										<div className="border rounded-md">
											<Table>
												<TableHeader>
													<TableRow>
														<TableHead className="text-xs">Product</TableHead>
														<TableHead className="text-xs">Location</TableHead>
														<TableHead className="text-xs">Operation</TableHead>
														<TableHead className="text-xs text-right">Change</TableHead>
														<TableHead className="text-xs">Time</TableHead>
													</TableRow>
												</TableHeader>
													<TableBody>
														{relatedOperations.operations.map((relatedEntry) => {
															const relatedIcon = getCategoryIcon(relatedEntry.reason_category);
															const RelatedIcon = relatedIcon;
															return (
																<TableRow 
																	key={relatedEntry.id}
																	className={relatedEntry.id === entry.id ? "bg-muted/50" : ""}
																>
																	<TableCell className="text-sm font-medium">
																		{relatedEntry.product.name}
																	</TableCell>
																	<TableCell className="text-sm">
																		{relatedEntry.location.name}
																	</TableCell>
																	<TableCell>
																		<Badge 
																			variant="outline" 
																			className="text-xs"
																		>
																			<RelatedIcon className="h-3 w-3 mr-1" />
																			{relatedEntry.operation_display}
																		</Badge>
																	</TableCell>
																	<TableCell className="text-sm text-right font-mono">
																		<span
																			className={
																				relatedEntry.quantity_change >= 0
																					? "text-green-600"
																					: "text-red-600"
																			}
																		>
																			{formatQuantityChange(relatedEntry.quantity_change)}
																		</span>
																	</TableCell>
																	<TableCell className="text-xs text-muted-foreground">
																		{new Date(relatedEntry.timestamp).toLocaleString()}
																	</TableCell>
																</TableRow>
															);
														})}
													</TableBody>
												</Table>
										</div>
									</div>
								) : (
									<p className="text-sm text-muted-foreground">
										This is the only operation with this reference ID.
									</p>
								)}
							</div>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
};