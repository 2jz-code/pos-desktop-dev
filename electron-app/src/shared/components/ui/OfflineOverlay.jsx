import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/shared/hooks";

/**
 * OfflineOverlay - A reusable component that shows an overlay when offline
 *
 * Wraps content and shows an overlay message when the app is offline.
 * The overlay covers only the wrapped content, not the entire page (navigation stays accessible).
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Content to render when online
 * @param {string} props.message - Custom message to display (default: "This feature is unavailable offline")
 * @param {string} props.title - Custom title to display (default: "Offline")
 * @param {string} props.className - Additional classes for the wrapper
 */
export function OfflineOverlay({
	children,
	message = "This feature is unavailable offline",
	title = "Offline",
	className = "",
}) {
	const isOnline = useOnlineStatus();

	// If online, just render children
	if (isOnline) {
		return children;
	}

	// Render wrapper with overlay
	return (
		<div className={`relative ${className}`}>
			{children}
			<div className="absolute inset-0 z-10 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4 p-6 text-center">
				<div className="rounded-full bg-muted p-4">
					<WifiOff className="h-8 w-8 text-muted-foreground" />
				</div>
				<div className="space-y-2">
					<h3 className="text-lg font-semibold">{title}</h3>
					<p className="text-sm text-muted-foreground max-w-sm">
						{message}
					</p>
				</div>
			</div>
		</div>
	);
}

export default OfflineOverlay;
