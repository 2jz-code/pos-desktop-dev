import { CloudOff } from "lucide-react";
import { useOnlineStatus } from "@/shared/hooks";

/**
 * Offline mode banner that displays when the app is offline.
 * Shows a warning message indicating limited functionality.
 *
 * @param {Object} props
 * @param {string} [props.message] - Custom message to display (default: generic offline message)
 * @param {string} [props.dataType] - Type of data being shown (e.g., "orders", "payments", "inventory")
 * @param {boolean} [props.show] - Force show/hide the banner (defaults to !isOnline)
 * @param {string} [props.className] - Additional CSS classes
 */
export function OfflineBanner({
	message,
	dataType,
	show,
	className = "",
}) {
	const isOnline = useOnlineStatus();

	// Use explicit show prop if provided, otherwise show when offline
	const shouldShow = show !== undefined ? show : !isOnline;

	if (!shouldShow) return null;

	// Build the message
	const displayMessage = message || (
		dataType
			? `Offline Mode - Showing cached ${dataType}. Some actions are unavailable.`
			: "Offline Mode - View is limited and some actions are unavailable."
	);

	return (
		<div className={`bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 ${className}`}>
			<CloudOff className="h-4 w-4 text-amber-600 flex-shrink-0" />
			<span className="text-sm text-amber-800">
				{displayMessage}
			</span>
		</div>
	);
}

export default OfflineBanner;
