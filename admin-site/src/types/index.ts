export interface Category {
	id: number;
	name: string;
	parent: { id: number } | null;
	children: Category[];
}

export interface ProductType {
	id: number;
	name: string;
	description?: string;
}

export interface WebOrderDefaults {
	enable_notifications: boolean;
	play_notification_sound: boolean;
	auto_print_receipt: boolean;
	auto_print_kitchen: boolean;
}

export interface GlobalSettings {
	id: number;
	// Brand Identity
	brand_name: string;
	brand_logo?: string;
	brand_primary_color?: string;
	brand_secondary_color?: string;
	// Financial Rules
	surcharge_percentage?: number;
	currency: string;
	allow_discount_stacking?: boolean;
	// Payment Processing
	active_terminal_provider?: string;
	// Receipt Templates
	brand_receipt_header?: string;
	brand_receipt_footer?: string;
	// Web Order Notification Defaults (tenant-wide)
	web_order_defaults: WebOrderDefaults;
}

// === NEW RELATIONAL PRINTER SYSTEM ===

// Printer model (relational)
export interface Printer {
	id: number;
	location: number; // StoreLocation ID
	name: string;
	printer_type: 'receipt' | 'kitchen';
	ip_address: string;
	port: number;
	is_active: boolean;
	created_at: string;
	updated_at: string;
}

// Kitchen Zone model (relational)
export interface KitchenZone {
	id: number;
	location: number; // StoreLocation ID
	name: string;
	printer: number; // Printer ID
	printer_details?: Printer; // Nested printer object
	categories: number[]; // Category IDs
	category_ids: (number | string)[]; // For backward compat (includes "ALL")
	print_all_items: boolean;
	is_active: boolean;
	created_at: string;
	updated_at: string;
}

// DEPRECATED: Old printer config format (for backward compatibility endpoint)
export interface LegacyPrinterConfig {
	receipt_printers: Array<{
		name: string;
		ip: string;
		port: number;
	}>;
	kitchen_printers: Array<{
		name: string;
		ip: string;
		port: number;
	}>;
	kitchen_zones: Array<{
		name: string;
		printer_name: string;
		categories: (number | string)[];
		productTypes: (number | string)[];
	}>;
}

// === LEGACY INTERFACES (DEPRECATED) ===

/** @deprecated Use Printer interface instead */
export interface Zone {
	id: number;
	name: string;
	printerId: number;
	categories: (string | number)[];
}

/** @deprecated Use LegacyPrinterConfig for backward compat endpoint */
export interface PrinterConfig {
	id: number;
	receipt_printers: Printer[];
	kitchen_printers: Printer[];
	kitchen_zones: Zone[];
}

export interface WebOrderSettings {
	enable_notifications: boolean;
	play_notification_sound: boolean;
	auto_print_receipt: boolean;
	auto_print_kitchen: boolean;
	web_receipt_terminals?: { device_id: string }[];
}

export interface Terminal {
	device_id: string;
	nickname: string;
	// Add other terminal fields as needed
}
