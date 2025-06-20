import React from "react";
import { useSettingsStore } from "@/store/settingsStore";
import StripeTerminalSettings from "./StripeTerminalSettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap } from "lucide-react";

const TerminalSettings = () => {
	const { settings, isLoading } = useSettingsStore();

	// Wait for settings to be loaded before rendering provider-specific UI
	if (isLoading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						Terminal Settings
						<Badge
							variant="secondary"
							className="flex items-center gap-1"
						>
							<Zap className="h-3 w-3" />
							Dynamic
						</Badge>
					</CardTitle>
				</CardHeader>
				<CardContent className="flex items-center">
					<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					<span>Loading terminal configuration...</span>
				</CardContent>
			</Card>
		);
	}

	const renderProviderSettings = () => {
		// This check handles the case where loading is done but settings are still null
		if (!settings) {
			return (
				<Card>
					<CardHeader>
						<CardTitle>Terminal Settings</CardTitle>
					</CardHeader>
					<CardContent>
						<p>Could not load terminal settings. Please try again later.</p>
					</CardContent>
				</Card>
			);
		}

		switch (settings.active_terminal_provider) {
			case "STRIPE_TERMINAL":
				return <StripeTerminalSettings />;
			case "CLOVER_TERMINAL":
				return (
					<Card>
						<CardHeader>
							<CardTitle>Clover Terminal Settings</CardTitle>
						</CardHeader>
						<CardContent>
							<p>Clover Terminal settings are not yet implemented.</p>
						</CardContent>
					</Card>
				);
			default:
				return (
					<Card>
						<CardHeader>
							<CardTitle>Terminal Settings</CardTitle>
						</CardHeader>
						<CardContent>
							<p>
								No active terminal provider selected or it is not supported.
								Please select a provider in the Global Settings.
							</p>
						</CardContent>
					</Card>
				);
		}
	};

	return <div>{renderProviderSettings()}</div>;
};

export default TerminalSettings;
