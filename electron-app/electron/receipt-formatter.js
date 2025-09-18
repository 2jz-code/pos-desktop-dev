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
export async function formatReceipt(order, storeSettings = null, isTransaction = false) {
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
	
	// Customer name: attempt to get from order or payment details
	const customerName = order.customer_display_name || 
		order.guest_first_name ||
		(order.payment_details?.customer_name) || 
		(order.customer?.full_name);
	
	// Only print customer name if one is actually provided
	if (customerName) {
		printer.println(`Customer: ${customerName}`);
	}
	printer.println(`Order #: ${orderId}`);
	printer.println(`Date: ${orderDate}`);
	
	// Show dining preference
	const diningPreference = order.dining_preference || "TAKE_OUT";
	const diningLabel = diningPreference === "DINE_IN" ? "Dine In" : "Take Out";
	printer.println(`Service: ${diningLabel}`);
	
	// Show order source
	if (order.order_type) {
		const orderTypeLabels = {
			'POS': 'In-Store',
			'WEB': 'Website',
			'APP': 'App', 
			'DOORDASH': 'DoorDash',
			'UBER_EATS': 'Uber Eats'
		};
		const sourceLabel = orderTypeLabels[order.order_type] || order.order_type;
		printer.println(`Source: ${sourceLabel}`);
	}
	
	// Show transaction receipt header and order status for non-completed orders
	if (isTransaction) {
		printer.alignCenter();
		printer.bold(true);
		printer.println("--- TRANSACTION RECEIPT ---");
		printer.bold(false);
		printer.alignLeft();
		
		if (order.status) {
			printer.println(`Order Status: ${order.status}`);
		}
		printer.println("** Payment Not Yet Processed **");
	}
	
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
		const itemName = item.product ? item.product.name : (item.custom_name || 'Custom Item');
		const itemText = `${item.quantity}x ${itemName}`;
		printLine(printer, itemText, `$${price.toFixed(2)}`);
		
		// Print modifiers if they exist
		if (item.selected_modifiers_snapshot && item.selected_modifiers_snapshot.length > 0) {
			for (const modifier of item.selected_modifiers_snapshot) {
				const modPrice = parseFloat(modifier.price_at_sale) * modifier.quantity * item.quantity;
				let modText = `   - ${modifier.option_name}`;
				
				// Add quantity if > 1
				if (modifier.quantity > 1) {
					modText += ` (${modifier.quantity}x)`;
				}
				
				// Only show price if not zero
				if (parseFloat(modifier.price_at_sale) !== 0) {
					printLine(printer, modText, `$${modPrice.toFixed(2)}`);
				} else {
					printer.println(modText);
				}
			}
		}
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
	if (parseFloat(order.total_surcharges || 0) > 0) {
		printLine(
			printer,
			"Service Fee:",
			`$${parseFloat(order.total_surcharges).toFixed(2)}`
		);
	}
	printLine(printer, "Tax:", `$${parseFloat(order.tax_total).toFixed(2)}`);

	if (parseFloat(order.total_tips || 0) > 0) {
		printLine(printer, "Tip:", `$${parseFloat(order.total_tips).toFixed(2)}`);
	}

	printer.bold(true);
	printLine(
		printer,
		"TOTAL:",
		`$${parseFloat(order.total_collected || order.grand_total || 0).toFixed(2)}`
	);
	printer.bold(false);
	printer.println("");

	// --- Payment Details ---
	if (!isTransaction) {
		let transactions = order.payment_details?.transactions || [];

		// For online orders, only show successful transactions to avoid showing failed attempts
		if (order.order_type === "WEB") {
			transactions = transactions.filter(txn => txn.status === "SUCCESSFUL");
		}

		if (transactions.length > 0) {
			printer.bold(true);
			printer.println("Payment Details:");
			printer.bold(false);

			for (const [index, txn] of transactions.entries()) {
				const method = (txn.method || "N/A").toUpperCase();

				// Calculate total transaction amount (amount + surcharge + tip)
				const baseAmount = parseFloat(txn.amount || 0);
				const surcharge = parseFloat(txn.surcharge || 0);
				const tip = parseFloat(txn.tip || 0);
				const totalAmount = (baseAmount + surcharge + tip).toFixed(2);

				// For card transactions, show card brand and last 4 digits if available
				if (method === "CARD_ONLINE" || method === "CARD_TERMINAL") {
					const cardBrand = txn.card_brand || "";
					const cardLast4 = txn.card_last4 || "";

					if (cardBrand && cardLast4) {
						// Show "Visa ******1234" instead of "CARD_ONLINE (1)"
						const displayName = `${cardBrand.toUpperCase()} ******${cardLast4}`;
						printLine(printer, ` ${displayName}`, `$${totalAmount}`);
					} else {
						// Fallback to original format if card details aren't available
						printLine(printer, ` ${method} (${index + 1})`, `$${totalAmount}`);
					}
				} else {
					// Non-card transactions use original format
					printLine(printer, ` ${method} (${index + 1})`, `$${totalAmount}`);
				}

				if (method === "CASH") {
					const tendered = parseFloat(txn.cashTendered || 0).toFixed(2);
					const change = parseFloat(txn.change || 0).toFixed(2);
					if (parseFloat(tendered) > 0) {
						printLine(printer, "   Tendered:", `$${tendered}`);
						printLine(printer, "   Change:", `$${change}`);
					}
				}
			}
		}
	} else {
		// For transaction receipts, show a note about payment
		printer.bold(true);
		printer.println("Payment Information:");
		printer.bold(false);
		printer.println("This is a transaction receipt.");
		printer.println("Payment will be processed separately.");
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

			// Custom items (without product reference) are always included in kitchen tickets
			if (!product) {
				return true;
			}

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
	// Add top margin to prevent ticket holder from covering order info
	printer.println("");
	printer.println("");
	printer.println("");
	printer.println("");
	
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
	printer.println(`${order.order_number || order.id}`); // Order number already includes "ORD-" prefix
	printer.bold(false);
	printer.setTextNormal(); // Reset text size

	// Customer name: attempt to get from order or payment details
	const customerName = order.customer_display_name || 
		order.guest_first_name ||
		(order.payment_details?.customer_name) || 
		(order.customer?.full_name);
	
	// Only print customer name if one is actually provided
	if (customerName) {
		printer.println(`Customer: ${customerName}`);
	}

	const orderDate = new Date(order.created_at).toLocaleTimeString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: true,
		timeZone: "America/Chicago",
	});
	printer.println(`Time: ${orderDate}`);
	
	// Show dining preference on kitchen ticket - important for service
	const diningPreference = order.dining_preference || "TAKE_OUT";
	const diningLabel = diningPreference === "DINE_IN" ? "DINE IN" : "TAKE OUT";
	printer.bold(true);
	printer.println(`SERVICE: ${diningLabel}`);
	
	// Show order source on kitchen ticket
	if (order.order_type) {
		const orderTypeLabels = {
			'POS': 'IN-STORE',
			'WEB': 'WEBSITE',
			'APP': 'APP', 
			'DOORDASH': 'DOORDASH',
			'UBER_EATS': 'UBER EATS'
		};
		const sourceLabel = orderTypeLabels[order.order_type] || order.order_type;
		printer.println(`SOURCE: ${sourceLabel}`);
	}
	printer.bold(false);

	printer.drawLine();

	// --- Group items by category ---
	const groupedItems = itemsToPrint.reduce((acc, item) => {
		const categoryName = item.product ? (item.product.category?.name || "Miscellaneous") : "Custom Items";
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
			const itemName = item.product ? item.product.name : (item.custom_name || 'Custom Item');
			printer.println(`${item.quantity}x ${itemName}`);
			printer.setTextNormal();
			printer.bold(false);

			// Print modifiers in compact format for kitchen
			if (item.selected_modifiers_snapshot && item.selected_modifiers_snapshot.length > 0) {
				// Group modifiers by modifier set name
				const modifiersBySet = item.selected_modifiers_snapshot.reduce((acc, modifier) => {
					const setName = modifier.modifier_set_name || 'Other';
					if (!acc[setName]) acc[setName] = [];
					acc[setName].push(modifier);
					return acc;
				}, {});

				// Print each modifier set in compact format
				for (const [setName, modifiers] of Object.entries(modifiersBySet)) {
					// Format all options from this set on one line
					const optionsList = modifiers.map(modifier => {
						let optionText = modifier.option_name;
						if (modifier.quantity > 1) {
							optionText += ` (${modifier.quantity}x)`;
						}
						return optionText;
					}).join(', ');
					
					printer.println(`   ${setName} - ${optionsList}`);
				}
			}

			// Add special instructions or notes if available
			if (item.notes && item.notes.trim()) {
				printer.println(`   NOTES: ${item.notes.trim()}`);
			}
		}
		printer.println(""); // Add space after each category
	}

	printer.cut();

	return printer.getBuffer();
}
