import React, { useRef, useCallback, useEffect } from "react";
import { usePosStore } from "@/domains/pos/store/posStore";
import { useSettingsStore } from "@/domains/settings/store/settingsStore";
import { Button } from "@/shared/components/ui/button";
import { CheckCircle, Printer, Mail } from "lucide-react";
import { formatCurrency } from "@/shared/lib/utils";
import {
	printReceipt,
	printKitchenTicket,
} from "@/shared/lib/hardware/printerService";
import { toast } from "@/shared/components/ui/use-toast";
import { getReceiptFormatData } from "@/domains/settings/services/settingsService";

const CompletionView = ({ order, changeDue, onClose }) => {
	const resetCart = usePosStore((state) => state.resetCart);
	// Select state individually to ensure stable references
	const printers = useSettingsStore((state) => state.printers);
	const receiptPrinterId = useSettingsStore((state) => state.receiptPrinterId);
	const kitchenZones = useSettingsStore((state) => state.kitchenZones);

	// Auto-print kitchen tickets once when order completes
	const didAutoPrint = useRef(false);

	const autoPrintAllKitchenTickets = useCallback(async () => {
		if (!kitchenZones || kitchenZones.length === 0) {
			console.log(
				"No kitchen zones configured, skipping kitchen ticket printing"
			);
			return;
		}

		console.log(
			`Auto-printing kitchen tickets for ${kitchenZones.length} zones`
		);

		for (const zone of kitchenZones) {
			try {
				// Find the printer for this zone
				const printer = printers.find((p) => p.id === zone.printerId);

				if (!printer) {
					console.warn(`No printer found for zone "${zone.name}", skipping`);
					continue;
				}

				// Create filter configuration from zone settings
				const filterConfig = {
					categories: zone.categories || [],
					productTypes: zone.productTypes || [],
				};

				// If no categories are configured, skip this zone (as per user requirement)
				if (!filterConfig.categories.length) {
					console.log(
						`Zone "${zone.name}" has no categories configured, skipping`
					);
					continue;
				}

				console.log(
					`Printing kitchen ticket for zone "${zone.name}" with filter:`,
					filterConfig
				);

				// Print the kitchen ticket with filtering
				const result = await printKitchenTicket(
					printer,
					order,
					zone.name,
					filterConfig
				);

				if (result.success) {
					if (result.message) {
						console.log(`Zone "${zone.name}": ${result.message}`);
					} else {
						console.log(
							`Kitchen ticket for zone "${zone.name}" printed successfully`
						);
					}
				} else {
					console.error(
						`Failed to print kitchen ticket for zone "${zone.name}":`,
						result.error
					);
					// Don't show error toasts for individual kitchen tickets, just log them
				}
			} catch (error) {
				console.error(
					`Error printing kitchen ticket for zone "${zone.name}":`,
					error
				);
			}
		}
	}, [printers, kitchenZones, order]);

	// Auto-print kitchen tickets when component mounts (order just completed)
	useEffect(() => {
		if (!didAutoPrint.current) {
			didAutoPrint.current = true;
			autoPrintAllKitchenTickets();
		}
	}, [autoPrintAllKitchenTickets]);

	const handleNewOrder = () => {
		if (resetCart) {
			resetCart();
		}
		if (onClose) {
			onClose();
		}
	};

	const handlePrintReceipt = async () => {
		// Find the full printer object from the list using the stored ID
		const receiptPrinter = printers.find((p) => p.id === receiptPrinterId);
		if (!receiptPrinter) {
			toast({
				title: "No Receipt Printer Selected",
				description: "Please select a receipt printer in the settings.",
				variant: "destructive",
			});
			return;
		}

		try {
			// Fetch store settings for dynamic receipt formatting
			let storeSettings = null;
			try {
				storeSettings = await getReceiptFormatData();
			} catch (error) {
				console.warn(
					"Failed to fetch store settings, using fallback values:",
					error
				);
			}

			await printReceipt(receiptPrinter, order, storeSettings); // Pass store settings
			toast({
				title: "Success",
				description: "Receipt sent to printer.",
			});
		} catch (error) {
			toast({
				title: "Printing Error",
				description: error.message,
				variant: "destructive",
			});
			console.error("[CompletionView] Error from printReceipt service:", error);
		}
	};

	const handleReprintKitchenTickets = async () => {
		try {
			await autoPrintAllKitchenTickets();
			toast({
				title: "Success",
				description: "Kitchen tickets reprinted.",
			});
		} catch (error) {
			console.error("Error reprinting kitchen tickets:", error);
			toast({
				title: "Printing Error",
				description: "Failed to reprint kitchen tickets.",
				variant: "destructive",
			});
		}
	};

	return (
		<div className="flex flex-col items-center justify-center space-y-6 p-8 text-center">
			<CheckCircle className="h-24 w-24 text-green-500" />
			<h2 className="text-3xl font-bold">Payment Successful</h2>

			{changeDue > 0 && (
				<div className="p-4 bg-blue-100 dark:bg-blue-900/50 rounded-lg w-full">
					<p className="text-lg text-blue-800 dark:text-blue-200">Change Due</p>
					<p className="text-5xl font-extrabold text-blue-900 dark:text-blue-100">
						{formatCurrency(changeDue)}
					</p>
				</div>
			)}

			<div className="w-full space-y-2 pt-4">
				<Button
					size="lg"
					className="w-full justify-center gap-2"
				>
					<Mail className="h-5 w-5" /> Email Receipt
				</Button>
				<Button
					size="lg"
					variant="secondary"
					className="w-full justify-center gap-2"
					onClick={handlePrintReceipt}
				>
					<Printer className="h-5 w-5" /> Print Receipt
				</Button>
				{kitchenZones.length > 0 && (
					<Button
						size="lg"
						variant="outline"
						className="w-full justify-center gap-2"
						onClick={handleReprintKitchenTickets}
					>
						<Printer className="h-5 w-5" /> Reprint Kitchen Tickets
					</Button>
				)}
				<Button
					size="lg"
					variant="outline"
					className="w-full"
					onClick={handleNewOrder}
					autoFocus
				>
					Start New Order
				</Button>
			</div>
		</div>
	);
};

export default CompletionView;
