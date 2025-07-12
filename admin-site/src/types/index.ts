export interface Category {
	id: number;
	name: string;
	parent: { id: number } | null;
	children: Category[];
}

export interface GlobalSettings {
	id: number;
	tax_rate: number;
	surcharge_percentage?: number;
	currency: string;
	allow_discount_stacking?: boolean;
	// Add other settings fields as needed
}

export interface Printer {
	id: number;
	name: string;
	connection_type: string;
	ip_address: string;
}

export interface Zone {
	id: number;
	name: string;
	printerId: number;
	categories: (string | number)[];
}

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
