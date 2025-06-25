import { useState, useEffect } from "react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import {
	Cloud,
	CloudOff,
	Loader2,
	AlertCircle,
	CheckCircle,
} from "lucide-react";

export const SyncStatusIndicator = () => {
	const [syncStats, setSyncStats] = useState(null);
	const [isLoading, setIsLoading] = useState(false);

	const fetchSyncStats = async () => {
		try {
			if (!window.syncApi) return;

			const result = await window.syncApi.getStats();
			if (result.success) {
				setSyncStats(result.stats);
			}
		} catch (error) {
			console.error("Failed to fetch sync stats:", error);
		}
	};

	const triggerManualSync = async () => {
		console.log("🔄 Manual sync button clicked!");
		setIsLoading(true);
		try {
			if (!window.syncApi) {
				console.error("❌ window.syncApi is not available");
				return;
			}

			console.log("📤 Calling syncApi.forceSync()...");
			const result = await window.syncApi.forceSync();
			console.log("📤 Force sync result:", result);

			if (result.success) {
				console.log("✅ Force sync successful, refreshing stats in 500ms");
				// Refresh stats after sync
				setTimeout(fetchSyncStats, 500);
			} else {
				console.error("❌ Force sync returned unsuccessful result:", result);
			}
		} catch (error) {
			console.error("❌ Failed to trigger manual sync:", error);
		} finally {
			console.log("🔄 Manual sync completed, setting loading to false");
			setIsLoading(false);
		}
	};

	// Fetch stats on mount and then every 10 seconds
	useEffect(() => {
		fetchSyncStats();
		const interval = setInterval(fetchSyncStats, 10000);
		return () => clearInterval(interval);
	}, []);

	if (!syncStats) {
		return (
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Loader2 className="w-4 h-4 animate-spin" />
				<span>Loading sync status...</span>
			</div>
		);
	}

	const pendingCount = syncStats.PENDING + syncStats.SYNCING;
	const failedCount = syncStats.FAILED;
	const conflictCount = syncStats.CONFLICT;
	const isOnline = syncStats.isOnline;

	// Debug logging for sync status
	console.log("🔍 Sync status debug:", {
		pendingCount,
		failedCount,
		conflictCount,
		isOnline,
		syncStats,
		shouldShowButton: (pendingCount > 0 || failedCount > 0) && isOnline,
	});

	const getStatusIcon = () => {
		if (!isOnline) {
			return <CloudOff className="w-4 h-4 text-orange-500" />;
		}

		if (failedCount > 0 || conflictCount > 0) {
			return <AlertCircle className="w-4 h-4 text-red-500" />;
		}

		if (pendingCount > 0 || syncStats.isOutboxProcessing) {
			return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
		}

		return <CheckCircle className="w-4 h-4 text-green-500" />;
	};

	const getStatusText = () => {
		if (!isOnline) {
			return `Offline - ${pendingCount} changes queued`;
		}

		if (failedCount > 0) {
			return `${failedCount} sync failures`;
		}

		if (conflictCount > 0) {
			return `${conflictCount} conflicts need resolution`;
		}

		if (pendingCount > 0) {
			return `${pendingCount} changes syncing...`;
		}

		return "All changes synced";
	};

	const getStatusVariant = () => {
		if (!isOnline) return "secondary";
		if (failedCount > 0 || conflictCount > 0) return "destructive";
		if (pendingCount > 0) return "default";
		return "success";
	};

	const getTooltipContent = () => {
		return (
			<div className="text-sm">
				<div className="font-medium mb-1">Sync Status</div>
				<div className="space-y-1">
					<div>Online: {isOnline ? "Yes" : "No"}</div>
					<div>Pending: {syncStats.PENDING}</div>
					<div>Syncing: {syncStats.SYNCING}</div>
					<div>Failed: {syncStats.FAILED}</div>
					<div>Conflicts: {syncStats.CONFLICT}</div>
					<div>Synced: {syncStats.SYNCED}</div>
				</div>
				{!isOnline && (
					<div className="mt-2 text-orange-200">
						Changes will sync automatically when connection is restored
					</div>
				)}
			</div>
		);
	};

	return (
		<TooltipProvider>
			<div className="flex items-center gap-2">
				<Tooltip>
					<TooltipTrigger asChild>
						<Badge
							variant={getStatusVariant()}
							className="flex items-center gap-1 cursor-help"
						>
							{getStatusIcon()}
							<span className="text-xs">{getStatusText()}</span>
						</Badge>
					</TooltipTrigger>
					<TooltipContent>{getTooltipContent()}</TooltipContent>
				</Tooltip>

				{/* Manual sync button - only show if there are pending changes or failures */}
				{(pendingCount > 0 || failedCount > 0) && isOnline && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								onClick={triggerManualSync}
								disabled={isLoading}
								className="h-6 px-2"
							>
								{isLoading ? (
									<Loader2 className="w-3 h-3 animate-spin" />
								) : (
									<Cloud className="w-3 h-3" />
								)}
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							<p>Trigger manual sync</p>
						</TooltipContent>
					</Tooltip>
				)}
			</div>
		</TooltipProvider>
	);
};
