import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	Loader2,
	RefreshCw,
	Download,
	Wifi,
	WifiOff,
	Database,
	Calendar,
	CheckCircle,
	XCircle,
	Trash2,
	Key,
	Eye,
	EyeOff,
	Copy,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/context/AuthContext";
import apiClient from "@/lib/apiClient";

const SyncManager = () => {
	const [syncStatus, setSyncStatus] = useState(null);
	const [apiKeyStatus, setApiKeyStatus] = useState({
		hasKey: false,
		loading: true,
	});
	const [showApiKey, setShowApiKey] = useState(false);
	const [generatedApiKey, setGeneratedApiKey] = useState("");
	const [operations, setOperations] = useState({
		initialSync: false,
		deltaSync: false,
		checkingOnline: false,
		insertingSample: false,
		generatingKey: false,
		revokingKey: false,
		resettingDatabase: false,
	});
	const { toast } = useToast();
	const { user } = useAuth();

	// Load sync status and API key status on component mount
	useEffect(() => {
		loadSyncStatus();
		loadApiKeyStatus();
	}, []);

	const loadSyncStatus = async () => {
		try {
			const status = await window.syncApi.getStatus();
			setSyncStatus(status);
		} catch (error) {
			console.error("Failed to load sync status:", error);
			toast({
				title: "Error",
				description: "Failed to load sync status",
				variant: "destructive",
			});
		}
	};

	const loadApiKeyStatus = async () => {
		if (!user) {
			setApiKeyStatus({ hasKey: false, loading: false });
			return;
		}

		try {
			const response = await apiClient.get("/users/api-key/status/");
			setApiKeyStatus({ hasKey: response.data.has_api_key, loading: false });
		} catch (error) {
			console.error("Failed to load API key status:", error);
			setApiKeyStatus({ hasKey: false, loading: false });
		}
	};

	const setOperationLoading = (operation, loading) => {
		setOperations((prev) => ({ ...prev, [operation]: loading }));
	};

	const handleGenerateApiKey = async () => {
		setOperationLoading("generatingKey", true);
		try {
			const response = await apiClient.post("/users/api-key/generate/");
			const newApiKey = response.data.api_key;

			setGeneratedApiKey(newApiKey);
			setShowApiKey(true);
			setApiKeyStatus({ hasKey: true, loading: false });

			// Set the API key in the sync service
			await window.syncApi.setAPIKey(newApiKey);

			toast({
				title: "Success",
				description: "API key generated and configured for sync service",
			});
		} catch (error) {
			console.error("Failed to generate API key:", error);
			toast({
				title: "Error",
				description: "Failed to generate API key",
				variant: "destructive",
			});
		} finally {
			setOperationLoading("generatingKey", false);
		}
	};

	const handleRevokeApiKey = async () => {
		setOperationLoading("revokingKey", true);
		try {
			await apiClient.post("/users/api-key/revoke/");
			setApiKeyStatus({ hasKey: false, loading: false });
			setGeneratedApiKey("");
			setShowApiKey(false);

			// Clear API key from sync service
			await window.syncApi.setAPIKey(null);

			toast({
				title: "Success",
				description: "API key revoked successfully",
			});
		} catch (error) {
			console.error("Failed to revoke API key:", error);
			toast({
				title: "Error",
				description: "Failed to revoke API key",
				variant: "destructive",
			});
		} finally {
			setOperationLoading("revokingKey", false);
		}
	};

	const handleCopyApiKey = () => {
		if (generatedApiKey) {
			navigator.clipboard.writeText(generatedApiKey);
			toast({
				title: "Copied",
				description: "API key copied to clipboard",
			});
		}
	};

	const handleInitialSync = async () => {
		if (!apiKeyStatus.hasKey) {
			toast({
				title: "API Key Required",
				description: "Please generate an API key first",
				variant: "destructive",
			});
			return;
		}

		setOperationLoading("initialSync", true);
		try {
			const result = await window.syncApi.performInitialSync();
			if (result.success) {
				toast({
					title: "Success",
					description: "Initial sync completed successfully",
				});
				await loadSyncStatus();
			} else {
				toast({
					title: "Sync Failed",
					description: result.error || "Unknown error occurred",
					variant: "destructive",
				});
			}
		} catch (error) {
			console.error("Initial sync failed:", error);
			toast({
				title: "Error",
				description: "Failed to perform initial sync",
				variant: "destructive",
			});
		} finally {
			setOperationLoading("initialSync", false);
		}
	};

	const handleDeltaSync = async () => {
		if (!apiKeyStatus.hasKey) {
			toast({
				title: "API Key Required",
				description: "Please generate an API key first",
				variant: "destructive",
			});
			return;
		}

		setOperationLoading("deltaSync", true);
		try {
			const result = await window.syncApi.performDeltaSync();
			if (result.success) {
				toast({
					title: "Success",
					description: "Delta sync completed successfully",
				});
				await loadSyncStatus();
			} else {
				toast({
					title: "Sync Failed",
					description: result.error || "Unknown error occurred",
					variant: "destructive",
				});
			}
		} catch (error) {
			console.error("Delta sync failed:", error);
			toast({
				title: "Error",
				description: "Failed to perform delta sync",
				variant: "destructive",
			});
		} finally {
			setOperationLoading("deltaSync", false);
		}
	};

	const handleCheckOnlineStatus = async () => {
		setOperationLoading("checkingOnline", true);
		try {
			const isOnline = await window.syncApi.checkOnlineStatus();
			setSyncStatus((prev) => ({ ...prev, isOnline }));
			toast({
				title: isOnline ? "Online" : "Offline",
				description: `Backend is ${isOnline ? "available" : "unavailable"}`,
				variant: isOnline ? "default" : "destructive",
			});
		} catch (error) {
			console.error("Failed to check online status:", error);
			toast({
				title: "Error",
				description: "Failed to check online status",
				variant: "destructive",
			});
		} finally {
			setOperationLoading("checkingOnline", false);
		}
	};

	const handleInsertSampleData = async () => {
		setOperationLoading("insertingSample", true);
		try {
			const result = await window.syncApi.insertSampleData();
			if (result.success) {
				toast({
					title: "Success",
					description: "Sample data inserted successfully",
				});
				await loadSyncStatus();
			} else {
				toast({
					title: "Failed",
					description: result.error || "Failed to insert sample data",
					variant: "destructive",
				});
			}
		} catch (error) {
			console.error("Failed to insert sample data:", error);
			toast({
				title: "Error",
				description: "Failed to insert sample data",
				variant: "destructive",
			});
		} finally {
			setOperationLoading("insertingSample", false);
		}
	};

	const handleResetDatabase = async () => {
		setOperationLoading("resettingDatabase", true);
		try {
			const result = await window.dbApi.reset();
			if (result.success) {
				toast({
					title: "Success",
					description:
						"Database reset successfully. You can now perform a sync.",
				});
				await loadSyncStatus();
			} else {
				toast({
					title: "Failed",
					description: "Failed to reset database",
					variant: "destructive",
				});
			}
		} catch (error) {
			console.error("Database reset failed:", error);
			toast({
				title: "Error",
				description: "Failed to reset database",
				variant: "destructive",
			});
		} finally {
			setOperationLoading("resettingDatabase", false);
		}
	};

	const handleTestCookies = async () => {
		try {
			console.log("[SyncManager] Testing cookie extraction...");
			const cookies = await window.syncApi.testCookies();

			if (cookies && cookies.trim()) {
				toast({
					title: "Cookies Found",
					description: `Found cookies: ${cookies.substring(0, 50)}${
						cookies.length > 50 ? "..." : ""
					}`,
				});
			} else {
				toast({
					title: "No Cookies Found",
					description:
						"No authentication cookies available. This is expected with HTTP-only cookies.",
					variant: "destructive",
				});
			}
		} catch (error) {
			console.error("Cookie test failed:", error);
			toast({
				title: "Error",
				description: "Failed to test cookies",
				variant: "destructive",
			});
		}
	};

	const formatDate = (dateString) => {
		if (!dateString) return "Never";
		try {
			return new Date(dateString).toLocaleString();
		} catch {
			return "Invalid date";
		}
	};

	if (!user) {
		return (
			<div className="space-y-6">
				<Alert>
					<XCircle className="h-4 w-4" />
					<AlertDescription>
						Please log in to access sync management features.
					</AlertDescription>
				</Alert>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* API Key Management */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Key className="h-5 w-5" />
						API Key Management
					</CardTitle>
					<CardDescription>
						Generate and manage API keys for secure sync service authentication
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{apiKeyStatus.loading ? (
						<div className="flex items-center gap-2">
							<Loader2 className="h-4 w-4 animate-spin" />
							<span>Loading API key status...</span>
						</div>
					) : (
						<>
							<div className="flex items-center gap-2">
								<span>Status:</span>
								<Badge
									variant={apiKeyStatus.hasKey ? "default" : "destructive"}
								>
									{apiKeyStatus.hasKey ? "API Key Active" : "No API Key"}
								</Badge>
							</div>

							{!apiKeyStatus.hasKey ? (
								<>
									<Alert>
										<Key className="h-4 w-4" />
										<AlertDescription>
											You need to generate an API key to use the sync service.
											This key will be used for secure authentication between
											the desktop app and the backend.
										</AlertDescription>
									</Alert>
									<Button
										onClick={handleGenerateApiKey}
										disabled={operations.generatingKey}
										className="w-full"
									>
										{operations.generatingKey ? (
											<>
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
												Generating API Key...
											</>
										) : (
											<>
												<Key className="mr-2 h-4 w-4" />
												Generate API Key
											</>
										)}
									</Button>
								</>
							) : (
								<div className="space-y-4">
									{showApiKey && generatedApiKey && (
										<div className="space-y-2">
											<Label>
												Your API Key (save this safely - it won't be shown
												again):
											</Label>
											<div className="flex gap-2">
												<Input
													type={showApiKey ? "text" : "password"}
													value={generatedApiKey}
													readOnly
													className="font-mono"
												/>
												<Button
													variant="outline"
													size="icon"
													onClick={() => setShowApiKey(!showApiKey)}
												>
													{showApiKey ? (
														<EyeOff className="h-4 w-4" />
													) : (
														<Eye className="h-4 w-4" />
													)}
												</Button>
												<Button
													variant="outline"
													size="icon"
													onClick={handleCopyApiKey}
												>
													<Copy className="h-4 w-4" />
												</Button>
											</div>
										</div>
									)}
									<Button
										onClick={handleRevokeApiKey}
										disabled={operations.revokingKey}
										variant="destructive"
									>
										{operations.revokingKey ? (
											<>
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
												Revoking API Key...
											</>
										) : (
											<>
												<Trash2 className="mr-2 h-4 w-4" />
												Revoke API Key
											</>
										)}
									</Button>
								</div>
							)}
						</>
					)}
				</CardContent>
			</Card>

			{/* Sync Status */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Database className="h-5 w-5" />
						Sync Status
					</CardTitle>
					<CardDescription>
						Current synchronization status and connection information
					</CardDescription>
				</CardHeader>
				<CardContent>
					{syncStatus ? (
						<div className="space-y-4">
							<div className="grid grid-cols-2 gap-4">
								<div className="flex items-center gap-2">
									{syncStatus.isOnline ? (
										<Wifi className="h-4 w-4 text-green-600" />
									) : (
										<WifiOff className="h-4 w-4 text-red-600" />
									)}
									<span>{syncStatus.isOnline ? "Online" : "Offline"}</span>
								</div>
								<div className="flex items-center gap-2">
									{syncStatus.hasData ? (
										<CheckCircle className="h-4 w-4 text-green-600" />
									) : (
										<XCircle className="h-4 w-4 text-red-600" />
									)}
									<span>
										{syncStatus.hasData ? "Has Local Data" : "No Local Data"}
									</span>
								</div>
							</div>

							<div className="flex items-center gap-2">
								<Calendar className="h-4 w-4" />
								<span>Last Sync: {formatDate(syncStatus.lastSync)}</span>
							</div>

							{syncStatus.dataCounts && (
								<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
									<div className="text-center">
										<div className="text-2xl font-bold">
											{syncStatus.dataCounts.products}
										</div>
										<div className="text-sm text-muted-foreground">
											Products
										</div>
									</div>
									<div className="text-center">
										<div className="text-2xl font-bold">
											{syncStatus.dataCounts.categories}
										</div>
										<div className="text-sm text-muted-foreground">
											Categories
										</div>
									</div>
									<div className="text-center">
										<div className="text-2xl font-bold">
											{syncStatus.dataCounts.users}
										</div>
										<div className="text-sm text-muted-foreground">Users</div>
									</div>
									<div className="text-center">
										<div className="text-2xl font-bold">
											{syncStatus.dataCounts.discounts}
										</div>
										<div className="text-sm text-muted-foreground">
											Discounts
										</div>
									</div>
								</div>
							)}
						</div>
					) : (
						<div className="flex items-center gap-2">
							<Loader2 className="h-4 w-4 animate-spin" />
							<span>Loading sync status...</span>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Sync Operations */}
			<Card>
				<CardHeader>
					<CardTitle>Sync Operations</CardTitle>
					<CardDescription>
						Manage data synchronization between the local database and backend
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<Button
							onClick={handleInitialSync}
							disabled={operations.initialSync || !apiKeyStatus.hasKey}
							className="w-full"
						>
							{operations.initialSync ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Syncing...
								</>
							) : (
								<>
									<Download className="mr-2 h-4 w-4" />
									Full Sync
								</>
							)}
						</Button>

						<Button
							onClick={handleDeltaSync}
							disabled={operations.deltaSync || !apiKeyStatus.hasKey}
							variant="outline"
							className="w-full"
						>
							{operations.deltaSync ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Syncing...
								</>
							) : (
								<>
									<RefreshCw className="mr-2 h-4 w-4" />
									Quick Sync
								</>
							)}
						</Button>

						<Button
							onClick={handleCheckOnlineStatus}
							disabled={operations.checkingOnline}
							variant="outline"
							className="w-full"
						>
							{operations.checkingOnline ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Checking...
								</>
							) : (
								<>
									<Wifi className="mr-2 h-4 w-4" />
									Check Connection
								</>
							)}
						</Button>

						<Button
							onClick={handleInsertSampleData}
							disabled={operations.insertingSample}
							variant="outline"
							className="w-full"
						>
							{operations.insertingSample ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Inserting...
								</>
							) : (
								<>
									<Database className="mr-2 h-4 w-4" />
									Insert Sample Data
								</>
							)}
						</Button>
					</div>

					{/* Debug Section */}
					<div className="border-t pt-4">
						<h4 className="text-sm font-medium mb-2">Debug Tools</h4>
						<div className="grid grid-cols-1 md:grid-cols-3 gap-2">
							<Button
								onClick={handleTestCookies}
								variant="outline"
								size="sm"
								className="w-full"
							>
								Test Cookies (Debug)
							</Button>
							<Button
								onClick={handleResetDatabase}
								disabled={operations.resettingDatabase}
								variant="destructive"
								size="sm"
								className="w-full"
							>
								{operations.resettingDatabase ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Resetting...
									</>
								) : (
									<>
										<Trash2 className="mr-2 h-4 w-4" />
										Reset Database
									</>
								)}
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
};

export default SyncManager;
