import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Monitor, Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import terminalRegistrationService from "@/services/TerminalRegistrationService";
import offlineSyncService from "@/services/OfflineSyncService";

export function TerminalPairingPage() {
	const navigate = useNavigate();
	const [status, setStatus] = useState("initializing"); // initializing, waiting_approval, approved, error
	const [userCode, setUserCode] = useState("");
	const [verificationUri, setVerificationUri] = useState("");
	const [remainingSeconds, setRemainingSeconds] = useState(null);
	const [error, setError] = useState("");

	// Separate countdown timer that updates every second
	useEffect(() => {
		if (status !== "waiting_approval" || remainingSeconds === null) {
			return;
		}

		const interval = setInterval(() => {
			setRemainingSeconds((prev) => {
				if (prev === null || prev <= 0) return 0;
				return prev - 1;
			});
		}, 1000);

		return () => clearInterval(interval);
	}, [status, remainingSeconds !== null]);

	useEffect(() => {
		startPairing();
	}, []);

	const startPairing = async () => {
		setStatus("initializing");
		setError("");

		try {
			await terminalRegistrationService.startPairing((update) => {
				console.log("Pairing status update:", update);

				if (update.status === "waiting_approval") {
					setStatus("waiting_approval");
					// Only update these if they exist in the update (first call)
					if (update.userCode) setUserCode(update.userCode);
					if (update.verificationUri) setVerificationUri(update.verificationUri);
					if (update.expiresIn) setRemainingSeconds(update.expiresIn);
					// Update remaining time from server (happens every poll)
					if (update.remainingSeconds !== undefined) {
						setRemainingSeconds(update.remainingSeconds);
					}
				} else if (update.status === "approved") {
					setStatus("approved");
					// Start offline sync service
					console.log("🔄 Starting offline sync service after successful pairing...");
					offlineSyncService.start(30000);
					// Navigate to login after short delay
					setTimeout(() => {
						navigate("/login");
					}, 2000);
				}
			});
		} catch (err) {
			console.error("Pairing failed:", err);
			setStatus("error");
			setError(err.message || "Failed to pair terminal. Please try again.");
		}
	};

	const formatTime = (seconds) => {
		if (!seconds) return "";
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	};

	return (
		<div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
			<div className="w-full max-w-2xl p-4">
				<div className="text-center mb-6">
					<Monitor className="mx-auto h-12 w-12 text-gray-700 dark:text-gray-300" />
					<h1 className="text-3xl font-bold mt-2 text-gray-900 dark:text-gray-50">
						Terminal Activation
					</h1>
				</div>

				<Card>
					<CardHeader>
						<CardTitle className="text-2xl">Pair This Terminal</CardTitle>
						<CardDescription>
							This terminal needs to be activated before you can use it.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						{status === "initializing" && (
							<div className="text-center py-8">
								<Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
								<p className="text-lg text-muted-foreground">
									Requesting activation code...
								</p>
							</div>
						)}

						{status === "waiting_approval" && (
							<>
								{/* Activation Code Display */}
								<div className="bg-gradient-to-br from-primary/10 to-primary/5 border-2 border-primary/30 rounded-xl p-8 text-center">
									<p className="text-sm text-muted-foreground mb-2">
										Activation Code
									</p>
									<div className="text-6xl font-bold tracking-wider font-mono text-primary mb-2">
										{userCode}
									</div>
									<p className="text-xs text-muted-foreground">
										Enter this code on the admin dashboard
									</p>
								</div>

								{/* Instructions */}
								<Alert>
									<AlertCircle className="h-4 w-4" />
									<AlertDescription>
										<p className="font-semibold mb-2">To activate this terminal:</p>
										<ol className="list-decimal list-inside space-y-1 text-sm">
											<li>Go to your admin dashboard in a web browser</li>
											<li>Navigate to Settings → Terminals</li>
											<li>Click "Activate Terminal"</li>
											<li>Enter the code shown above: <strong>{userCode}</strong></li>
											<li>Select the location and click Approve</li>
										</ol>
									</AlertDescription>
								</Alert>

								{/* Status Indicator */}
								<div className="flex items-center justify-center gap-3 py-4">
									<Loader2 className="h-5 w-5 animate-spin text-primary" />
									<span className="text-muted-foreground">
										Waiting for administrator approval...
									</span>
								</div>

								{/* Countdown */}
								{remainingSeconds !== null && (
									<div className="text-center text-sm text-muted-foreground">
										Code expires in: <strong>{formatTime(remainingSeconds)}</strong>
									</div>
								)}
							</>
						)}

						{status === "approved" && (
							<div className="text-center py-8">
								<CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
								<p className="text-2xl font-bold text-green-600 dark:text-green-400 mb-2">
									Terminal Activated!
								</p>
								<p className="text-muted-foreground">
									Redirecting to login screen...
								</p>
							</div>
						)}

						{status === "error" && (
							<>
								<Alert variant="destructive">
									<XCircle className="h-4 w-4" />
									<AlertDescription>
										<p className="font-semibold mb-1">Activation Failed</p>
										<p className="text-sm">{error}</p>
									</AlertDescription>
								</Alert>

								<Button
									onClick={startPairing}
									className="w-full"
									size="lg"
								>
									Try Again
								</Button>
							</>
						)}
					</CardContent>
				</Card>

				{/* Footer */}
				<div className="text-center mt-6 text-sm text-muted-foreground">
					<p>Need help? Contact your system administrator</p>
				</div>
			</div>
		</div>
	);
}
