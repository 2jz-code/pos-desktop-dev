import React, { useState } from "react";
import { useSettingsStore } from "@/store/settingsStore";
import { AddEditPrinterDialog } from "./AddEditPrinterDialog";
import { AddEditKitchenZoneDialog } from "./AddEditKitchenZoneDialog"; // Import the new dialog
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { discoverPrinters } from "@/lib/hardware/printerService";

const PrinterSettings = () => {
	const {
		printers,
		addPrinter,
		updatePrinter,
		removePrinter,
		receiptPrinterId,
		setReceiptPrinterId,
		kitchenZones,
		addKitchenZone,
		updateKitchenZone,
		removeKitchenZone,
	} = useSettingsStore();

	const [isPrinterDialogOpen, setIsPrinterDialogOpen] = useState(false);
	const [editingPrinter, setEditingPrinter] = useState(null);
	const [isZoneDialogOpen, setIsZoneDialogOpen] = useState(false);
	const [editingZone, setEditingZone] = useState(null);

	const handleSavePrinter = (formData) => {
		if (editingPrinter) {
			updatePrinter(editingPrinter.id, formData);
			toast({ title: "Success", description: "Printer updated." });
		} else {
			addPrinter(formData);
			toast({ title: "Success", description: "New printer added." });
		}
		setEditingPrinter(null);
	};

	const handleSaveZone = (formData) => {
		if (editingZone) {
			updateKitchenZone(editingZone.id, formData);
			toast({ title: "Success", description: "Zone updated." });
		} else {
			addKitchenZone(formData);
			toast({ title: "Success", description: "New kitchen zone added." });
		}
		setEditingZone(null);
	};

	const handleEditPrinter = (printer) => {
		setEditingPrinter(printer);
		setIsPrinterDialogOpen(true);
	};

	const handleAddNewPrinter = () => {
		setEditingPrinter(null);
		setIsPrinterDialogOpen(true);
	};

	const handleEditZone = (zone) => {
		setEditingZone(zone);
		setIsZoneDialogOpen(true);
	};

	const handleAddNewZone = () => {
		setEditingZone(null);
		setIsZoneDialogOpen(true);
	};

	const handleDiscover = async () => {
		try {
			const foundPrinters = await discoverPrinters();
			if (!foundPrinters || foundPrinters.length === 0) {
				toast({ title: "No USB Printers Found", variant: "destructive" });
				return;
			}
			let newPrintersAddedCount = 0;
			const configuredPrinters = useSettingsStore.getState().printers;
			foundPrinters.forEach((foundPrinter) => {
				const alreadyExists = configuredPrinters.some(
					(p) =>
						p.vendor_id == foundPrinter.vendorId &&
						p.product_id == foundPrinter.productId
				);
				if (!alreadyExists) {
					addPrinter({
						name:
							foundPrinter.name ||
							`USB Printer ${foundPrinter.vendorId}/${foundPrinter.productId}`,
						connection_type: "usb",
						vendor_id: String(foundPrinter.vendorId),
						product_id: String(foundPrinter.productId),
						ip_address: "",
					});
					newPrintersAddedCount++;
				}
			});
			if (newPrintersAddedCount > 0) {
				toast({
					title: "Printers Added",
					description: `${newPrintersAddedCount} new USB printer(s) added.`,
				});
			} else {
				toast({
					title: "Printers Discovered",
					description: "All found USB printers are already configured.",
				});
			}
		} catch (error) {
			toast({
				title: "Discovery Error",
				description: error.message,
				variant: "destructive",
			});
		}
	};

	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Printer & Hardware Management</CardTitle>
					<CardDescription>
						Add, edit, and assign your receipt and kitchen printers.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-8">
					{/* Receipt Printer Assignment */}
					<div className="grid w-full max-w-sm items-center gap-1.5">
						<Label htmlFor="receipt-printer">Receipt Printer</Label>
						<Select
							value={receiptPrinterId || ""}
							onValueChange={setReceiptPrinterId}
						>
							<SelectTrigger id="receipt-printer">
								<SelectValue placeholder="Select a receipt printer" />
							</SelectTrigger>
							<SelectContent>
								{printers.map((p) => (
									<SelectItem
										key={p.id}
										value={p.id}
									>
										{p.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Kitchen Zones */}
					<div>
						<h3 className="text-lg font-medium mb-2">Kitchen Printer Zones</h3>
						<div className="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Zone Name</TableHead>
										<TableHead>Assigned Printer</TableHead>
										<TableHead className="text-right">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{kitchenZones.length > 0 ? (
										kitchenZones.map((zone) => {
											const printer = printers.find(
												(p) => p.id === zone.printerId
											);
											return (
												<TableRow key={zone.id}>
													<TableCell>{zone.name}</TableCell>
													<TableCell>
														{printer ? printer.name : "None"}
													</TableCell>
													<TableCell className="text-right">
														<Button
															variant="ghost"
															size="sm"
															onClick={() => handleEditZone(zone)}
														>
															Edit
														</Button>
														<Button
															variant="ghost"
															size="sm"
															className="text-red-500"
															onClick={() => removeKitchenZone(zone.id)}
														>
															Delete
														</Button>
													</TableCell>
												</TableRow>
											);
										})
									) : (
										<TableRow>
											<TableCell
												colSpan={3}
												className="text-center h-24"
											>
												No kitchen zones configured.
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</div>
						<div className="flex justify-end mt-4">
							<Button onClick={handleAddNewZone}>Add Kitchen Zone</Button>
						</div>
					</div>

					{/* Configured Printers List */}
					<div>
						<h3 className="text-lg font-medium mb-2">
							All Configured Printers
						</h3>
						<div className="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Name</TableHead>
										<TableHead>Type</TableHead>
										<TableHead>Details</TableHead>
										<TableHead className="text-right">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{printers.length > 0 ? (
										printers.map((p) => (
											<TableRow key={p.id}>
												<TableCell>{p.name}</TableCell>
												<TableCell className="capitalize">
													{p.connection_type}
												</TableCell>
												<TableCell>
													{p.connection_type === "usb"
														? `VID: ${p.vendor_id}, PID: ${p.product_id}`
														: `IP: ${p.ip_address}`}
												</TableCell>
												<TableCell className="text-right">
													<Button
														variant="ghost"
														size="sm"
														onClick={() => handleEditPrinter(p)}
													>
														Edit
													</Button>
													<Button
														variant="ghost"
														size="sm"
														className="text-red-500"
														onClick={() => removePrinter(p.id)}
													>
														Delete
													</Button>
												</TableCell>
											</TableRow>
										))
									) : (
										<TableRow>
											<TableCell
												colSpan={4}
												className="text-center h-24"
											>
												No printers configured.
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</div>
						<div className="flex justify-between mt-4">
							<Button
								variant="outline"
								onClick={handleDiscover}
							>
								Discover & Add USB Printers
							</Button>
							<Button onClick={handleAddNewPrinter}>
								Add Printer Manually
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>

			<AddEditPrinterDialog
				isOpen={isPrinterDialogOpen}
				onOpenChange={setIsPrinterDialogOpen}
				onSave={handleSavePrinter}
				printer={editingPrinter}
			/>
			<AddEditKitchenZoneDialog
				isOpen={isZoneDialogOpen}
				onOpenChange={setIsZoneDialogOpen}
				onSave={handleSaveZone}
				zone={editingZone}
				printers={printers}
			/>
		</>
	);
};

export default PrinterSettings;
