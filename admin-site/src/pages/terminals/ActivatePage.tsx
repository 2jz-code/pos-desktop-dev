import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { verifyPairingCode, approvePairing, denyPairing } from "@/services/api/terminalService";
import { getStoreLocations } from "@/services/api/settingsService";

interface StoreLocation {
	id: number;
	name: string;
	address?: string;
}

interface PairingCodeData {
	user_code: string;
	device_fingerprint: string;
	expires_in: number;
	created_at: string;
}

export function TerminalActivatePage() {
	const { toast } = useToast();

	// Form state
	const [userCode, setUserCode] = useState("");
	const [pairing, setPairing] = useState<PairingCodeData | null>(null);
	const [locations, setLocations] = useState<StoreLocation[]>([]);
	const [selectedLocation, setSelectedLocation] = useState("");
	const [nickname, setNickname] = useState("");

	// UI state
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	// Load locations on mount
	useEffect(() => {
		loadLocations();
	}, []);

	const loadLocations = async () => {
		try {
			const data = await getStoreLocations();
			setLocations(data);
		} catch (err) {
			console.error("Failed to load locations", err);
			toast({
				title: "Error",
				description: "Failed to load store locations",
				variant: "destructive",
			});
		}
	};

	const handleVerify = async () => {
		setLoading(true);
		setError("");

		try {
			const data = await verifyPairingCode(userCode.toUpperCase());
			setPairing(data);
		} catch (err: any) {
			const errorMsg = err.response?.data?.error || "Invalid or expired code";
			setError(errorMsg);
			toast({
				title: "Verification Failed",
				description: errorMsg,
				variant: "destructive",
			});
		} finally {
			setLoading(false);
		}
	};

	const handleApprove = async () => {
		if (!selectedLocation) {
			toast({
				title: "Missing Information",
				description: "Please select a location",
				variant: "destructive",
			});
			return;
		}

		setLoading(true);
		setError("");

		try {
			await approvePairing(userCode.toUpperCase(), parseInt(selectedLocation), nickname);

			toast({
				title: "Terminal Activated",
				description: "Terminal has been successfully activated and paired to your organization",
			});

			// Reset form
			setUserCode("");
			setPairing(null);
			setSelectedLocation("");
			setNickname("");
		} catch (err: any) {
			const errorMsg = err.response?.data?.error || "Failed to approve pairing";
			setError(errorMsg);
			toast({
				title: "Approval Failed",
				description: errorMsg,
				variant: "destructive",
			});
		} finally {
			setLoading(false);
		}
	};

	const handleDeny = async () => {
		if (!confirm("Are you sure you want to deny this terminal registration?")) {
			return;
		}

		setLoading(true);

		try {
			await denyPairing(userCode.toUpperCase());

			toast({
				title: "Terminal Denied",
				description: "Terminal registration has been denied",
			});

			// Reset form
			setUserCode("");
			setPairing(null);
		} catch (err: any) {
			const errorMsg = err.response?.data?.error || "Failed to deny pairing";
			toast({
				title: "Denial Failed",
				description: errorMsg,
				variant: "destructive",
			});
		} finally {
			setLoading(false);
		}
	};

	const formatExpiresIn = (seconds: number) => {
		const minutes = Math.floor(seconds / 60);
		return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
	};

	return (
		<div className="container max-w-2xl mx-auto p-6">
			<div className="mb-6">
				<h1 className="text-3xl font-bold tracking-tight">Activate Terminal</h1>
				<p className="text-muted-foreground mt-2">
					Enter the code displayed on your POS terminal to activate and pair it to your organization
				</p>
			</div>

			{!pairing ? (
				// Step 1: Enter code
				<Card>
					<CardHeader>
						<CardTitle>Terminal Pairing Code</CardTitle>
						<CardDescription>
							The code should be in the format: ABCD-1234
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="userCode">Pairing Code</Label>
							<Input
								id="userCode"
								type="text"
								value={userCode}
								onChange={(e) => setUserCode(e.target.value.toUpperCase())}
								placeholder="ABCD-1234"
								maxLength={9}
								className="text-lg font-mono tracking-wider"
							/>
						</div>

						{error && (
							<Alert variant="destructive">
								<AlertCircle className="h-4 w-4" />
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}

						<Button
							onClick={handleVerify}
							disabled={loading || userCode.length < 8}
							className="w-full"
						>
							{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							Continue
						</Button>
					</CardContent>
				</Card>
			) : (
				// Step 2: Approve/Deny
				<Card>
					<CardHeader>
						<CardTitle>Terminal Details</CardTitle>
						<CardDescription>
							Review the terminal information and assign it to a location
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						{/* Code Display */}
						<div className="p-4 bg-muted rounded-lg">
							<p className="text-sm text-muted-foreground mb-1">Pairing Code</p>
							<p className="text-2xl font-mono font-bold">{pairing.user_code}</p>
						</div>

						{/* Device Fingerprint */}
						<div className="p-4 bg-muted rounded-lg">
							<p className="text-sm text-muted-foreground mb-1">Device ID</p>
							<p className="text-xs font-mono break-all">{pairing.device_fingerprint}</p>
						</div>

						{/* Expiration Warning */}
						<Alert>
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>
								Code expires in {formatExpiresIn(pairing.expires_in)}
							</AlertDescription>
						</Alert>

						{/* Location Selection */}
						<div className="space-y-2">
							<Label htmlFor="location">Location *</Label>
							<Select value={selectedLocation} onValueChange={setSelectedLocation}>
								<SelectTrigger id="location">
									<SelectValue placeholder="Select a location..." />
								</SelectTrigger>
								<SelectContent>
									{locations.map((loc) => (
										<SelectItem key={loc.id} value={loc.id.toString()}>
											{loc.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Nickname */}
						<div className="space-y-2">
							<Label htmlFor="nickname">Nickname (Optional)</Label>
							<Input
								id="nickname"
								type="text"
								value={nickname}
								onChange={(e) => setNickname(e.target.value)}
								placeholder="e.g., Front Counter"
								maxLength={100}
							/>
							<p className="text-sm text-muted-foreground">
								A friendly name to identify this terminal
							</p>
						</div>

						{error && (
							<Alert variant="destructive">
								<AlertCircle className="h-4 w-4" />
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}

						{/* Action Buttons */}
						<div className="flex gap-3">
							<Button
								onClick={handleApprove}
								disabled={loading || !selectedLocation}
								className="flex-1"
							>
								{loading ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<CheckCircle2 className="mr-2 h-4 w-4" />
								)}
								Approve
							</Button>

							<Button
								onClick={handleDeny}
								disabled={loading}
								variant="destructive"
								className="flex-1"
							>
								{loading ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<XCircle className="mr-2 h-4 w-4" />
								)}
								Deny
							</Button>
						</div>

						<Button
							onClick={() => {
								setPairing(null);
								setError("");
								setSelectedLocation("");
								setNickname("");
							}}
							variant="ghost"
							className="w-full"
						>
							← Back
						</Button>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
