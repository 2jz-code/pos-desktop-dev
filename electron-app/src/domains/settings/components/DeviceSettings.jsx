import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/shared/lib/apiClient";
import {
	getTerminalRegistration,
	upsertTerminalRegistration,
	getTerminalLocations,
} from "../services/settingsService";
import { useLocalStorage } from "@uidotdev/usehooks";
import terminalRegistrationService from "@/services/TerminalRegistrationService";

import { OnlineOnlyButton } from "@/shared/components/ui/OnlineOnlyButton";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/shared/components/ui/form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Input } from "@/shared/components/ui/input";
import { toast } from "sonner";
import {
	Card,
	CardHeader,
	CardContent,
	CardTitle,
	CardDescription,
} from "@/shared/components/ui/card";
import { Separator } from "@/shared/components/ui/separator";
import { Loader2 } from "lucide-react";
import { Label } from "@/shared/components/ui/label";

const terminalRegistrationSchema = z.object({
	nickname: z.string().min(1, "Nickname is required."),
});

export function DeviceSettings() {
	const [machineId, setMachineId] = useState(null);
	const [isMachineIdLoading, setIsMachineIdLoading] = useState(true);
	const queryClient = useQueryClient();
	const [selectedLocation, setSelectedLocation] = useState("");
	const [initialReaderId, setInitialReaderId] = useState(null);

	// Get store location from cache (seeded by SettingsPage from offline settings)
	const locationId = terminalRegistrationService.getLocationId();
	const { data: storeLocation } = useQuery({
		queryKey: ["storeLocation", locationId],
		enabled: false, // Don't fetch - just read from cache seeded by SettingsPage
	});

	const { data: terminalLocations, isLoading: isLoadingTerminalLocations } =
		useQuery({
			queryKey: ["terminalLocations"],
			queryFn: getTerminalLocations,
		});

	const { data: readers, isLoading: isLoadingReaders } = useQuery({
		queryKey: ["terminalReaders", selectedLocation],
		queryFn: async () => {
			const response = await apiClient.get("settings/terminal-readers/", {
				params: { location_id: selectedLocation || undefined },
			});
			return response.data;
		},
	});

	const [selectedReader, setSelectedReader] = useLocalStorage(
		"selectedStripeReaderId",
		null
	);

	useEffect(() => {
		// When readers are loaded, if a reader is selected, ensure its location is also selected.
		if (selectedReader && readers?.length > 0) {
			const reader = readers.find((r) => r.id === selectedReader);
			if (reader && reader.location && reader.location !== selectedLocation) {
				setSelectedLocation(reader.location);
			}
		}
	}, [readers, selectedReader]);

	useEffect(() => {
		// Get device_id from terminal registration (from pairing flow)
		const terminalConfig = terminalRegistrationService.getTerminalConfig();
		if (terminalConfig?.device_id) {
			setMachineId(terminalConfig.device_id);
			setIsMachineIdLoading(false);
		} else {
			// Terminal not paired yet
			toast.error("Terminal Not Registered", {
				description:
					"This terminal must be paired first. Please complete the terminal pairing process.",
			});
			setIsMachineIdLoading(false);
		}
	}, []);

	const { data: registration, isLoading: isLoadingRegistration } = useQuery({
		queryKey: ["terminalRegistration", machineId],
		queryFn: () => getTerminalRegistration(machineId),
		enabled: !!machineId,
		retry: (failureCount, error) => {
			if (error.response?.status === 404) return false;
			return failureCount < 2;
		},
	});

	const terminalForm = useForm({
		resolver: zodResolver(terminalRegistrationSchema),
		disabled: !machineId || isLoadingRegistration,
		defaultValues: {
			nickname: "",
		},
	});

	useEffect(() => {
		if (registration) {
			terminalForm.reset({
				nickname: registration.nickname || "",
			});

			// Set up Stripe Reader selection
			const readerId = registration.reader_id || null;
			setSelectedReader(readerId);
			setInitialReaderId(readerId);
		} else if (!isLoadingRegistration) {
			terminalForm.reset({
				nickname: "",
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [registration, isLoadingRegistration]); // terminalForm and setSelectedReader are stable references

	const { mutate: upsertRegistration, isPending: isUpsertingTerminal } =
		useMutation({
			mutationFn: upsertTerminalRegistration,
			onSuccess: () => {
				toast.success("Device settings saved!");
				queryClient.invalidateQueries({
					queryKey: ["terminalRegistration", machineId],
				});
			},
			onError: (error) => {
				toast.error("Failed to save settings", {
					description: error.response?.data?.detail || error.message,
				});
			},
		});

	const onTerminalSubmit = (data) => {
		// Include the device_id and selected reader ID in the payload sent to the backend
		// Convert null reader_id to empty string (field has blank=True but not null=True)
		// Note: store_location is read-only and managed through admin/pairing flow
		upsertRegistration({
			device_id: machineId,
			nickname: data.nickname,
			reader_id: selectedReader || ""
		});
	};

	const isLoading = isMachineIdLoading || isLoadingRegistration;

	return (
		<Card>
			<CardHeader>
				<CardTitle>This Device</CardTitle>
				<CardDescription>
					Manage settings specific to this terminal, such as its assigned
					location and payment reader.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{isLoading ? (
					<div className="flex items-center space-x-2">
						<Loader2 className="w-5 h-5 animate-spin" />
						<p>Loading device information...</p>
					</div>
				) : (
					<>
						<Form {...terminalForm}>
							<form
								onSubmit={terminalForm.handleSubmit(onTerminalSubmit)}
								className="space-y-6"
							>
								<div className="space-y-4">
									<FormItem>
										<FormLabel>Unique Device ID</FormLabel>
										<FormControl>
											<Input
												readOnly
												disabled
												value={machineId || "Loading..."}
											/>
										</FormControl>
										<FormDescription>
											This is the unique identifier for this terminal. It cannot
											be changed.
										</FormDescription>
									</FormItem>

									<FormField
										control={terminalForm.control}
										name="nickname"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Terminal Nickname</FormLabel>
												<FormControl>
													<Input
														placeholder="e.g., Front Counter"
														{...field}
													/>
												</FormControl>
												<FormDescription>
													A friendly name to help you identify this terminal.
												</FormDescription>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormItem>
										<FormLabel>Assigned Store Location</FormLabel>
										<FormControl>
											<Input
												readOnly
												disabled
												value={storeLocation?.name || "Not assigned"}
											/>
										</FormControl>
										<FormDescription>
											The physical store location where this terminal is
											located. This is set during terminal registration and
											can only be changed through the admin portal.
										</FormDescription>
									</FormItem>
								</div>

								<Separator />

								<div>
									<h3 className="text-lg font-medium">Payment Terminal</h3>
									<p className="text-sm text-muted-foreground">
										Select the Stripe reader this device will use for card
										payments. This is saved locally.
									</p>
								</div>
								<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
									<div className="grid gap-2">
										<Label htmlFor="stripe-location">Stripe Location</Label>
										<Select
											value={selectedLocation || "all"}
											onValueChange={(value) => {
												const newLocation = value === "all" ? "" : value;
												setSelectedLocation(newLocation);
												if (newLocation !== selectedLocation) {
													setSelectedReader(null);
												}
											}}
											disabled={isLoadingTerminalLocations}
										>
											<SelectTrigger id="stripe-location">
												<SelectValue placeholder="Select a Stripe Location..." />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All Locations</SelectItem>
												{terminalLocations?.map((loc) => (
													<SelectItem
														key={loc.id}
														value={loc.stripe_id}
													>
														{loc.store_location_details.name} ({loc.stripe_id})
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<p className="text-sm text-muted-foreground">
											First, select the location where the reader is.
										</p>
									</div>

									<div className="grid gap-2">
										<Label htmlFor="stripe-reader">Stripe Reader</Label>
										<Select
											value={selectedReader || ""}
											onValueChange={(value) =>
												setSelectedReader(value || null)
											}
											disabled={!selectedLocation || isLoadingReaders}
										>
											<SelectTrigger id="stripe-reader">
												<SelectValue placeholder="Select a Stripe Reader..." />
											</SelectTrigger>
											<SelectContent>
												{isLoadingReaders ? (
													<div className="flex items-center justify-center p-2">
														<Loader2 className="w-4 h-4 mr-2 animate-spin" />
														<span>Loading readers...</span>
													</div>
												) : (
													<>
														<SelectItem value={null}>None</SelectItem>
														{readers?.map((reader) => (
															<SelectItem
																key={reader.id}
																value={reader.id}
															>
																{reader.label || "Untitled Reader"} ({reader.id}
																)
															</SelectItem>
														))}
													</>
												)}
											</SelectContent>
										</Select>
										<p className="text-sm text-muted-foreground">
											Then, select the specific reader to use.
										</p>
									</div>
								</div>

								<OnlineOnlyButton
									type="submit"
									disabled={
										isUpsertingTerminal ||
										(!terminalForm.formState.isDirty &&
											selectedReader === initialReaderId)
									}
									disabledMessage="Saving device settings requires internet connection"
								>
									{isUpsertingTerminal && (
										<Loader2 className="w-4 h-4 mr-2 animate-spin" />
									)}
									Save All Device Settings
								</OnlineOnlyButton>
							</form>
						</Form>
					</>
				)}
			</CardContent>
		</Card>
	);
}
