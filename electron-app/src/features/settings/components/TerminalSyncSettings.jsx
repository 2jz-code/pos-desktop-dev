import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Wifi, Save, RotateCcw, Loader2, Edit } from "lucide-react";

const TerminalSyncSettings = () => {
	const [settings, setSettings] = useState({
		syncIntervalMinutes: 5,
		autoSyncEnabled: true,
		backupIntervalMinutes: 30,
		autoBackupEnabled: true,
		maxBackupsToKeep: 10,
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
			// Load from localStorage first
			const stored = localStorage.getItem("posSettings");
			let loadedSettings = {};

			if (stored) {
				const fullSettings = JSON.parse(stored);
				loadedSettings = {
					syncIntervalMinutes: fullSettings.syncIntervalMinutes || 5,
					autoSyncEnabled:
						fullSettings.autoSyncEnabled !== undefined
							? fullSettings.autoSyncEnabled
							: true,
					backupIntervalMinutes: fullSettings.backupIntervalMinutes || 30,
					autoBackupEnabled:
						fullSettings.autoBackupEnabled !== undefined
							? fullSettings.autoBackupEnabled
							: true,
					maxBackupsToKeep: fullSettings.maxBackupsToKeep || 10,
				};
			}

			// Try to load from database if available
			if (window.dbApi) {
				try {
					const dbSettings = await window.dbApi.getSettings();
					if (dbSettings) {
						const syncDbSettings = {
							syncIntervalMinutes: dbSettings.syncIntervalMinutes,
							autoSyncEnabled: dbSettings.autoSyncEnabled,
							backupIntervalMinutes: dbSettings.backupIntervalMinutes,
							autoBackupEnabled: dbSettings.autoBackupEnabled,
							maxBackupsToKeep: dbSettings.maxBackupsToKeep,
						};
						loadedSettings = { ...loadedSettings, ...syncDbSettings };
					}
				} catch (error) {
					console.warn("Failed to load settings from database:", error);
				}
			}

			const finalSettings = { ...settings, ...loadedSettings };
			setSettings(finalSettings);
			setOriginalSettings(finalSettings);
		} catch (error) {
			console.error("Failed to load sync settings:", error);
			toast({
				title: "Error",
				description: "Failed to load sync settings",
				variant: "destructive",
			});
		}
	};

	const saveSettings = async () => {
		setIsSaving(true);
		try {
			// Load existing settings from localStorage
			const existingSettings = JSON.parse(
				localStorage.getItem("posSettings") || "{}"
			);

			// Merge sync settings with existing settings
			const updatedSettings = { ...existingSettings, ...settings };

			// Save to localStorage
			localStorage.setItem("posSettings", JSON.stringify(updatedSettings));

			// Save to database if available
			if (window.dbApi) {
				await window.dbApi.saveSettings(updatedSettings);
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
				description: "Sync settings saved successfully",
			});
		} catch (error) {
			console.error("Failed to save sync settings:", error);
			toast({
				title: "Error",
				description: "Failed to save sync settings",
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
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Wifi className="h-4 w-4" />
					Sync & Backup Settings
					<Badge
						variant="secondary"
						className="flex items-center gap-1"
					>
						<Edit className="h-3 w-3" />
						Terminal
					</Badge>
				</CardTitle>
				<CardDescription>
					Configure how often this terminal syncs with the backend and backs up
					local data
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{/* Sync Settings */}
				<div className="space-y-4">
					<h4 className="font-medium">Data Synchronization</h4>

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
								updateSetting("syncIntervalMinutes", parseInt(e.target.value))
							}
							disabled={!settings.autoSyncEnabled}
						/>
						<p className="text-sm text-muted-foreground">
							How often to sync data with the backend (1-60 minutes)
						</p>
					</div>
				</div>

				{/* Backup Settings */}
				<div className="space-y-4">
					<h4 className="font-medium">Local Backup</h4>

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
						<Label htmlFor="backupInterval">Backup Interval (minutes)</Label>
						<Input
							id="backupInterval"
							type="number"
							min="5"
							max="1440"
							value={settings.backupIntervalMinutes}
							onChange={(e) =>
								updateSetting("backupIntervalMinutes", parseInt(e.target.value))
							}
						/>
						<p className="text-sm text-muted-foreground">
							How often to backup local data (5-1440 minutes)
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
				</div>

				{/* Action Buttons */}
				{hasChanges && (
					<div className="flex justify-end gap-2 pt-4 border-t">
						<Button
							variant="outline"
							onClick={resetSettings}
							disabled={isSaving}
						>
							<RotateCcw className="mr-2 h-4 w-4" />
							Reset
						</Button>
						<Button
							onClick={saveSettings}
							disabled={isSaving}
						>
							{isSaving ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Saving...
								</>
							) : (
								<>
									<Save className="mr-2 h-4 w-4" />
									Save Changes
								</>
							)}
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
};

export default TerminalSyncSettings;
