import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
	getPrinters,
	createPrinter,
	updatePrinter,
	deletePrinter,
	getKitchenZones,
	createKitchenZone,
	updateKitchenZone,
	deleteKitchenZone,
	getStoreLocations,
} from "@/services/api/settingsService";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Edit, Trash2, Printer as PrinterIcon, MapPin, AlertCircle, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { AddEditPrinterDialog } from "./AddEditPrinterDialog";
import { AddEditKitchenZoneDialog } from "./AddEditKitchenZoneDialog";
import type { Printer, KitchenZone } from "@/types";

export function PrinterSettings() {
	const [isPrinterDialogOpen, setIsPrinterDialogOpen] = useState(false);
	const [isZoneDialogOpen, setIsZoneDialogOpen] = useState(false);
	const [selectedPrinter, setSelectedPrinter] = useState<Printer | null>(null);
	const [selectedZone, setSelectedZone] = useState<KitchenZone | null>(null);
	const [selectedLocation, setSelectedLocation] = useState<number | null>(null);

	const queryClient = useQueryClient();

	// Fetch locations
	const { data: locations = [], isLoading: locationsLoading } = useQuery({
		queryKey: ["storeLocations"],
		queryFn: getStoreLocations,
	});

	// Auto-select first location if available
	if (!selectedLocation && locations.length > 0 && !locationsLoading) {
		setSelectedLocation(locations[0].id);
	}

	// Fetch printers for selected location
	const {
		data: printers = [],
		isLoading: printersLoading,
		isError: printersError,
	} = useQuery({
		queryKey: ["printers", selectedLocation],
		queryFn: () => getPrinters(selectedLocation),
		enabled: !!selectedLocation,
	});

	// Fetch kitchen zones for selected location
	const {
		data: kitchenZones = [],
		isLoading: zonesLoading,
		isError: zonesError,
	} = useQuery({
		queryKey: ["kitchenZones", selectedLocation],
		queryFn: () => getKitchenZones(selectedLocation),
		enabled: !!selectedLocation,
	});

	// Filter kitchen printers only (receipt printers are managed in Electron app)
	const kitchenPrinters = useMemo(
		() => printers.filter((p) => p.printer_type === "kitchen"),
		[printers]
	);

	// Mutations for printers
	const createPrinterMutation = useMutation({
		mutationFn: createPrinter,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["printers"] });
			toast.success("Printer created successfully!");
			setIsPrinterDialogOpen(false);
		},
		onError: (error: Error) => {
			toast.error(`Failed to create printer: ${error.message}`);
		},
	});

	const updatePrinterMutation = useMutation({
		mutationFn: ({ id, data }: { id: number; data: Partial<Printer> }) =>
			updatePrinter(id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["printers"] });
			toast.success("Printer updated successfully!");
			setIsPrinterDialogOpen(false);
		},
		onError: (error: Error) => {
			toast.error(`Failed to update printer: ${error.message}`);
		},
	});

	const deletePrinterMutation = useMutation({
		mutationFn: deletePrinter,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["printers"] });
			queryClient.invalidateQueries({ queryKey: ["kitchenZones"] });
			toast.success("Printer deleted successfully!");
		},
		onError: (error: Error) => {
			toast.error(`Failed to delete printer: ${error.message}`);
		},
	});

	// Mutations for kitchen zones
	const createZoneMutation = useMutation({
		mutationFn: createKitchenZone,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["kitchenZones"] });
			toast.success("Kitchen zone created successfully!");
			setIsZoneDialogOpen(false);
		},
		onError: (error: Error) => {
			toast.error(`Failed to create kitchen zone: ${error.message}`);
		},
	});

	const updateZoneMutation = useMutation({
		mutationFn: ({ id, data }: { id: number; data: Partial<KitchenZone> }) =>
			updateKitchenZone(id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["kitchenZones"] });
			toast.success("Kitchen zone updated successfully!");
			setIsZoneDialogOpen(false);
		},
		onError: (error: Error) => {
			toast.error(`Failed to update kitchen zone: ${error.message}`);
		},
	});

	const deleteZoneMutation = useMutation({
		mutationFn: deleteKitchenZone,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["kitchenZones"] });
			toast.success("Kitchen zone deleted successfully!");
		},
		onError: (error: Error) => {
			toast.error(`Failed to delete kitchen zone: ${error.message}`);
		},
	});

	// Handlers
	const handleSavePrinter = (printerData: Partial<Printer>) => {
		if (!selectedLocation) {
			toast.error("Please select a location first");
			return;
		}

		const dataWithLocation = {
			...printerData,
			location: selectedLocation,
		};

		if (selectedPrinter?.id) {
			updatePrinterMutation.mutate({
				id: selectedPrinter.id,
				data: dataWithLocation,
			});
		} else {
			createPrinterMutation.mutate(dataWithLocation as Printer);
		}
	};

	const handleDeletePrinter = (printer: Printer) => {
		if (confirm(`Are you sure you want to delete "${printer.name}"?`)) {
			deletePrinterMutation.mutate(printer.id);
		}
	};

	const handleSaveZone = (zoneData: Partial<KitchenZone>) => {
		if (!selectedLocation) {
			toast.error("Please select a location first");
			return;
		}

		const dataWithLocation = {
			...zoneData,
			location: selectedLocation,
		};

		if (selectedZone?.id) {
			updateZoneMutation.mutate({
				id: selectedZone.id,
				data: dataWithLocation,
			});
		} else {
			createZoneMutation.mutate(dataWithLocation as KitchenZone);
		}
	};

	const handleDeleteZone = (zone: KitchenZone) => {
		if (confirm(`Are you sure you want to delete "${zone.name}"?`)) {
			deleteZoneMutation.mutate(zone.id);
		}
	};

	if (locationsLoading) {
		return (
			<div className="flex items-center justify-center p-8">
				<div className="text-center">
					<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
					<p>Loading locations...</p>
				</div>
			</div>
		);
	}

	if (locations.length === 0) {
		return (
			<Card>
				<CardContent className="p-6">
					<div className="flex items-center gap-2 text-amber-600">
						<AlertCircle className="h-5 w-5" />
						<p>No store locations found. Please create a location first.</p>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-6">
			{/* Location Selector */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<MapPin className="h-5 w-5" />
						Select Location
					</CardTitle>
					<CardDescription>
						Printer configuration is location-specific. Select a location to manage its printers and kitchen zones.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Select
						value={selectedLocation?.toString()}
						onValueChange={(value) => setSelectedLocation(parseInt(value))}
					>
						<SelectTrigger className="w-full max-w-md">
							<SelectValue placeholder="Select a location" />
						</SelectTrigger>
						<SelectContent>
							{locations.map((location: any) => {
								const parts = [location.name];
								if (location.city && location.state) {
									parts.push(`${location.city}, ${location.state}`);
								} else if (location.city) {
									parts.push(location.city);
								} else if (location.state) {
									parts.push(location.state);
								}
								return (
									<SelectItem key={location.id} value={location.id.toString()}>
										{parts.join(" - ")}
									</SelectItem>
								);
							})}
						</SelectContent>
					</Select>
				</CardContent>
			</Card>

			{/* Printers & Kitchen Zones */}
			{selectedLocation && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<PrinterIcon className="h-5 w-5" />
							Kitchen Printers & Zones
						</CardTitle>
						<CardDescription>
							Manage network kitchen printers and configure zones for order routing. Receipt printers are managed directly in the Electron app.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Tabs defaultValue="printers" className="w-full">
							<TabsList className="grid w-full grid-cols-2">
								<TabsTrigger value="printers">
									Kitchen Printers ({kitchenPrinters.length})
								</TabsTrigger>
								<TabsTrigger value="zones">
									Kitchen Zones ({kitchenZones.length})
								</TabsTrigger>
							</TabsList>

							{/* Kitchen Printers Tab */}
							<TabsContent value="printers" className="space-y-6 mt-6">
								<div>
									<div className="flex items-center justify-between mb-4">
										<div>
											<h3 className="text-lg font-semibold">Kitchen Printers</h3>
											<p className="text-sm text-muted-foreground">
												Network printers located in the kitchen for printing order tickets
											</p>
										</div>
										<Button
											size="sm"
											onClick={() => {
												setSelectedPrinter({ printer_type: "kitchen" } as Printer);
												setIsPrinterDialogOpen(true);
											}}
										>
											<PlusCircle className="mr-2 h-4 w-4" />
											Add Kitchen Printer
										</Button>
									</div>
									<div className="space-y-3">
										{printersLoading ? (
											<p className="text-sm text-muted-foreground">Loading...</p>
										) : kitchenPrinters.length === 0 ? (
											<p className="text-sm text-muted-foreground">
												No kitchen printers configured
											</p>
										) : (
											kitchenPrinters.map((printer) => (
												<PrinterCard
													key={printer.id}
													printer={printer}
													onEdit={() => {
														setSelectedPrinter(printer);
														setIsPrinterDialogOpen(true);
													}}
													onDelete={() => handleDeletePrinter(printer)}
												/>
											))
										)}
									</div>
								</div>
							</TabsContent>

							{/* Kitchen Zones Tab */}
							<TabsContent value="zones" className="space-y-4 mt-6">
								<div className="flex items-center justify-between">
									<p className="text-sm text-muted-foreground">
										Kitchen zones route specific items to designated printers based on categories
									</p>
									<Button
										size="sm"
										onClick={() => {
											setSelectedZone(null);
											setIsZoneDialogOpen(true);
										}}
									>
										<PlusCircle className="mr-2 h-4 w-4" />
										Add Kitchen Zone
									</Button>
								</div>
								<div className="space-y-3">
									{zonesLoading ? (
										<p className="text-sm text-muted-foreground">Loading...</p>
									) : kitchenZones.length === 0 ? (
										<p className="text-sm text-muted-foreground">
											No kitchen zones configured
										</p>
									) : (
										kitchenZones.map((zone) => (
											<KitchenZoneCard
												key={zone.id}
												zone={zone}
												onEdit={() => {
													setSelectedZone(zone);
													setIsZoneDialogOpen(true);
												}}
												onDelete={() => handleDeleteZone(zone)}
											/>
										))
									)}
								</div>
							</TabsContent>
						</Tabs>
					</CardContent>
				</Card>
			)}

			{/* Dialogs */}
			<AddEditPrinterDialog
				isOpen={isPrinterDialogOpen}
				onOpenChange={setIsPrinterDialogOpen}
				onSave={handleSavePrinter}
				printer={selectedPrinter}
			/>

			<AddEditKitchenZoneDialog
				isOpen={isZoneDialogOpen}
				onOpenChange={setIsZoneDialogOpen}
				onSave={handleSaveZone}
				zone={selectedZone}
				printers={kitchenPrinters}
			/>
		</div>
	);
}

// Printer Card Component
function PrinterCard({
	printer,
	onEdit,
	onDelete,
}: {
	printer: Printer;
	onEdit: () => void;
	onDelete: () => void;
}) {
	return (
		<div className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors">
			<div className="flex items-center gap-4">
				<div className="p-2 bg-primary/10 rounded-md">
					<PrinterIcon className="h-5 w-5 text-primary" />
				</div>
				<div>
					<div className="flex items-center gap-2">
						<p className="font-medium">{printer.name}</p>
						{printer.is_active ? (
							<Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
								<CheckCircle className="h-3 w-3 mr-1" />
								Active
							</Badge>
						) : (
							<Badge variant="outline" className="bg-gray-50 text-gray-700">
								Inactive
							</Badge>
						)}
					</div>
					<p className="text-sm text-muted-foreground">
						{printer.ip_address}:{printer.port}
					</p>
				</div>
			</div>
			<div className="flex items-center gap-2">
				<Button variant="outline" size="sm" onClick={onEdit}>
					<Edit className="h-4 w-4" />
				</Button>
				<Button variant="destructive" size="sm" onClick={onDelete}>
					<Trash2 className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}

// Kitchen Zone Card Component
function KitchenZoneCard({
	zone,
	onEdit,
	onDelete,
}: {
	zone: KitchenZone;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const categoryCount = zone.print_all_items ? "ALL" : zone.category_ids.length;

	return (
		<div className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors">
			<div className="flex-1">
				<div className="flex items-center gap-2 mb-1">
					<p className="font-medium">{zone.name}</p>
					{zone.is_active ? (
						<Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
							<CheckCircle className="h-3 w-3 mr-1" />
							Active
						</Badge>
					) : (
						<Badge variant="outline" className="bg-gray-50 text-gray-700">
							Inactive
						</Badge>
					)}
				</div>
				<div className="text-sm text-muted-foreground space-y-1">
					<p>Printer: {zone.printer_details?.name || `ID ${zone.printer}`}</p>
					<p>Categories: {categoryCount}</p>
				</div>
			</div>
			<div className="flex items-center gap-2">
				<Button variant="outline" size="sm" onClick={onEdit}>
					<Edit className="h-4 w-4" />
				</Button>
				<Button variant="destructive" size="sm" onClick={onDelete}>
					<Trash2 className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}
