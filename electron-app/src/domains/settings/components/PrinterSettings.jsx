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
} from "../services/printerSettingsService";
import { useSettingsStore } from "@/domains/settings/store/settingsStore";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/shared/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Badge } from "@/shared/components/ui/badge";
import {
	PlusCircle,
	Edit,
	Trash2,
	Printer as PrinterIcon,
	Usb,
	Wifi,
	CheckCircle,
} from "lucide-react";
import { useToast } from "@/shared/components/ui/use-toast";
import { AddEditPrinterDialog } from "./AddEditPrinterDialog";
import { AddEditKitchenZoneDialog } from "./AddEditKitchenZoneDialog";

export function PrinterSettings() {
	const [isPrinterDialogOpen, setIsPrinterDialogOpen] = useState(false);
	const [isZoneDialogOpen, setIsZoneDialogOpen] = useState(false);
	const [selectedPrinter, setSelectedPrinter] = useState(null);
	const [selectedZone, setSelectedZone] = useState(null);
	const [isScanning, setIsScanning] = useState(false);

	const queryClient = useQueryClient();
	const { toast } = useToast();

	// Local USB printer settings
	const localPrinters = useSettingsStore((state) => state.printers);
	const receiptPrinterId = useSettingsStore((state) => state.receiptPrinterId);
	const setReceiptPrinterId = useSettingsStore(
		(state) => state.setReceiptPrinterId
	);
	const discoverAndSetPrinters = useSettingsStore(
		(state) => state.discoverAndSetPrinters
	);

	// Fetch network printers (kitchen only from backend)
	const {
		data: printers = [],
		isLoading: printersLoading,
		isError: printersError,
	} = useQuery({
		queryKey: ["printers"],
		queryFn: getPrinters,
	});

	// Fetch kitchen zones
	const {
		data: kitchenZones = [],
		isLoading: zonesLoading,
		isError: zonesError,
	} = useQuery({
		queryKey: ["kitchenZones"],
		queryFn: getKitchenZones,
	});

	// Filter kitchen printers only
	const kitchenPrinters = useMemo(
		() => printers.filter((p) => p.printer_type === "kitchen"),
		[printers]
	);

	// All available receipt printers (local USB + network from backend)
	const allReceiptPrinters = useMemo(() => {
		const networkReceiptPrinters = printers
			.filter((p) => p.printer_type === "receipt")
			.map((p) => ({
				...p,
				connectionType: "network",
			}));
		return [...(localPrinters || []), ...networkReceiptPrinters];
	}, [localPrinters, printers]);

	// Mutations for printers
	const createPrinterMutation = useMutation({
		mutationFn: createPrinter,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["printers"] });
			toast({
				title: "Success!",
				description: "Printer created successfully!",
			});
			setIsPrinterDialogOpen(false);
		},
		onError: (error) => {
			toast({
				title: "Failed",
				description: `Failed to create printer: ${error.message}`,
				variant: "destructive",
			});
		},
	});

	const updatePrinterMutation = useMutation({
		mutationFn: ({ id, data }) => updatePrinter(id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["printers"] });
			toast({
				title: "Success!",
				description: "Printer updated successfully!",
			});
			setIsPrinterDialogOpen(false);
		},
		onError: (error) => {
			toast({
				title: "Failed",
				description: `Failed to update printer: ${error.message}`,
				variant: "destructive",
			});
		},
	});

	const deletePrinterMutation = useMutation({
		mutationFn: deletePrinter,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["printers"] });
			queryClient.invalidateQueries({ queryKey: ["kitchenZones"] });
			toast({
				title: "Success!",
				description: "Printer deleted successfully!",
			});
		},
		onError: (error) => {
			toast({
				title: "Failed",
				description: `Failed to delete printer: ${error.message}`,
				variant: "destructive",
			});
		},
	});

	// Mutations for kitchen zones
	const createZoneMutation = useMutation({
		mutationFn: createKitchenZone,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["kitchenZones"] });
			toast({
				title: "Success!",
				description: "Kitchen zone created successfully!",
			});
			setIsZoneDialogOpen(false);
		},
		onError: (error) => {
			toast({
				title: "Failed",
				description: `Failed to create kitchen zone: ${error.message}`,
				variant: "destructive",
			});
		},
	});

	const updateZoneMutation = useMutation({
		mutationFn: ({ id, data }) => updateKitchenZone(id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["kitchenZones"] });
			toast({
				title: "Success!",
				description: "Kitchen zone updated successfully!",
			});
			setIsZoneDialogOpen(false);
		},
		onError: (error) => {
			toast({
				title: "Failed",
				description: `Failed to update kitchen zone: ${error.message}`,
				variant: "destructive",
			});
		},
	});

	const deleteZoneMutation = useMutation({
		mutationFn: deleteKitchenZone,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["kitchenZones"] });
			toast({
				title: "Success!",
				description: "Kitchen zone deleted successfully!",
			});
		},
		onError: (error) => {
			toast({
				title: "Failed",
				description: `Failed to delete kitchen zone: ${error.message}`,
				variant: "destructive",
			});
		},
	});

	// Handlers
	const handleSavePrinter = (printerData) => {
		if (selectedPrinter?.id) {
			updatePrinterMutation.mutate({
				id: selectedPrinter.id,
				data: printerData,
			});
		} else {
			createPrinterMutation.mutate(printerData);
		}
	};

	const handleDeletePrinter = (printer) => {
		if (confirm(`Are you sure you want to delete "${printer.name}"?`)) {
			deletePrinterMutation.mutate(printer.id);
		}
	};

	const handleSaveZone = (zoneData) => {
		if (selectedZone?.id) {
			updateZoneMutation.mutate({
				id: selectedZone.id,
				data: zoneData,
			});
		} else {
			createZoneMutation.mutate(zoneData);
		}
	};

	const handleDeleteZone = (zone) => {
		if (confirm(`Are you sure you want to delete "${zone.name}"?`)) {
			deleteZoneMutation.mutate(zone.id);
		}
	};

	const handleTestPrinter = async (printer) => {
		toast({
			title: "Testing Connection",
			description: `Pinging printer at ${printer.ip_address}...`,
		});

		try {
			const result = await window.hardwareApi.invoke("test-network-printer", {
				ip_address: printer.ip_address,
				port: printer.port,
			});

			if (result.success) {
				toast({
					title: "Connection Successful!",
					description: result.message || "Printer is reachable",
				});
			} else {
				toast({
					title: "Connection Failed",
					description: result.error || "Could not reach printer",
					variant: "destructive",
				});
			}
		} catch (error) {
			toast({
				title: "Test Failed",
				description: error.message,
				variant: "destructive",
			});
			console.error("Error testing printer:", error);
		}
	};

	const handleScanPrinters = async () => {
		setIsScanning(true);
		toast({
			title: "Scanning for local USB printers",
			description: "Please wait while we scan for local USB printers...",
		});
		try {
			const scannedPrinters = await discoverAndSetPrinters();
			if (scannedPrinters.length > 0) {
				toast({
					title: "Printers Found",
					description: `Found ${scannedPrinters.length} local printer(s).`,
				});
			} else {
				toast({
					title: "No New Printers Found",
					description: "No new local USB printers were found on this scan.",
				});
			}
		} catch (error) {
			toast({
				title: "Failed to scan for printers",
				description: error.message,
				variant: "destructive",
			});
			console.error(error);
		} finally {
			setIsScanning(false);
		}
	};

	if (printersLoading && zonesLoading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Wifi className="h-5 w-5" />
						Printer & Kitchen Settings
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-center py-8">
						<div className="text-center">
							<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
							<p className="mt-2 text-sm text-muted-foreground">
								Loading printer settings...
							</p>
						</div>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-6">
			{/* USB Receipt Printer Section */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Usb className="h-5 w-5" />
						Local USB Receipt Printer
					</CardTitle>
					<CardDescription>
						Select a local USB printer for printing customer receipts at this
						terminal.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 md:grid-cols-2">
					<div className="flex flex-col space-y-2">
						<label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
							Selected Receipt Printer
						</label>
						<Select
							value={receiptPrinterId || "none"}
							onValueChange={(value) =>
								setReceiptPrinterId(value === "none" ? null : value)
							}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select a printer" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">None</SelectItem>
								{allReceiptPrinters.map((p) => (
									<SelectItem key={p.id || p.name} value={p.id || p.name}>
										<div className="flex items-center gap-2">
											{p.connectionType === "network" ? (
												<Wifi className="h-4 w-4" />
											) : (
												<Usb className="h-4 w-4" />
											)}
											{p.name}
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="flex items-end">
						<Button
							onClick={handleScanPrinters}
							disabled={isScanning}
							variant="outline"
						>
							{isScanning ? "Scanning..." : "Scan for USB Printers"}
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Network Kitchen Printers & Zones */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<PrinterIcon className="h-5 w-5" />
						Network Kitchen Printers & Zones
					</CardTitle>
					<CardDescription>
						Manage network kitchen printers and configure zones for order routing.
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
											Network printers located in the kitchen for printing order
											tickets
										</p>
									</div>
									<Button
										size="sm"
										onClick={() => {
											setSelectedPrinter(null);
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
												onTest={handleTestPrinter}
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
									Kitchen zones route specific items to designated printers based
									on categories
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
function PrinterCard({ printer, onEdit, onDelete, onTest }) {
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
							<Badge
								variant="outline"
								className="bg-green-50 text-green-700 border-green-200"
							>
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
				<Button variant="secondary" size="sm" onClick={() => onTest(printer)}>
					Test
				</Button>
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
function KitchenZoneCard({ zone, onEdit, onDelete }) {
	const categoryCount = zone.print_all_items
		? "ALL"
		: zone.category_ids?.length || 0;

	return (
		<div className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors">
			<div className="flex-1">
				<div className="flex items-center gap-2 mb-1">
					<p className="font-medium">{zone.name}</p>
					{zone.is_active ? (
						<Badge
							variant="outline"
							className="bg-green-50 text-green-700 border-green-200"
						>
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
