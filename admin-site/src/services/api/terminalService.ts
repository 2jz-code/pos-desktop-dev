import apiClient from "./client";

/**
 * Terminal Service
 * Handles terminal pairing and registration API interactions
 */

// === Types ===

export type TerminalDisplayStatus = "online" | "syncing" | "offline" | "inactive";
export type TerminalSyncStatus = "unknown" | "online" | "offline" | "syncing" | "error";

export interface TerminalRegistration {
	id: string;
	device_id: string;
	nickname: string;
	last_seen: string;
	is_active: boolean;
	reader_id: string;
	device_fingerprint: string;
	last_authenticated_at: string | null;
	authentication_failures: number;
	is_locked: boolean;
	pairing_code: string | null;
	pairing_code_user_code: string | null;
	store_location: number | null;
	location_name: string | null;
	tenant: string;
	tenant_slug: string;
	// Heartbeat/sync status fields
	last_heartbeat_at: string | null;
	sync_status: TerminalSyncStatus;
	pending_orders_count: number;
	pending_operations_count: number;
	last_sync_success_at: string | null;
	last_flush_success_at: string | null;
	exposure_amount: string;
	// Daily offline metrics
	daily_offline_revenue: string;
	daily_offline_order_count: number;
	// Computed status fields
	display_status: TerminalDisplayStatus;
	needs_attention: boolean;
	offline_duration_seconds: number | null;
}

export interface PendingPairing {
	user_code: string;
	device_fingerprint: string;
	expires_in: number;
	created_at: string;
}

// === Terminal Pairing ===

export const verifyPairingCode = async (userCode: string) => {
	const response = await apiClient.get("terminals/pairing/verify/", {
		params: { user_code: userCode },
	});
	return response.data;
};

export const approvePairing = async (
	userCode: string,
	locationId: number,
	nickname?: string
) => {
	const response = await apiClient.post("terminals/pairing/approve/", {
		user_code: userCode,
		location_id: locationId,
		nickname: nickname || "",
	});
	return response.data;
};

export const denyPairing = async (userCode: string) => {
	const response = await apiClient.post("terminals/pairing/deny/", {
		user_code: userCode,
	});
	return response.data;
};

export const getPendingPairings = async (): Promise<PendingPairing[]> => {
	const response = await apiClient.get("terminals/pairing/pending-pairings/");
	return response.data.results;
};

// === Terminal Registrations ===

export const getTerminalRegistrations = async (): Promise<TerminalRegistration[]> => {
	const response = await apiClient.get("terminals/registrations/");
	return response.data.results || response.data;
};

export const getTerminalDetails = async (deviceId: string): Promise<TerminalRegistration> => {
	const response = await apiClient.get(`terminals/registrations/${deviceId}/`);
	return response.data;
};

export const getTerminalRegistrationsByLocation = async (
	locationId: number
): Promise<TerminalRegistration[]> => {
	const response = await apiClient.get("terminals/registrations/", {
		params: { store_location: locationId },
	});
	return response.data.results || response.data;
};

// === Utility Functions ===

/**
 * Format offline duration from seconds to human-readable string
 */
export const formatOfflineDuration = (seconds: number | null): string => {
	if (seconds === null) return "—";

	if (seconds < 60) {
		return `${seconds}s`;
	} else if (seconds < 3600) {
		const minutes = Math.floor(seconds / 60);
		return `${minutes}m`;
	} else {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		return `${hours}h ${minutes}m`;
	}
};

/**
 * Get status display configuration
 */
export const getStatusConfig = (status: TerminalDisplayStatus) => {
	const configs = {
		online: {
			label: "Online",
			icon: "circle",
			color: "text-green-500",
			bgColor: "bg-green-500/10",
			borderColor: "border-green-500/30",
		},
		syncing: {
			label: "Syncing",
			icon: "refresh-cw",
			color: "text-blue-500",
			bgColor: "bg-blue-500/10",
			borderColor: "border-blue-500/30",
		},
		offline: {
			label: "Offline",
			icon: "circle",
			color: "text-red-500",
			bgColor: "bg-red-500/10",
			borderColor: "border-red-500/30",
		},
		inactive: {
			label: "Inactive",
			icon: "circle",
			color: "text-gray-400",
			bgColor: "bg-gray-500/10",
			borderColor: "border-gray-500/30",
		},
	};
	return configs[status] || configs.inactive;
};
