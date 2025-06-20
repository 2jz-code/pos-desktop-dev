import React from "react";
import { usePosStore } from "../../../../../store/posStore";
import { useSettingsStore } from "../../../../../store/settingsStore";
import { Button } from "../../../../../components/ui/button";
import { CheckCircle, Printer, Mail } from "lucide-react";
import { formatCurrency } from "../../../../../lib/utils";
import { printReceipt } from "../../../../../lib/hardware/printerService";
import { toast } from "../../../../../components/ui/use-toast";
import { getReceiptFormatData } from "../../../../../api/services/settingsService";

const CompletionView = ({ order, changeDue, onClose }) => {
	const resetCart = usePosStore((state) => state.resetCart);
	// Select state individually to ensure stable references
	const printers = useSettingsStore((state) => state.printers);
	const receiptPrinterId = useSettingsStore((state) => state.receiptPrinterId);

	// Note: Kitchen auto-printing functionality commented out
	// const didAutoPrint = useRef(false);
	// const autoPrintAllKitchenTickets = useCallback(async () => { ... }, [printers, kitchenZones, order]);

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
