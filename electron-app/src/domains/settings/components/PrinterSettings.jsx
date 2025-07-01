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
import { CategoryMultiSelect } from "./CategoryMultiSelect";

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
import { useToast } from "@/shared/components/ui/use-toast";
import { Trash2, PlusCircle, Usb, Wifi } from "lucide-react";
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
	// Now using proper array of category IDs with CategoryMultiSelect component
	category_ids: z.array(z.number()).optional(),
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
	const { toast } = useToast();

	const handleTestPrinter = async (ip_address) => {
		if (!ip_address) {
			toast({
				title: "IP Address Missing",
				description: "Please enter an IP address before testing.",
				variant: "warning",
			});
			return;
		}

		toast({
			title: "Testing Connection",
			description: `Pinging printer at ${ip_address}...`,
		});

		try {
			const result = await window.hardwareApi.invoke("test-network-printer", {
				ip_address,
			});

			if (result.success) {
				toast({
					title: "Connection Successful!",
					description: result.message,
					variant: "success",
				});
			} else {
				toast({
					title: "Connection Failed",
					description: result.error,
					variant: "destructive",
				});
			}
		} catch (error) {
			toast({
				title: "An unexpected error occurred",
				description: error.message,
				variant: "destructive",
			});
			console.error("Error testing printer:", error);
		}
	};

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
			queryClient.invalidateQueries({ queryKey: ["kitchen-zones-cloud"] });

			toast({
				title: "Success!",
				description: "Printer configuration updated successfully!",
			});
		},
		onError: (error) => {
			toast({
				title: "Update Failed",
				description: `Failed to update printer config: ${error.message}`,
				variant: "destructive",
			});
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
					category_ids: z.category_ids || [],
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
		const payload = {
			receipt_printers: values.receipt_printers.map((p) => ({
				name: p.name.trim(),
				ip_address: p.ip_address.trim(),
			})),
			kitchen_printers: values.kitchen_printers.map((p) => ({
				name: p.name.trim(),
				ip_address: p.ip_address.trim(),
			})),
			kitchen_zones: values.kitchen_zones.map((z) => ({
				name: z.name.trim(),
				printer_name: z.printer_name.trim(),
				category_ids: z.category_ids || [],
			})),
		};

		console.log("Saving printer configuration payload:", payload);
		mutation.mutate(payload);
	};

	const handleScanPrinters = async () => {
		setIsScanning(true);
		toast({
			title: "Scanning for local USB printers",
			description: "Please wait while we scan for local USB printers...",
		});
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
				toast({
					title: "Printers Found",
					description: `Found ${scannedPrinters.length} local printer(s).`,
				});
			} else {
				toast({
					title: "No New Printers Found",
					description: "No new local USB printers were found on this scan.",
					variant: "warning",
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
											className="grid grid-cols-1 md:grid-cols-4 items-end gap-4 p-4 border rounded-lg"
										>
											<FormField
												name={`kitchen_printers.${index}.name`}
												control={form.control}
												render={({ field }) => (
													<FormItem className="md:col-span-1">
														<FormLabel>Printer Name</FormLabel>
														<FormControl>
															<Input
																{...field}
																placeholder="e.g., Kitchen"
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
											<FormField
												name={`kitchen_printers.${index}.ip_address`}
												control={form.control}
												render={({ field }) => (
													<FormItem className="md:col-span-2">
														<FormLabel>IP Address</FormLabel>
														<div className="flex items-center gap-2">
															<FormControl>
																<Input
																	{...field}
																	placeholder="e.g., 192.168.1.100"
																/>
															</FormControl>
															<Button
																type="button"
																variant="outline"
																size="icon"
																onClick={() => handleTestPrinter(field.value)}
															>
																<Wifi className="h-4 w-4" />
															</Button>
														</div>
														<FormMessage />
													</FormItem>
												)}
											/>

											<div className="flex justify-end">
												<Button
													type="button"
													variant="destructive"
													onClick={() => removeKitchen(index)}
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
											{/* Category selection with multi-select dropdown */}
											<div className="flex items-end gap-2">
												<FormField
													name={`kitchen_zones.${index}.category_ids`}
													control={form.control}
													render={({ field }) => (
														<FormItem className="flex-1">
															<FormLabel>Categories</FormLabel>
															<FormControl>
																<CategoryMultiSelect
																	value={field.value || []}
																	onChange={field.onChange}
																	placeholder="Select categories for this zone..."
																/>
															</FormControl>
															<FormDescription>
																Select which product categories should print to
																this zone
															</FormDescription>
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
											category_ids: [],
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
