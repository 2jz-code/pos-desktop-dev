import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const thermalPrinter = require("node-thermal-printer");
const { printer: ThermalPrinter, types: PrinterTypes } = thermalPrinter;

const RECEIPT_WIDTH = 42; // Same width as in the Python script

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
 * @param {object} storeSettings - Store configuration from backend (optional, falls back to hardcoded values).
 * @returns {Buffer} The raw command buffer for the printer.
 */
export async function formatReceipt(order, storeSettings = null) {
	let printer = new ThermalPrinter({
		type: PrinterTypes.EPSON,
		characterSet: "PC437_USA",
		interface: "tcp://dummy",
	});

	// --- Header ---
	printer.alignCenter();

	// Print Logo
	try {
		// Vite copies files from /public to the root of the dist folder.
		const logoPath = path.join(process.env.PUBLIC, "logo-receipt.png");
		await printer.printImage(logoPath);
		printer.println(""); // Add some space after the logo
	} catch (error) {
		console.error("Could not print logo. Using text fallback.");
		console.error("Full logo printing error:", error);
		// Use dynamic store settings or fall back to hardcoded values
		if (storeSettings?.receipt_header) {
			printer.println(storeSettings.receipt_header);
			printer.println("");
		}
	}

	// Store information
	const storeAddress =
		storeSettings?.store_address || "2105 Cliff Rd #300\nEagan, MN 55122";
	const storePhone = storeSettings?.store_phone || "(651) 412-5336";

	// Handle multi-line address
	if (storeAddress) {
		// If address already contains a newline, use it.
		if (storeAddress.includes("\\n")) {
			const addressLines = storeAddress.split("\\n");
			addressLines.forEach((line) => {
				if (line.trim()) printer.println(line.trim());
			});
		} else {
			// Otherwise, try to parse it (assuming format: Street, City, State ZIP)
			const parts = storeAddress.split(",");
			if (parts.length > 1) {
				const street = parts.shift().trim();
				const cityStateZip = parts.join(",").trim();
				if (street) printer.println(street);
				if (cityStateZip) printer.println(cityStateZip);
			} else {
				// If parsing fails, print as is.
				printer.println(storeAddress);
			}
		}
	}

	if (storePhone) {
		printer.println(`Tel: ${storePhone}`);
	}

	printer.println("");

	// --- Order Info ---
	printer.alignLeft();
	// Use user-friendly order number first, with fallback to UUID
	const orderId = order.order_number || order.id || "N/A";
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

	// Use dynamic footer or fall back to hardcoded values
	const receiptFooter =
		storeSettings?.receipt_footer || "Thank you for your business!";
	if (receiptFooter) {
		// Handle multi-line footer
		const footerLines = receiptFooter.split("\n");
		footerLines.forEach((line) => {
			if (line.trim()) printer.println(line.trim());
		});
	}

	// Add website if no custom footer is set
	if (!storeSettings?.receipt_footer) {
		printer.println("Visit us at bakeajeen.com");
	}

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
 * @param {object} filterConfig - Zone configuration for filtering items.
 * @param {array} filterConfig.categories - Array of category IDs to include, or ["ALL"].
 * @param {array} filterConfig.productTypes - Array of product type IDs to include, or ["ALL"].
 * @returns {Buffer} The raw command buffer for the printer.
 */
export function formatKitchenTicket(
	order,
	zoneName = "KITCHEN",
	filterConfig = null
) {
	// Filter items based on zone configuration
	let itemsToPrint = order.items || [];

	if (filterConfig) {
		itemsToPrint = itemsToPrint.filter((item) => {
			const product = item.product;

			// Filter by product type
			if (filterConfig.productTypes && filterConfig.productTypes.length > 0) {
				if (!filterConfig.productTypes.includes("ALL")) {
					const productTypeMatch = filterConfig.productTypes.includes(
						product.product_type?.id
					);
					if (!productTypeMatch) return false;
				}
			}

			// Filter by category
			if (filterConfig.categories && filterConfig.categories.length > 0) {
				if (!filterConfig.categories.includes("ALL")) {
					const categoryMatch = filterConfig.categories.includes(
						product.category?.id
					);
					if (!categoryMatch) return false;
				}
			}

			return true;
		});
	}

	// If no items match the filter, return null (don't print)
	if (itemsToPrint.length === 0) {
		console.log(
			`[formatKitchenTicket] No items match filter for zone "${zoneName}" - skipping ticket`
		);
		return null;
	}

	let printer = new ThermalPrinter({
		type: PrinterTypes.EPSON,
		characterSet: "PC437_USA",
		interface: "tcp://dummy",
	});

	// --- Header ---
	printer.alignCenter();
	printer.bold(true);
	printer.setTextSize(1, 1);
	printer.println(`${zoneName.toUpperCase()} TICKET`);
	printer.setTextNormal();
	printer.bold(false);
	printer.alignLeft();
	printer.println("");

	// --- Order Info ---
	printer.setTextSize(2, 2); // Make order number bigger
	printer.bold(true);
	printer.println(`Order #${order.order_number || order.id}`); // Use user-friendly number
	printer.bold(false);
	printer.setTextNormal(); // Reset text size

	const orderDate = new Date(order.created_at).toLocaleTimeString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: true,
		timeZone: "America/Chicago",
	});
	printer.println(`Time: ${orderDate}`);

	printer.drawLine();

	// --- Group items by category ---
	const groupedItems = itemsToPrint.reduce((acc, item) => {
		const categoryName = item.product.category?.name || "Miscellaneous";
		if (!acc[categoryName]) {
			acc[categoryName] = [];
		}
		acc[categoryName].push(item);
		return acc;
	}, {});

	// --- Print items grouped by category ---
	for (const categoryName in groupedItems) {
		// Print category header
		printer.bold(true);
		printer.underline(true);
		printer.println(`${categoryName.toUpperCase()}:`);
		printer.underline(false);
		printer.bold(false);

		const itemsInCategory = groupedItems[categoryName];
		for (const item of itemsInCategory) {
			printer.bold(true);
			printer.setTextSize(1, 1);
			printer.println(`${item.quantity}x ${item.product.name}`);
			printer.setTextNormal();
			printer.bold(false);

			// Add special instructions or notes if available
			if (item.notes && item.notes.trim()) {
				printer.println(`   Notes: ${item.notes.trim()}`);
			}
		}
		printer.println(""); // Add space after each category
	}

	// Remove the footer that shows item counts
	// --- Footer ---
	printer.println("");
	printer.println("");
	printer.cut();

	return printer.getBuffer();
}
