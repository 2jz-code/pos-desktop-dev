import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
	getPrinterConfig,
	updatePrinterConfig,
} from "@/services/api/settingsService";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { PlusCircle, Edit, Trash2, Wifi } from "lucide-react";
import { toast } from "sonner";
import { AddEditPrinterDialog } from "./AddEditPrinterDialog";
import { AddEditKitchenZoneDialog } from "./AddEditKitchenZoneDialog";
import type { Printer, Zone, PrinterConfig } from "@/types";

export function PrinterSettings() {
	const [isPrinterDialogOpen, setIsPrinterDialogOpen] = useState(false);
	const [isZoneDialogOpen, setIsZoneDialogOpen] = useState(false);
	const [selectedPrinter, setSelectedPrinter] = useState<Printer | null>(null);
	const [selectedZone, setSelectedZone] = useState<Zone | null>(null);

	const queryClient = useQueryClient();

	const {
		data: config,
		isLoading,
		isError,
		error,
	} = useQuery<PrinterConfig, Error>({
		queryKey: ["printerConfig"],
		queryFn: getPrinterConfig,
	});

	const mutation = useMutation<void, Error, Partial<PrinterConfig>>({
		mutationFn: updatePrinterConfig,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["printerConfig"] });
			toast.success("Printer configuration updated successfully!");
		},
		onError: (error) => {
			toast.error(`Failed to update printer config: ${error.message}`);
		},
	});

	const handleSavePrinter = (printerData: Omit<Printer, "id">) => {
		if (!config) return;
		let updatedPrinters: Printer[];
		if (selectedPrinter) {
			// Update existing printer
			updatedPrinters = config.kitchen_printers.map((p) =>
				p.id === selectedPrinter.id ? { ...selectedPrinter, ...printerData } : p
			);
		} else {
			// Add new printer
			const newPrinter: Printer = {
				id: Date.now(), // Temporary ID
				...printerData,
			};
			updatedPrinters = [...config.kitchen_printers, newPrinter];
		}
		mutation.mutate({ ...config, kitchen_printers: updatedPrinters });
	};

	const handleDeletePrinter = (printerToDelele: Printer) => {
		if (!config) return;
		const updatedPrinters = config.kitchen_printers.filter(
			(p) => p.id !== printerToDelele.id
		);
		mutation.mutate({ ...config, kitchen_printers: updatedPrinters });
	};

	const handleSaveZone = (zoneData: Partial<Zone>) => {
		if (!config) return;
		let updatedZones: Zone[];
		if (selectedZone) {
			// Update existing zone
			updatedZones = config.kitchen_zones.map((z) =>
				z.id === selectedZone.id ? { ...selectedZone, ...zoneData } : z
			) as Zone[];
		} else {
			// Add new zone
			const newZone = {
				id: Date.now(), // Temporary ID
				name: "",
				printerId: 0,
				categories: [],
				...zoneData,
			};
			updatedZones = [...config.kitchen_zones, newZone];
		}
		mutation.mutate({ ...config, kitchen_zones: updatedZones });
	};

	const handleDeleteZone = (zoneToDelete: Zone) => {
		if (!config) return;
		const updatedZones = config.kitchen_zones.filter(
			(z) => z.id !== zoneToDelete.id
		);
		mutation.mutate({ ...config, kitchen_zones: updatedZones });
	};

	if (isLoading) return <div>Loading...</div>;
	if (isError) return <div>Error: {error.message}</div>;

	return (
		<div className="space-y-8">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Wifi className="h-5 w-5" />
						Network Printers & Kitchen Zones
					</CardTitle>
					<CardDescription>
						Manage network printers for receipts and kitchen tickets. This is a
						global setting.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					<div>
						<h3 className="text-lg font-medium mb-2">Kitchen Printers</h3>
						<div className="space-y-4">
							{config?.kitchen_printers?.map((printer) => (
								<div
									key={printer.id}
									className="flex items-center justify-between p-4 border rounded-md"
								>
									<div>
										<p className="font-medium">{printer.name}</p>
										<p className="text-sm text-muted-foreground">
											{printer.ip_address}
										</p>
									</div>
									<div className="flex items-center gap-2">
										<Button
											variant="outline"
											size="sm"
											onClick={() => {
												setSelectedPrinter(printer);
												setIsPrinterDialogOpen(true);
											}}
										>
											<Edit className="mr-2 h-4 w-4" /> Edit
										</Button>
										<Button
											variant="destructive"
											size="sm"
											onClick={() => handleDeletePrinter(printer)}
										>
											<Trash2 className="mr-2 h-4 w-4" /> Delete
										</Button>
									</div>
								</div>
							))}
							<Button
								variant="outline"
								onClick={() => {
									setSelectedPrinter(null);
									setIsPrinterDialogOpen(true);
								}}
							>
								<PlusCircle className="mr-2 h-4 w-4" />
								Add Kitchen Printer
							</Button>
						</div>
					</div>
					<div>
						<h3 className="text-lg font-medium mb-2">Kitchen Zones</h3>
						<div className="space-y-4">
							{config?.kitchen_zones?.map((zone) => (
								<div
									key={zone.id}
									className="flex items-center justify-between p-4 border rounded-md"
								>
									<div>
										<p className="font-medium">{zone.name}</p>
										<p className="text-sm text-muted-foreground">
											Printer:{" "}
											{config.kitchen_printers.find(
												(p) => p.id === zone.printerId
											)?.name || "N/A"}
										</p>
									</div>
									<div className="flex items-center gap-2">
										<Button
											variant="outline"
											size="sm"
											onClick={() => {
												setSelectedZone(zone);
												setIsZoneDialogOpen(true);
											}}
										>
											<Edit className="mr-2 h-4 w-4" /> Edit
										</Button>
										<Button
											variant="destructive"
											size="sm"
											onClick={() => handleDeleteZone(zone)}
										>
											<Trash2 className="mr-2 h-4 w-4" /> Delete
										</Button>
									</div>
								</div>
							))}
							<Button
								variant="outline"
								onClick={() => {
									setSelectedZone(null);
									setIsZoneDialogOpen(true);
								}}
							>
								<PlusCircle className="mr-2 h-4 w-4" />
								Add Kitchen Zone
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>

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
				printers={config?.kitchen_printers || []}
			/>
		</div>
	);
}
