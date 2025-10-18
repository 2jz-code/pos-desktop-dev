import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
	getPrinterConfig,
	updatePrinterConfig,
} from "../services/settingsService";
import { useState, useEffect } from "react";
import { useSettingsStore } from "@/domains/settings/store/settingsStore";
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
	id: z.number().or(z.string()),
	name: z.string().min(1, "Name is required"),
	ip_address: z.string().min(1, "IP Address is required"),
});

const zoneSchema = z.object({
	id: z.number().or(z.string()).optional(),
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

export function PrinterSettings() {
	const localPrinters = useSettingsStore((state) => state.printers);
	const receiptPrinterId = useSettingsStore((state) => state.receiptPrinterId);
	const setReceiptPrinterId = useSettingsStore(
		(state) => state.setReceiptPrinterId
	);
	const discoverAndSetPrinters = useSettingsStore(
		(state) => state.discoverAndSetPrinters
	);

	const [isScanning, setIsScanning] = useState(false);
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
		defaultValues: {
			receipt_printers: [],
			kitchen_printers: [],
			kitchen_zones: [],
		},
		disabled: isLoading || mutation.isPending,
	});

	useEffect(() => {
		if (config) {
			const kitchenPrinters = config.kitchen_printers || [];
			const printerNameById = kitchenPrinters.reduce((acc, p) => {
				acc[p.id] = p.name;
				return acc;
			}, {});

			const mappedZones = (config.kitchen_zones || []).map((z) => ({
				id: z.id,
				name: z.name,
				printer_name: z.printer_name || printerNameById[z.printerId] || "",
				category_ids: z.categories || [],
			}));

			form.reset({
				receipt_printers: config.receipt_printers || [],
				kitchen_printers: kitchenPrinters,
				kitchen_zones: mappedZones,
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [config]); // 'form' is a stable reference from useForm(), no need to include it

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
		console.log("Form submitted with values:", values);
		console.log("Form errors:", form.formState.errors);
		
		const printerIdByName = values.kitchen_printers.reduce((acc, p) => {
			acc[p.name] = p.id;
			return acc;
		}, {});

		const payload = {
			receipt_printers: values.receipt_printers.map((p) => ({
				id: p.id,
				name: p.name.trim(),
				ip_address: p.ip_address.trim(),
			})),
			kitchen_printers: values.kitchen_printers.map((p) => ({
				id: p.id,
				name: p.name.trim(),
				ip_address: p.ip_address.trim(),
			})),
			kitchen_zones: values.kitchen_zones.map((z) => ({
				id: z.id,
				name: z.name.trim(),
				printer_name: z.printer_name,
				categories: z.category_ids || [],
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

	const allReceiptPrinters = [
		...(localPrinters || []),
		...(config?.receipt_printers || []).map((p) => ({
			...p,
			connectionType: "network",
		})),
	];

	if (isLoading) {
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
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Wifi className="h-5 w-5" />
					Printer & Kitchen Settings
				</CardTitle>
				<CardDescription>
					Configure receipt printers and kitchen zone assignments for your terminal
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="space-y-6"
					>
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
						<FormField
							control={form.control}
							name="local_receipt_printer"
							render={() => (
								<FormItem className="flex flex-col space-y-2">
									<FormLabel>Selected Receipt Printer</FormLabel>
									<Select
										value={receiptPrinterId || "none"}
										onValueChange={(value) => setReceiptPrinterId(value === "none" ? null : value)}
									>
										<SelectTrigger>
											<SelectValue placeholder="Select a printer" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none">None</SelectItem>
											{allReceiptPrinters.map((p) => (
												<SelectItem
													key={p.id || p.name}
													value={p.id || p.name}
												>
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
								</FormItem>
							)}
						/>
						<div className="flex items-end">
							<Button
								type="button"
								onClick={handleScanPrinters}
								disabled={isScanning}
								className="w-full"
							>
								{isScanning ? "Scanning..." : "Scan for USB Printers"}
							</Button>
						</div>
					</CardContent>
				</Card>

				<Separator />

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Wifi className="h-5 w-5" />
							Network Printers & Kitchen Zones
						</CardTitle>
						<CardDescription>
							Manage network printers for receipts and kitchen tickets. This is
							a global setting.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<div>
							<h3 className="text-lg font-medium mb-2">Kitchen Printers</h3>
							<div className="space-y-4">
								{kitchenFields.map((field, index) => (
									<div
										key={field.id}
										className="flex flex-col md:flex-row items-start gap-4 p-4 border rounded-md"
									>
										<FormField
											control={form.control}
											name={`kitchen_printers.${index}.name`}
											render={({ field }) => (
												<FormItem className="flex-1">
													<FormLabel>Printer Name</FormLabel>
													<Input
														{...field}
														placeholder="e.g., Kitchen Epson"
													/>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name={`kitchen_printers.${index}.ip_address`}
											render={({ field }) => (
												<FormItem className="flex-1">
													<FormLabel>IP Address</FormLabel>
													<Input
														{...field}
														placeholder="e.g., 192.168.1.100"
													/>
													<FormMessage />
												</FormItem>
											)}
										/>
										<div className="flex items-end gap-2 pt-2 md:pt-0">
											<Button
												type="button"
												variant="outline"
												size="sm"
												onClick={() =>
													handleTestPrinter(
														form.getValues(
															`kitchen_printers.${index}.ip_address`
														)
													)
												}
											>
												Test
											</Button>
											<Button
												type="button"
												variant="destructive"
												size="icon"
												onClick={() => removeKitchen(index)}
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
									</div>
								))}
								<Button
									type="button"
									variant="outline"
									onClick={() => appendKitchen({ id: `new-${Date.now()}`, name: "", ip_address: "" })}
								>
									<PlusCircle className="mr-2 h-4 w-4" />
									Add Kitchen Printer
								</Button>
							</div>
						</div>

						<Separator />

						<div>
							<h3 className="text-lg font-medium mb-2">Kitchen Zones</h3>
							<div className="space-y-4">
								{zoneFields.map((field, index) => (
									<div
										key={field.id}
										className="flex flex-col p-4 border rounded-md gap-4"
									>
										<div className="flex flex-col md:flex-row gap-4">
											<FormField
												control={form.control}
												name={`kitchen_zones.${index}.name`}
												render={({ field }) => (
													<FormItem className="flex-1">
														<FormLabel>Zone Name</FormLabel>
														<Input
															{...field}
															placeholder="e.g., Hot Line"
														/>
														<FormMessage />
													</FormItem>
												)}
											/>
											<FormField
												control={form.control}
												name={`kitchen_zones.${index}.printer_name`}
												render={({ field }) => (
													<FormItem className="flex-1">
														<FormLabel>Assigned Printer</FormLabel>
														<Select
															onValueChange={field.onChange}
															value={field.value ?? ""}
														>
															<FormControl>
																<SelectTrigger>
																	<SelectValue placeholder="Select a kitchen printer" />
																</SelectTrigger>
															</FormControl>
															<SelectContent>
																{kitchenPrinters.filter(p => p.name && p.name.trim()).map((p, index) => (
																	<SelectItem
																		key={p.id || `printer-${index}`}
																		value={p.name || `printer-${index}`}
																	>
																		{p.name}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
														<FormMessage />
													</FormItem>
												)}
											/>
											<div className="flex items-end">
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
										<FormField
											control={form.control}
											name={`kitchen_zones.${index}.category_ids`}
											render={({ field }) => (
												<FormItem>
													<FormLabel>Categories to Print</FormLabel>
													<CategoryMultiSelect
														value={field.value || []}
														onChange={field.onChange}
													/>
													<FormDescription>
														Select which product categories should print to this
														zone.
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>
									</div>
								))}
								<Button
									type="button"
									variant="outline"
									onClick={() =>
										appendZone({
											id: `new-${Date.now()}`,
											name: "",
											printer_name: "",
											category_ids: [],
										})
									}
								>
									<PlusCircle className="mr-2 h-4 w-4" /> Add Kitchen Zone
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>

					<Button
						type="submit"
						disabled={mutation.isPending || !form.formState.isDirty}
						onClick={() => {
							console.log("Save button clicked");
							console.log("Form values:", form.getValues());
							console.log("Form errors:", form.formState.errors);
							console.log("Form isValid:", form.formState.isValid);
						}}
					>
						{mutation.isPending ? "Saving..." : "Save Changes"}
					</Button>
				</form>
			</Form>
			</CardContent>
		</Card>
	);
}
