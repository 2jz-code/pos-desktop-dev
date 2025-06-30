import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
	getPrinterConfig,
	updatePrinterConfig,
} from "../services/settingsService";
import { useEffect, useState } from "react";
import { useLocalStorage } from "@uidotdev/usehooks";

import { Button } from "@/shared/components/ui/button";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/shared/components/ui/form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Input } from "@/shared/components/ui/input";
import { toast } from "sonner";
import { Trash2, PlusCircle, Usb } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Separator } from "@/shared/components/ui/separator";

const printerSchema = z.object({
	name: z.string().min(1, "Name is required"),
	ip_address: z.string().min(1, "IP Address is required"),
});

const zoneSchema = z.object({
	name: z.string().min(1, "Name is required"),
	printer_name: z.string().min(1, "A printer must be selected"),
	// A more robust solution would involve fetching categories and using a multi-select component.
	// For now, we'll use a string for simplicity. The backend can parse this.
	category_ids_str: z.string().optional(),
});

const formSchema = z.object({
	receipt_printers: z.array(printerSchema),
	kitchen_printers: z.array(printerSchema),
	kitchen_zones: z.array(zoneSchema),
});

const getPrinterId = (p) => (p ? `${p.vendorId}:${p.productId}` : "no-printer");

export function PrinterSettings() {
	const [localPrinters, setLocalPrinters] = useState([]);
	const [isScanning, setIsScanning] = useState(false);
	const [selectedReceiptPrinter, setSelectedReceiptPrinter] = useLocalStorage(
		"localReceiptPrinter",
		null
	);
	const queryClient = useQueryClient();

	const { data: config, isLoading } = useQuery({
		queryKey: ["printerConfig"],
		queryFn: getPrinterConfig,
	});

	// When the component loads, ensure the locally stored printer is in the list
	// so the dropdown can display it without needing a new scan.
	useEffect(() => {
		if (selectedReceiptPrinter) {
			setLocalPrinters((prev) => {
				const printerMap = new Map(prev.map((p) => [getPrinterId(p), p]));
				if (!printerMap.has(getPrinterId(selectedReceiptPrinter))) {
					printerMap.set(
						getPrinterId(selectedReceiptPrinter),
						selectedReceiptPrinter
					);
				}
				return Array.from(printerMap.values());
			});
		}
	}, [selectedReceiptPrinter]);

	const mutation = useMutation({
		mutationFn: updatePrinterConfig,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["printerConfig"] });
			toast.success("Printer configuration updated successfully!");
		},
		onError: (error) => {
			toast.error(`Failed to update printer config: ${error.message}`);
		},
	});

	const form = useForm({
		resolver: zodResolver(formSchema),
		values: {
			receipt_printers: config?.receipt_printers || [],
			kitchen_printers: config?.kitchen_printers || [],
			kitchen_zones:
				config?.kitchen_zones.map((z) => ({
					...z,
					category_ids_str: z.category_ids?.join(",") || "",
				})) || [],
		},
		disabled: isLoading || mutation.isPending,
	});

	const {
		fields: kitchenFields,
		append: appendKitchen,
		remove: removeKitchen,
	} = useFieldArray({
		control: form.control,
		name: "kitchen_printers",
	});

	const {
		fields: zoneFields,
		append: appendZone,
		remove: removeZone,
	} = useFieldArray({
		control: form.control,
		name: "kitchen_zones",
	});

	const kitchenPrinters = form.watch("kitchen_printers");

	const onSubmit = (values) => {
		// Convert category_ids_str back to an array of numbers for the backend
		const payload = {
			...values,
			kitchen_zones: values.kitchen_zones.map((z) => ({
				name: z.name,
				printer_name: z.printer_name,
				category_ids: z.category_ids_str
					.split(",")
					.map((id) => parseInt(id.trim(), 10))
					.filter((id) => !isNaN(id)),
			})),
		};
		mutation.mutate(payload);
	};

	const handleScanPrinters = async () => {
		setIsScanning(true);
		toast.info("Scanning for local USB printers...");
		try {
			const scannedPrinters = await window.hardwareApi.invoke(
				"discover-printers"
			);

			// Merge new printers with the existing list, preventing duplicates
			setLocalPrinters((prev) => {
				const printerMap = new Map(prev.map((p) => [getPrinterId(p), p]));
				scannedPrinters.forEach((p) => {
					printerMap.set(getPrinterId(p), p);
				});
				return Array.from(printerMap.values());
			});

			if (scannedPrinters.length > 0) {
				toast.success(`Found ${scannedPrinters.length} local printer(s).`);
			} else {
				toast.warning("No new local USB printers found on scan.");
			}
		} catch (error) {
			toast.error("Failed to scan for printers", {
				description: error.message,
			});
			console.error(error);
		} finally {
			setIsScanning(false);
		}
	};

	if (isLoading) {
		return <div>Loading printer settings...</div>;
	}

	return (
		<div className="space-y-8">
			<Card>
				<CardHeader>
					<CardTitle>Local Receipt Printer (This Terminal)</CardTitle>
					<CardDescription>
						Select a locally connected USB printer for printing customer
						receipts from this specific terminal. This setting is saved on this
						device only.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center gap-4">
						<Select
							value={
								selectedReceiptPrinter
									? JSON.stringify(selectedReceiptPrinter)
									: ""
							}
							onValueChange={(value) => {
								setSelectedReceiptPrinter(value ? JSON.parse(value) : null);
							}}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select a discovered printer..." />
							</SelectTrigger>
							<SelectContent>
								{localPrinters.map((p) => (
									<SelectItem
										key={getPrinterId(p)}
										value={JSON.stringify(p)}
									>
										{p.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Button
							onClick={handleScanPrinters}
							disabled={isScanning}
							variant="outline"
						>
							<Usb className="mr-2 h-4 w-4" />
							{isScanning ? "Scanning..." : "Scan for USB Printers"}
						</Button>
					</div>
				</CardContent>
			</Card>

			<Separator />

			<Card>
				<CardHeader>
					<CardTitle>Network Printers & Kitchen Zones</CardTitle>
					<CardDescription>
						Manage network printers for kitchen tickets and bar orders. This
						configuration is shared across all terminals.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Form {...form}>
						<form
							onSubmit={form.handleSubmit(onSubmit)}
							className="space-y-12"
						>
							{/* Kitchen Printers */}
							<div>
								<h3 className="text-lg font-medium">
									Kitchen & Bar Printers (Network)
								</h3>
								<div className="space-y-4 mt-4">
									{kitchenFields.map((field, index) => (
										<div
											key={field.id}
											className="flex items-end gap-4 p-4 border rounded-lg"
										>
											<FormField
												name={`kitchen_printers.${index}.name`}
												control={form.control}
												render={({ field }) => (
													<FormItem className="flex-1">
														<FormLabel>Name</FormLabel>
														<FormControl>
															<Input {...field} />
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
											<FormField
												name={`kitchen_printers.${index}.ip_address`}
												control={form.control}
												render={({ field }) => (
													<FormItem className="flex-1">
														<FormLabel>IP Address</FormLabel>
														<FormControl>
															<Input {...field} />
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
											<Button
												type="button"
												variant="destructive"
												size="icon"
												onClick={() => removeKitchen(index)}
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
									))}
								</div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="mt-4"
									onClick={() => appendKitchen({ name: "", ip_address: "" })}
								>
									<PlusCircle className="mr-2 h-4 w-4" /> Add Kitchen/Bar
									Printer
								</Button>
							</div>

							{/* Kitchen Zones */}
							<div>
								<h3 className="text-lg font-medium">Kitchen Zones</h3>
								<p className="text-sm text-muted-foreground">
									Route product categories to specific network printers.
								</p>
								<div className="space-y-4 mt-4">
									{zoneFields.map((field, index) => (
										<div
											key={field.id}
											className="grid grid-cols-1 md:grid-cols-3 items-end gap-4 p-4 border rounded-lg"
										>
											<FormField
												name={`kitchen_zones.${index}.name`}
												control={form.control}
												render={({ field }) => (
													<FormItem>
														<FormLabel>Zone Name</FormLabel>
														<FormControl>
															<Input {...field} />
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
											<FormField
												name={`kitchen_zones.${index}.printer_name`}
												control={form.control}
												render={({ field }) => (
													<FormItem>
														<FormLabel>Send to Printer</FormLabel>
														<Select
															onValueChange={field.onChange}
															defaultValue={field.value}
														>
															<FormControl>
																<SelectTrigger>
																	<SelectValue placeholder="Select a printer" />
																</SelectTrigger>
															</FormControl>
															<SelectContent>
																<SelectContent>
																	{kitchenPrinters
																		.filter((p) => p.name)
																		.map((p) => (
																			<SelectItem
																				key={p.name}
																				value={p.name}
																			>
																				{p.name}
																			</SelectItem>
																		))}
																</SelectContent>
															</SelectContent>
														</Select>
														<FormMessage />
													</FormItem>
												)}
											/>
											{/* Category IDs input can be simplified or improved later */}
											<div className="flex items-end gap-2">
												<FormField
													name={`kitchen_zones.${index}.category_ids_str`}
													control={form.control}
													render={({ field }) => (
														<FormItem className="flex-1">
															<FormLabel>Category IDs</FormLabel>
															<FormControl>
																<Input
																	{...field}
																	placeholder="e.g. 1,5,8"
																/>
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>
												<Button
													type="button"
													variant="destructive"
													size="icon"
													onClick={() => removeZone(index)}
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											</div>
										</div>
									))}
								</div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="mt-4"
									onClick={() =>
										appendZone({
											name: "",
											printer_name: "",
											category_ids_str: "",
										})
									}
								>
									<PlusCircle className="mr-2 h-4 w-4" /> Add Zone
								</Button>
							</div>

							<div className="pt-8">
								<Button
									type="submit"
									disabled={
										form.formState.isSubmitting || !form.formState.isDirty
									}
								>
									{form.formState.isSubmitting
										? "Saving Network Settings..."
										: "Save Network Settings"}
								</Button>
							</div>
						</form>
					</Form>
				</CardContent>
			</Card>
		</div>
	);
}
