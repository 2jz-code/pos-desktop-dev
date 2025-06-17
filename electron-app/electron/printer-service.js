import usb from "usb";

/**
 * Sends a raw buffer directly to the specified USB printer.
 * @param {{vendorId: number, productId: number}} printer - An object with the printer's VID and PID.
 * @param {Buffer} buffer - The command buffer to send.
 */
export async function sendBufferToPrinter(printer, buffer) {
	let device = null;
	try {
		if (!printer || !printer.vendorId || !printer.productId) {
			throw new Error("Invalid printer object provided.");
		}

		device = usb.findByIds(printer.vendorId, printer.productId);
		if (!device) {
			throw new Error("Printer device not found.");
		}

		device.open();
		const an_interface = device.interfaces[0];
		an_interface.claim();
		const endpoint = an_interface.endpoints.find((e) => e.direction === "out");

		if (!endpoint) {
			throw new Error("Could not find an OUT endpoint on the printer.");
		}

		await new Promise((resolve, reject) => {
			endpoint.transfer(buffer, (err) => {
				if (err) {
					return reject(new Error(`USB Transfer Error: ${err.message}`));
				}
				resolve();
			});
		});
	} finally {
		// Cleanup logic to ensure the USB device is always released and closed.
		if (device) {
			try {
				if (device.interfaces[0] && device.interfaces[0].isClaimed()) {
					await new Promise((resolve) => {
						device.interfaces[0].release(true, () => resolve());
					});
				}
				device.close();
			} catch (e) {
				console.error("Error during USB device cleanup:", e);
			}
		}
	}
}
