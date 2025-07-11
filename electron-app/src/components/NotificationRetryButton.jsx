import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { Loader2, RefreshCw } from "lucide-react";
import { useNotificationManager } from "@/shared/hooks/useNotificationManager";

export const NotificationRetryButton = () => {
	const [isRetrying, setIsRetrying] = useState(false);

	// Get notification websocket connection status and reconnect function
	const { isDisconnected, reconnect } = useNotificationManager();

	const retryNotificationConnection = async () => {
		console.log("🔄 Retrying notification websocket connection...");
		setIsRetrying(true);
		try {
			reconnect();
			console.log("✅ Notification websocket reconnection initiated");
		} catch (error) {
			console.error(
				"❌ Failed to retry notification websocket connection:",
				error
			);
		} finally {
			// Add a small delay to show the loading state
			setTimeout(() => setIsRetrying(false), 1000);
		}
	};

	// Only render the retry button when notifications are disconnected
	if (!isDisconnected) {
		return null;
	}

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						onClick={retryNotificationConnection}
						disabled={isRetrying}
						className="h-6 px-2"
					>
						{isRetrying ? (
							<Loader2 className="w-3 h-3 animate-spin" />
						) : (
							<RefreshCw className="w-3 h-3 text-orange-500" />
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					<p>Retry notification connection</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};
