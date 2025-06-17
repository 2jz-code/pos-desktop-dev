const { hardwareApi } = window;

export const discoverPrinters = () => {
	return hardwareApi.invoke("discover-printers");
};

export const printReceipt = (printer, data) => {
	console.log(
		"[printerService] Invoking 'print-receipt' in main process with printer:",
		printer
	);
	return hardwareApi.invoke("print-receipt", { printer, data });
};

// --- UPDATE THIS FUNCTION ---
export const printKitchenTicket = (printer, order, zoneName) => {
	console.log(
		`[printerService] Invoking 'print-kitchen-ticket' for zone: ${zoneName}`,
		order
	);
	// Pass the zoneName along with the printer and order data
	return hardwareApi.invoke("print-kitchen-ticket", {
		printer,
		order,
		zoneName,
	});
};
