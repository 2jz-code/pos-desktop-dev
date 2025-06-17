// This file acts as a bridge for cash drawer operations.

const { hardwareApi } = window;

/**
 * Invokes the 'open-cash-drawer' channel in the main process.
 * @param {object} printer - The full printer object selected by the user (must have a 'name' property).
 * @returns {Promise<object>} A promise that resolves with the result ({ success: boolean, error?: string }).
 */
export const openCashDrawer = (printer) => {
	// FIX: Expect the full printer object for consistency with other services.
	if (!printer || !printer.name) {
		const errorMsg =
			"A valid printer object with a 'name' property must be provided.";
		console.error(errorMsg);
		return Promise.resolve({ success: false, error: errorMsg });
	}
	// The main process logic uses the printer's name to find the correct device.
	return hardwareApi.invoke("open-cash-drawer", { printerName: printer.name });
};
