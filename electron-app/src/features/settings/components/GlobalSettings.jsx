import React, { useState } from "react";
import { useSettingsStore } from "@/store/settingsStore";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";

const GlobalSettings = () => {
	const { settings, isLoading, updateSettings } = useSettingsStore();
	const [isSaving, setIsSaving] = useState(false);
	const { toast } = useToast();

	const handleProviderChange = async (value) => {
		setIsSaving(true);
		try {
			await updateSettings({ ...settings, active_terminal_provider: value });
			toast({
				title: "Provider Updated",
				description: "Active terminal provider has been changed.",
			});
		} catch (error) {
			toast({
				variant: "destructive",
				title: "Failed to update provider",
				description: error.message,
			});
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Global Payment Settings</CardTitle>
				<CardDescription>
					This setting determines which payment provider is used for all
					transactions.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{isLoading ? (
					<div className="flex items-center">
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						<span>Loading settings...</span>
					</div>
				) : settings ? (
					<div className="grid w-full max-w-sm items-center gap-1.5">
						<Label htmlFor="terminal-provider">Active Terminal Provider</Label>
						<Select
							id="terminal-provider"
							value={settings.active_terminal_provider}
							onValueChange={handleProviderChange}
							disabled={isSaving}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select a provider" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="STRIPE_TERMINAL">Stripe Terminal</SelectItem>
								<SelectItem value="CLOVER_TERMINAL">Clover Terminal</SelectItem>
							</SelectContent>
						</Select>
					</div>
				) : (
					<p>Could not load settings. Please try again later.</p>
				)}
			</CardContent>
		</Card>
	);
};

export default GlobalSettings;
