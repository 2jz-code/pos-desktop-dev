import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	Loader2,
	Database,
	RefreshCw,
	Download,
	AlertTriangle,
} from "lucide-react";

const RecoveryDialog = ({ isOpen, onClose, onRecoveryComplete }) => {
	const [isRecovering, setIsRecovering] = useState(false);
	const [recoveryStep, setRecoveryStep] = useState(null);
	const [recoveryResult, setRecoveryResult] = useState(null);

	const handleRecovery = async (method) => {
		setIsRecovering(true);
		setRecoveryStep(method);
		setRecoveryResult(null);

		try {
			let result;
			switch (method) {
				case "backup":
					setRecoveryStep("Restoring from backup...");
					// Attempt to restore from backup
					result = await window.dbApi.invoke("db:restore-from-backup");
					break;

				case "sync":
					setRecoveryStep("Performing full sync from server...");
					// Perform full sync from Django backend
					result = await window.syncApi.performInitialSync();
					break;

				case "sample":
					setRecoveryStep("Loading sample data...");
					// Load sample data as last resort
					result = await window.syncApi.insertSampleData();
					break;

				case "reset":
					setRecoveryStep("Resetting database...");
					// Complete database reset
					await window.dbApi.reset();
					result = await window.syncApi.insertSampleData();
					break;
			}

			if (result?.success) {
				setRecoveryResult({
					success: true,
					message: "Recovery completed successfully!",
				});
				setTimeout(() => {
					onRecoveryComplete?.();
				}, 2000);
			} else {
				setRecoveryResult({
					success: false,
					message: result?.error || "Recovery failed",
				});
			}
		} catch (error) {
			console.error("Recovery failed:", error);
			setRecoveryResult({ success: false, message: error.message });
		} finally {
			setIsRecovering(false);
			setRecoveryStep(null);
		}
	};

	return (
		<Dialog
			open={isOpen}
			onOpenChange={onClose}
		>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<AlertTriangle
							className="text-red-500"
							size={20}
						/>
						Database Recovery Required
					</DialogTitle>
				</DialogHeader>

				<div className="space-y-4">
					<Alert>
						<AlertDescription>
							The local database is unavailable or corrupted. Choose a recovery
							option:
						</AlertDescription>
					</Alert>

					{recoveryResult && (
						<Alert variant={recoveryResult.success ? "default" : "destructive"}>
							<AlertDescription>{recoveryResult.message}</AlertDescription>
						</Alert>
					)}

					{isRecovering ? (
						<div className="flex items-center justify-center py-8">
							<div className="text-center">
								<Loader2
									className="animate-spin mx-auto mb-2"
									size={32}
								/>
								<p>{recoveryStep}</p>
							</div>
						</div>
					) : (
						<div className="space-y-2">
							<Button
								onClick={() => handleRecovery("backup")}
								className="w-full justify-start"
								variant="outline"
							>
								<Database
									className="mr-2"
									size={16}
								/>
								Restore from Backup
							</Button>

							<Button
								onClick={() => handleRecovery("sync")}
								className="w-full justify-start"
								variant="outline"
							>
								<RefreshCw
									className="mr-2"
									size={16}
								/>
								Sync from Server
							</Button>

							<Button
								onClick={() => handleRecovery("sample")}
								className="w-full justify-start"
								variant="outline"
							>
								<Download
									className="mr-2"
									size={16}
								/>
								Load Sample Data
							</Button>

							<Button
								onClick={() => handleRecovery("reset")}
								className="w-full justify-start"
								variant="destructive"
							>
								<AlertTriangle
									className="mr-2"
									size={16}
								/>
								Reset Database
							</Button>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
};

export default RecoveryDialog;
