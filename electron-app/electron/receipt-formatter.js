import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const thermalPrinter = require("node-thermal-printer");
const { printer: ThermalPrinter, types: PrinterTypes } = thermalPrinter;

const RECEIPT_WIDTH = 42; // Same width as in the Python script

/**
 * Formats a line with left and right aligned text.
 * @param {ThermalPrinter} printer - The printer instance.
 * @param {string} left - The left-side text.
 * @param {string} right - The right-side text.
 */
function printLine(printer, left, right) {
	printer.leftRight(left, right);
}

/**
 * Generates a raw buffer for a detailed receipt.
 * @param {object} order - The full order object from the frontend.
 * @returns {Buffer} The raw command buffer for the printer.
 */
export function formatReceipt(order) {
	let printer = new ThermalPrinter({
		type: PrinterTypes.EPSON,
		characterSet: "PC437_USA",
		interface: "tcp://dummy",
	});

	// --- Header ---
	printer.alignCenter();
	printer.println("Ajeen Fresh");
	printer.println("2105 Cliff Rd #300");
	printer.println("Eagan, MN 55122");
	printer.println("Tel: (651) 412-5336");
	printer.println("");

	// --- Order Info ---
	printer.alignLeft();
	const orderId = order.id || "N/A";
	const orderDate = new Date(order.created_at).toLocaleString("en-US", {
		timeZone: "America/Chicago",
	});
	printer.println(`Order #: ${orderId}`);
	printer.println(`Date: ${orderDate}`);
	printer.println("");

	// --- Items ---
	printer.alignCenter();
	printer.bold(true);
	printer.println("ITEMS");
	printer.bold(false);
	printer.drawLine();

	printer.alignLeft();
	for (const item of order.items) {
		const price = parseFloat(item.price_at_sale) * item.quantity;
		const itemText = `${item.quantity}x ${item.product.name}`;
		printLine(printer, itemText, `$${price.toFixed(2)}`);
	}
	printer.drawLine();

	// --- Totals ---
	printLine(printer, "Subtotal:", `$${parseFloat(order.subtotal).toFixed(2)}`);
	if (parseFloat(order.total_discounts_amount) > 0) {
		printLine(
			printer,
			"Discount:",
			`-$${parseFloat(order.total_discounts_amount).toFixed(2)}`
		);
	}
	if (parseFloat(order.surcharges_total) > 0) {
		printLine(
			printer,
			"Service Fee:",
			`$${parseFloat(order.surcharges_total).toFixed(2)}`
		);
	}
	printLine(printer, "Tax:", `$${parseFloat(order.tax_total).toFixed(2)}`);

	const tip = order.payment_details?.tip
		? parseFloat(order.payment_details.tip)
		: 0;
	if (tip > 0) {
		printLine(printer, "Tip:", `$${tip.toFixed(2)}`);
	}

	printer.bold(true);
	printLine(
		printer,
		"TOTAL:",
		`$${parseFloat(order.total_with_tip).toFixed(2)}`
	);
	printer.bold(false);
	printer.println("");

	// --- Payment Details ---
	const transactions = order.payment_details?.transactions || [];
	if (transactions.length > 0) {
		printer.bold(true);
		printer.println("Payment Details:");
		printer.bold(false);

		for (const [index, txn] of transactions.entries()) {
			const method = (txn.method || "N/A").toUpperCase();
			const amount = parseFloat(txn.amount).toFixed(2);
			printLine(printer, ` ${method} (${index + 1})`, `$${amount}`);

			if (method === "CASH") {
				const tendered = parseFloat(txn.cashTendered || 0).toFixed(2);
				const change = parseFloat(txn.change || 0).toFixed(2);
				if (parseFloat(tendered) > 0) {
					printLine(printer, "   Tendered:", `$${tendered}`);
					printLine(printer, "   Change:", `$${change}`);
				}
			} else if (method === "CREDIT" && txn.metadata) {
				const brand = txn.metadata.card_brand || "";
				const last4 = txn.metadata.card_last4 || "";
				if (brand && last4) {
					printer.println(`    ${brand} ****${last4}`);
				}
			}
		}
	}

	// --- Footer ---
	printer.println("");
	printer.alignCenter();
	printer.println("Thank You!");
	printer.println("Visit us at bakeajeen.com");
	printer.println("");
	printer.println("");
	printer.cut();

	return printer.getBuffer();
}

/**
 * Generates a raw buffer for the 'open cash drawer' command.
 * @returns {Buffer} The raw command buffer.
 */
export function formatOpenCashDrawer() {
	let printerInstance = new ThermalPrinter({
		type: PrinterTypes.EPSON,
		interface: "tcp://dummy",
	});
	printerInstance.openCashDrawer();
	return printerInstance.getBuffer();
}

/**
 * Generates a raw buffer for a simplified kitchen ticket with a dynamic zone name.
 * @param {object} order - The full order object.
 * @param {string} zoneName - The name of the kitchen zone (e.g., "Hot Line").
 * @returns {Buffer} The raw command buffer for the printer.
 */
export function formatKitchenTicket(order, zoneName = "KITCHEN") {
	let printer = new ThermalPrinter({
		type: PrinterTypes.EPSON,
		characterSet: "PC437_USA",
		interface: "tcp://dummy",
	});

	// --- Header ---
	printer.alignCenter();
	printer.bold(true);
	printer.setTextSize(1, 1);
	// --- FIX: Use the provided zoneName for the ticket header ---
	printer.println(`${zoneName.toUpperCase()} TICKET`);
	printer.setTextNormal();
	printer.bold(false);
	printer.alignLeft();
	printer.println("");

	// --- Order Info ---
	printer.bold(true);
	printer.println(`Order #: ${order.id}`);
	printer.bold(false);

	const orderDate = new Date(order.created_at).toLocaleTimeString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: true,
		timeZone: "America/Chicago",
	});
	printer.println(`Time: ${orderDate}`);
	printer.drawLine();

	// --- Items ---
	for (const item of order.items) {
		printer.bold(true);
		printer.setTextSize(1, 1);
		printer.println(`${item.quantity}x ${item.product.name}`);
		printer.setTextNormal();
		printer.bold(false);
	}

	// --- Footer ---
	printer.println("");
	printer.println("");
	printer.cut();

	return printer.getBuffer();
}
