import React from "react";
import { Loader2, AlertTriangle, CheckCircle, WifiOff } from "lucide-react";

const TerminalStatus = ({ status, error, reader }) => {
	if (error) {
		return (
			<div className="flex items-center space-x-2 text-red-600 p-3 bg-red-50 rounded-md">
				<AlertTriangle className="h-5 w-5" />
				<span className="font-semibold">Error:</span>
				<span>{error}</span>
			</div>
		);
	}

	const statusMessages = {
		initializing: "Initializing terminal...",
		discovering: "Discovering readers...",
		connecting: "Connecting to reader...",
		creating_intent: "Creating secure transaction...",
		waiting_for_card: "Waiting for card...",
		capturing: "Processing payment...",
		connected: `Connected to: ${reader?.label || "Unknown Reader"}`,
		idle: "Terminal is idle.",
		error: "An error occurred.", // Generic fallback
	};

	const message = statusMessages[status] || "Terminal ready.";

	if (status === "connected") {
		return (
			<div className="flex items-center space-x-2 text-green-700 p-3 bg-green-50 rounded-md">
				<CheckCircle className="h-5 w-5" />
				<span className="font-semibold">{message}</span>
			</div>
		);
	}

	if (
		[
			"initializing",
			"discovering",
			"connecting",
			"creating_intent",
			"waiting_for_card",
			"capturing",
		].includes(status)
	) {
		return (
			<div className="flex items-center space-x-2 text-blue-700 p-3 bg-blue-50 rounded-md">
				<Loader2 className="h-5 w-5 animate-spin" />
				<span className="font-semibold">{message}</span>
			</div>
		);
	}

	return (
		<div className="flex items-center space-x-2 text-muted-foreground p-3 bg-muted/40 rounded-md">
			<WifiOff className="h-5 w-5" />
			<span className="font-semibold">{message}</span>
		</div>
	);
};

export default TerminalStatus;
