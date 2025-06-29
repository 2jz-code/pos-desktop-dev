const { hardwareApi } = window;

export const discoverPrinters = () => {
	return hardwareApi.invoke("discover-printers");
};

export const printReceipt = (printer, data, storeSettings = null) => {
	console.log(
		"[printerService] Invoking 'print-receipt' in main process with printer:",
		printer,
		"and store settings:",
		storeSettings ? "provided" : "not provided"
	);
	return hardwareApi.invoke("print-receipt", { printer, data, storeSettings });
};

// --- UPDATE THIS FUNCTION ---
export const printKitchenTicket = (
	printer,
	order,
	zoneName,
	filterConfig = null
) => {
	console.log(
		`[printerService] Invoking 'print-kitchen-ticket' for zone: ${zoneName}`,
		order,
		`Filter config:`,
		filterConfig
	);
	// Pass the zoneName and filterConfig along with the printer and order data
	return hardwareApi.invoke("print-kitchen-ticket", {
		printer,
		order,
		zoneName,
		filterConfig,
	});
};
