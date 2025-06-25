import React, { useEffect, useState } from "react";
import useTerminalStore from "@/domains/pos/store/terminalStore";
import { useSettingsStore } from "@/domains/settings/store/settingsStore";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/shared/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import {
	Loader2,
	Wifi,
	Usb,
	Bluetooth,
	XCircle,
	RefreshCw,
	CheckCircle,
} from "lucide-react";
import {
	setDeviceReader,
	getDeviceReader,
	deleteDeviceReader,
	getTerminalLocations,
	setDefaultTerminalLocation,
	syncStripeLocations,
} from "@/domains/settings/services/settingsService";
import { useToast } from "@/shared/components/ui/use-toast";

export const StripeTerminalSettings = () => {
	// FIX: Select state individually to prevent re-renders from new object references.
	// This resolves the "getSnapshot" warning.
	const terminalStatus = useTerminalStore((state) => state.terminalStatus);
	const terminalConnectionStatus = useTerminalStore(
		(state) => state.terminalConnectionStatus
	);
	const discoveredReaders = useTerminalStore(
		(state) => state.discoveredReaders
	);
	const initializeTerminal = useTerminalStore(
		(state) => state.initializeTerminal
	);
	const discoverReaders = useTerminalStore((state) => state.discoverReaders);

	const posDeviceId = useSettingsStore((state) => state.posDeviceId);
	const [savedReaderId, setSavedReaderId] = useState(null);
	const [isSaving, setIsSaving] = useState(false);
	const [isSyncing, setIsSyncing] = useState(false);
	const [locations, setLocations] = useState([]);
	const [defaultLocationId, setDefaultLocationId] = useState(null);
	const { toast } = useToast();

	// FIX: Consolidate all initialization logic into a single, stable effect.
	useEffect(() => {
		// Initialize the terminal service once when the component mounts.
		initializeTerminal();

		// Fetch reader data only when a posDeviceId is available.
		if (posDeviceId) {
			getDeviceReader(posDeviceId)
				.then((data) => {
					if (data && data.reader_id) setSavedReaderId(data.reader_id);
				})
				.catch(() => {
					/* Silently fail if no reader is paired */
				});
		}

		// Fetch terminal locations once.
		getTerminalLocations()
			.then((data) => {
				setLocations(data);
				const defaultLoc = data.find((loc) => loc.is_default);
				if (defaultLoc) setDefaultLocationId(defaultLoc.id);
			})
			.catch(() =>
				toast({
					variant: "destructive",
					title: "Failed to fetch locations",
				})
			);
	}, [initializeTerminal, posDeviceId, toast]); // Dependencies are stable or change only once.

	const handleSyncLocations = async () => {
		setIsSyncing(true);
		try {
			const result = await syncStripeLocations();
			toast({
				title: "Sync Successful",
				description: `${result.synced_count} locations synced from Stripe.`,
			});
			// Refetch locations after syncing
			const data = await getTerminalLocations();
			setLocations(data);
			const defaultLoc = data.find((loc) => loc.is_default);
			if (defaultLoc) setDefaultLocationId(defaultLoc.id);
		} catch (error) {
			toast({
				variant: "destructive",
				title: "Sync Failed",
				description: error.message || "Could not sync locations with Stripe.",
			});
		} finally {
			setIsSyncing(false);
		}
	};

	const handleSetDefaultLocation = async (locationId) => {
		// Guard clause to prevent loop if the value hasn't changed
		if (locationId === defaultLocationId) return;

		try {
			await setDefaultTerminalLocation(locationId);
			setDefaultLocationId(locationId);
			toast({
				title: "Default Location Updated",
				description: "New default location has been set for all terminals.",
			});
			//eslint-disable-next-line
		} catch (error) {
			toast({
				variant: "destructive",
				title: "Update Failed",
				description: "Could not set the default location.",
			});
		}
	};

	const handleSaveReader = async (reader) => {
		setIsSaving(true);
		try {
			const pairingData = { device_id: posDeviceId, reader_id: reader.id };
			const savedPairing = await setDeviceReader(pairingData);
			setSavedReaderId(savedPairing.reader_id);
			toast({
				title: "Reader Saved",
				description: `Station is now paired with reader ${reader.label}.`,
			});
		} catch (error) {
			toast({
				variant: "destructive",
				title: "Failed to save reader",
				description: error.message,
			});
		} finally {
			setIsSaving(false);
		}
	};

	const handleForgetReader = async () => {
		setIsSaving(true);
		try {
			await deleteDeviceReader(posDeviceId);
			setSavedReaderId(null);
			toast({
				title: "Reader Unpaired",
				description: "This station is no longer paired with a reader.",
			});
		} catch (error) {
			toast({
				variant: "destructive",
				title: "Failed to unpair reader",
				description: error.message,
			});
		} finally {
			setIsSaving(false);
		}
	};

	const isWorking =
		terminalConnectionStatus === "discovering" ||
		terminalConnectionStatus === "connecting" ||
		terminalConnectionStatus === "initializing" ||
		isSaving ||
		isSyncing;

	const renderReaderList = () => {
		if (terminalConnectionStatus === "discovering") {
			return (
				<div className="flex items-center justify-center p-8">
					<Loader2 className="h-8 w-8 animate-spin mr-4" />
					<span>Discovering readers...</span>
				</div>
			);
		}
		if (discoveredReaders.length === 0) {
			return (
				<p className="text-center text-muted-foreground p-4">
					No readers found. Make sure reader is on and connected to the same
					network.
				</p>
			);
		}
		return (
			<ul className="space-y-2">
				{discoveredReaders.map((reader) => (
					<li
						key={reader.id}
						className="flex items-center space-x-2"
					>
						<span className="flex-grow">
							{reader.label} ({reader.id})
						</span>
						<Button
							variant="outline"
							size="sm"
							onClick={() => handleSaveReader(reader)}
							disabled={isWorking || savedReaderId === reader.id}
						>
							{savedReaderId === reader.id ? "Paired" : "Pair to this Station"}
						</Button>
					</li>
				))}
			</ul>
		);
	};

	return (
		<div className="space-y-6">
			{/* Location Management Card */}
			<Card>
				<CardHeader>
					<CardTitle>Stripe Location Management</CardTitle>
					<CardDescription>
						Sync your physical store locations from Stripe and set a default for
						discovering readers.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center space-x-2">
						<Select
							value={defaultLocationId || ""}
							onValueChange={handleSetDefaultLocation}
							disabled={locations.length === 0}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select a default location" />
							</SelectTrigger>
							<SelectContent>
								{locations.map((loc) => (
									<SelectItem
										key={loc.id}
										value={loc.id}
									>
										{loc.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Button
							onClick={handleSyncLocations}
							disabled={isSyncing}
							variant="outline"
						>
							{isSyncing ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<RefreshCw className="mr-2 h-4 w-4" />
							)}
							Sync with Stripe
						</Button>
					</div>
					{defaultLocationId && (
						<div className="p-2 bg-blue-50 border border-blue-200 rounded-lg flex items-center text-sm">
							<CheckCircle className="h-5 w-5 text-blue-600 mr-2" />
							<p className="font-medium text-blue-800">
								Reader discovery is scoped to the default location.
							</p>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Reader Pairing Card */}
			<Card>
				<CardHeader>
					<CardTitle>Default Card Reader</CardTitle>
					<CardDescription>
						Set a default card reader for this specific POS station to skip
						selection during checkout.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{savedReaderId ? (
						<div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
							<div>
								<p className="font-bold text-green-800">Reader Paired</p>
								<p className="text-sm text-green-700">ID: {savedReaderId}</p>
							</div>
							<Button
								variant="ghost"
								size="sm"
								onClick={handleForgetReader}
								disabled={isSaving}
							>
								<XCircle className="mr-2 h-4 w-4" /> Forget
							</Button>
						</div>
					) : (
						<div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center">
							<XCircle className="h-5 w-5 text-yellow-600 mr-2" />
							<p className="font-bold text-yellow-800">
								No default reader set for this station.
							</p>
						</div>
					)}
					<div>
						<h3 className="font-semibold mb-2">Discover & Pair New Reader</h3>
						<div className="flex justify-center space-x-2 mb-4">
							<Button
								onClick={() => discoverReaders("internet")}
								disabled={isWorking}
							>
								<Wifi className="mr-2 h-4 w-4" /> Internet
							</Button>
							<Button
								onClick={() => discoverReaders("usb")}
								disabled={isWorking}
							>
								<Usb className="mr-2 h-4 w-4" /> USB
							</Button>
							<Button
								onClick={() => discoverReaders("bluetooth")}
								disabled={isWorking}
							>
								<Bluetooth className="mr-2 h-4 w-4" /> Bluetooth
							</Button>
						</div>
						{renderReaderList()}
					</div>
					<div className="h-6 text-sm text-muted-foreground flex items-center">
						{isWorking && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
						<span>{isSaving ? "Saving changes..." : terminalStatus}</span>
					</div>
				</CardContent>
			</Card>
		</div>
	);
};
