import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";
import {
	Wifi,
	HardDrive,
	Palette,
	Save,
	RotateCcw,
	Loader2,
} from "lucide-react";

const SystemSettings = () => {
	const [settings, setSettings] = useState({
		// Sync Settings (user configurable)
		syncIntervalMinutes: 5,
		autoSyncEnabled: true,

		// Backup Settings (user configurable)
		backupIntervalMinutes: 30,
		autoBackupEnabled: true,
		maxBackupsToKeep: 10,

		// UI Settings
		theme: "light",
		language: "en",
		currency: "USD",
	});

	const [originalSettings, setOriginalSettings] = useState({});
	const [isSaving, setIsSaving] = useState(false);
	const [hasChanges, setHasChanges] = useState(false);
	const { toast } = useToast();

	// Load settings on component mount
	useEffect(() => {
		loadSettings();
	}, []);

	// Track changes
	useEffect(() => {
		const changed =
			JSON.stringify(settings) !== JSON.stringify(originalSettings);
		setHasChanges(changed);
	}, [settings, originalSettings]);

	const loadSettings = async () => {
		try {
			// Load from localStorage first, then try database
			const stored = localStorage.getItem("posSettings");
			let loadedSettings = {};

			if (stored) {
				loadedSettings = JSON.parse(stored);
			}

			// Try to load from database if available
			if (window.dbApi) {
				try {
					const dbSettings = await window.dbApi.getSettings();
					if (dbSettings) {
						loadedSettings = { ...loadedSettings, ...dbSettings };
					}
				} catch (error) {
					console.warn("Failed to load settings from database:", error);
				}
			}

			// Merge with defaults
			const finalSettings = { ...settings, ...loadedSettings };
			setSettings(finalSettings);
			setOriginalSettings(finalSettings);
		} catch (error) {
			console.error("Failed to load settings:", error);
			toast({
				title: "Error",
				description: "Failed to load settings",
				variant: "destructive",
			});
		}
	};

	const saveSettings = async () => {
		setIsSaving(true);
		try {
			// Save to localStorage
			localStorage.setItem("posSettings", JSON.stringify(settings));

			// Save to database if available
			if (window.dbApi) {
				await window.dbApi.saveSettings(settings);
			}

			// Update sync service settings if they changed
			if (window.syncApi) {
				if (
					settings.syncIntervalMinutes !== originalSettings.syncIntervalMinutes
				) {
					await window.syncApi.setSyncInterval(settings.syncIntervalMinutes);
				}

				if (settings.autoSyncEnabled !== originalSettings.autoSyncEnabled) {
					await window.syncApi.setAutoSyncEnabled(settings.autoSyncEnabled);
				}
			}

			setOriginalSettings(settings);
			setHasChanges(false);

			toast({
				title: "Success",
				description: "Settings saved successfully",
			});
		} catch (error) {
			console.error("Failed to save settings:", error);
			toast({
				title: "Error",
				description: "Failed to save settings",
				variant: "destructive",
			});
		} finally {
			setIsSaving(false);
		}
	};

	const resetSettings = () => {
		setSettings(originalSettings);
		setHasChanges(false);
	};

	const updateSetting = (key, value) => {
		setSettings((prev) => ({ ...prev, [key]: value }));
	};

	return (
		<div className="space-y-6">
			<Tabs
				defaultValue="sync"
				className="w-full"
			>
				<TabsList className="grid w-full grid-cols-3">
					<TabsTrigger value="sync">Sync</TabsTrigger>
					<TabsTrigger value="backup">Backup</TabsTrigger>
					<TabsTrigger value="ui">Interface</TabsTrigger>
				</TabsList>

				{/* Sync Settings */}
				<TabsContent
					value="sync"
					className="space-y-4 mt-6"
				>
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Wifi className="h-4 w-4" />
								Synchronization Settings
							</CardTitle>
							<CardDescription>
								Configure how often data syncs with the backend
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex items-center justify-between">
								<Label htmlFor="autoSync">Enable Automatic Sync</Label>
								<Switch
									id="autoSync"
									checked={settings.autoSyncEnabled}
									onCheckedChange={(checked) =>
										updateSetting("autoSyncEnabled", checked)
									}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="syncInterval">Sync Interval (minutes)</Label>
								<Input
									id="syncInterval"
									type="number"
									min="1"
									max="60"
									value={settings.syncIntervalMinutes}
									onChange={(e) =>
										updateSetting(
											"syncIntervalMinutes",
											parseInt(e.target.value)
										)
									}
									disabled={!settings.autoSyncEnabled}
								/>
								<p className="text-sm text-muted-foreground">
									How often to sync data with the backend (1-60 minutes)
								</p>
							</div>
						</CardContent>
					</Card>
				</TabsContent>

				{/* Backup Settings */}
				<TabsContent
					value="backup"
					className="space-y-4 mt-6"
				>
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<HardDrive className="h-4 w-4" />
								Database Backup
							</CardTitle>
							<CardDescription>
								Configure automatic database backup settings
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex items-center justify-between">
								<Label htmlFor="autoBackup">Enable Automatic Backup</Label>
								<Switch
									id="autoBackup"
									checked={settings.autoBackupEnabled}
									onCheckedChange={(checked) =>
										updateSetting("autoBackupEnabled", checked)
									}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="backupInterval">
									Backup Interval (minutes)
								</Label>
								<Input
									id="backupInterval"
									type="number"
									min="5"
									max="1440"
									value={settings.backupIntervalMinutes}
									onChange={(e) =>
										updateSetting(
											"backupIntervalMinutes",
											parseInt(e.target.value)
										)
									}
									disabled={!settings.autoBackupEnabled}
								/>
								<p className="text-sm text-muted-foreground">
									How often to create database backups (5 minutes to 24 hours)
								</p>
							</div>

							<div className="space-y-2">
								<Label htmlFor="maxBackups">Maximum Backups to Keep</Label>
								<Input
									id="maxBackups"
									type="number"
									min="1"
									max="100"
									value={settings.maxBackupsToKeep}
									onChange={(e) =>
										updateSetting("maxBackupsToKeep", parseInt(e.target.value))
									}
								/>
								<p className="text-sm text-muted-foreground">
									Number of backup files to retain (older backups are deleted)
								</p>
							</div>
						</CardContent>
					</Card>
				</TabsContent>

				{/* UI Settings */}
				<TabsContent
					value="ui"
					className="space-y-4 mt-6"
				>
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Palette className="h-4 w-4" />
								Interface Preferences
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="theme">Theme</Label>
								<select
									id="theme"
									className="w-full p-2 border rounded"
									value={settings.theme}
									onChange={(e) => updateSetting("theme", e.target.value)}
								>
									<option value="light">Light</option>
									<option value="dark">Dark</option>
									<option value="system">System</option>
								</select>
							</div>

							<div className="space-y-2">
								<Label htmlFor="language">Language</Label>
								<select
									id="language"
									className="w-full p-2 border rounded"
									value={settings.language}
									onChange={(e) => updateSetting("language", e.target.value)}
								>
									<option value="en">English</option>
									<option value="es">Spanish</option>
									<option value="fr">French</option>
								</select>
							</div>

							<div className="space-y-2">
								<Label htmlFor="currency">Currency</Label>
								<select
									id="currency"
									className="w-full p-2 border rounded"
									value={settings.currency}
									onChange={(e) => updateSetting("currency", e.target.value)}
								>
									<option value="USD">USD ($)</option>
									<option value="EUR">EUR (€)</option>
									<option value="GBP">GBP (£)</option>
									<option value="CAD">CAD (C$)</option>
								</select>
							</div>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>

			{/* Action Buttons */}
			<div className="flex items-center justify-between pt-4 border-t bg-background sticky bottom-0 z-10">
				<div className="flex items-center gap-2">
					{hasChanges && (
						<Alert className="flex-1">
							<AlertDescription>You have unsaved changes</AlertDescription>
						</Alert>
					)}
				</div>

				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						onClick={resetSettings}
						disabled={!hasChanges || isSaving}
					>
						<RotateCcw className="mr-2 h-4 w-4" />
						Reset
					</Button>

					<Button
						onClick={saveSettings}
						disabled={!hasChanges || isSaving}
					>
						{isSaving ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<Save className="mr-2 h-4 w-4" />
						)}
						Save Settings
					</Button>
				</div>
			</div>
		</div>
	);
};

export default SystemSettings;
