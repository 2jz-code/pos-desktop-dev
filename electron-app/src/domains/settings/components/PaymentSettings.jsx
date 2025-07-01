import React, { useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import {
	syncStripeLocations,
	getTerminalLocations,
	getGlobalSettings,
	updateGlobalSettings,
} from "../services/settingsService";
import { AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@/shared/components/ui/alert";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Label } from "@/shared/components/ui/label";

const TerminalProvider = {
	STRIPE_TERMINAL: "STRIPE_TERMINAL",
	CLOVER_TERMINAL: "CLOVER_TERMINAL",
};

export function PaymentSettings() {
	const queryClient = useQueryClient();

	const { data: globalSettings } = useQuery({
		queryKey: ["globalSettings"],
		queryFn: getGlobalSettings,
	});

	// --- DIAGNOSTIC LOG ---
	// This will print the settings object to the developer console when it loads.
	useEffect(() => {
		if (globalSettings) {
			console.log(
				"[Debug] PaymentSettings - Global Settings Loaded:",
				globalSettings
			);
			console.log(
				"[Debug] Active Terminal Provider from Backend:",
				globalSettings.active_terminal_provider
			);
		}
	}, [globalSettings]);

	const {
		data: terminalLocations,
		isLoading: isLoadingLocations,
		isError: isErrorLocations,
	} = useQuery({
		queryKey: ["terminalLocations"],
		queryFn: getTerminalLocations,
	});

	const { mutate: updateSettings, isPending: isUpdatingSettings } = useMutation(
		{
			mutationFn: updateGlobalSettings,
			onSuccess: () => {
				toast.success("Payment provider updated.");
				queryClient.invalidateQueries(["globalSettings"]);
			},
			onError: (error) => {
				toast.error("Failed to update settings.", {
					description: error.message,
				});
			},
		}
	);

	const syncMutation = useMutation({
		mutationFn: syncStripeLocations,
		onSuccess: (data) => {
			queryClient.invalidateQueries(["terminalLocations"]);
			toast.success("Stripe locations synced successfully.", {
				description: `${data.created} created, ${data.updated} updated.`,
			});
		},
		onError: (error) => {
			toast.error("Failed to sync Stripe locations.", {
				description: error.message || "An unknown error occurred.",
			});
		},
	});

	const handleSync = () => {
		toast.info("Syncing with Stripe...");
		syncMutation.mutate();
	};

	const handleProviderChange = (newProvider) => {
		updateSettings({ active_terminal_provider: newProvider });
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Payment Provider Management</CardTitle>
				<CardDescription>
					Select your active payment provider and manage its settings.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{!globalSettings ? (
					<div className="flex items-center space-x-2">
						<Loader2 className="w-5 h-5 animate-spin" />
						<p>Loading settings...</p>
					</div>
				) : (
					<>
						<div className="max-w-md space-y-2">
							<Label htmlFor="payment-provider">Active Payment Provider</Label>
							<Select
								onValueChange={handleProviderChange}
								value={globalSettings.active_terminal_provider}
								disabled={isUpdatingSettings}
							>
								<SelectTrigger id="payment-provider">
									<SelectValue placeholder="Select a provider" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={TerminalProvider.STRIPE_TERMINAL}>
										Stripe Terminal
									</SelectItem>
									<SelectItem
										value={TerminalProvider.CLOVER_TERMINAL}
										disabled
									>
										Clover Terminal (coming soon)
									</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{globalSettings.active_terminal_provider ===
							TerminalProvider.STRIPE_TERMINAL && (
							<>
								<div className="flex items-center justify-between p-4 border rounded-lg">
									<div className="flex-1">
										<h3 className="font-medium">Stripe Terminal Sync</h3>
										<p className="text-sm text-muted-foreground">
											Sync readers from your Stripe Dashboard to make them
											available for assignment on the Device tab.
										</p>
									</div>
									<Button
										onClick={handleSync}
										disabled={syncMutation.isPending}
									>
										{syncMutation.isPending && (
											<Loader2 className="w-4 h-4 mr-2 animate-spin" />
										)}
										{syncMutation.isPending ? "Syncing..." : "Sync Now"}
									</Button>
								</div>

								<div>
									<h3 className="mb-2 text-lg font-semibold">
										Synced Stripe Locations
									</h3>
									{isLoadingLocations && <p>Loading readers...</p>}
									{isErrorLocations && (
										<Alert variant="destructive">
											<AlertTriangle className="w-4 h-4" />
											<AlertTitle>Error</AlertTitle>
											<AlertDescription>
												Could not fetch synced Stripe readers.
											</AlertDescription>
										</Alert>
									)}
									{terminalLocations && terminalLocations.length === 0 && (
										<Alert>
											<CheckCircle className="w-4 h-4" />
											<AlertTitle>No Readers Synced</AlertTitle>
											<AlertDescription>
												You haven't synced any Stripe readers yet. Click "Sync
												Now" to get started.
											</AlertDescription>
										</Alert>
									)}
									<div className="space-y-2">
										{terminalLocations?.map((loc) => (
											<div
												key={loc.id}
												className="flex items-center justify-between p-3 border rounded-md bg-muted/50"
											>
												<div>
													<p className="font-semibold">{loc.stripe_id}</p>
													<p className="text-sm text-muted-foreground">
														Linked to:{" "}
														<span className="font-medium text-foreground">
															{loc.store_location_details?.name || "N/A"}
														</span>
													</p>
												</div>
												<CheckCircle className="w-5 h-5 text-green-500" />
											</div>
										))}
									</div>
								</div>
							</>
						)}

						{globalSettings.active_terminal_provider ===
							TerminalProvider.CLOVER_TERMINAL && (
							<Alert variant="info">
								<AlertTriangle className="w-4 h-4" />
								<AlertTitle>Configuration Not Available</AlertTitle>
								<AlertDescription>
									Clover Terminal configuration is not yet implemented.
								</AlertDescription>
							</Alert>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
}
