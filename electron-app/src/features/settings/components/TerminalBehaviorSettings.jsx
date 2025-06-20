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
import { Settings, Save, RotateCcw, Loader2, Edit } from "lucide-react";

const TerminalBehaviorSettings = () => {
	const [settings, setSettings] = useState({
		autoLockTimeout: 30,
		keyboardShortcuts: true,
		confirmOnDelete: true,
		debugMode: false,
		logLevel: "info",
		terminalNickname: "",
	});

	const [originalSettings, setOriginalSettings] = useState({});
	const [isSaving, setIsSaving] = useState(false);
	const [hasChanges, setHasChanges] = useState(false);
	const { toast } = useToast();

	useEffect(() => {
		loadSettings();
	}, []);

	useEffect(() => {
		const changed =
			JSON.stringify(settings) !== JSON.stringify(originalSettings);
		setHasChanges(changed);
	}, [settings, originalSettings]);

	const loadSettings = async () => {
		try {
			const stored = localStorage.getItem("posSettings");
			let loadedSettings = {};

			if (stored) {
				const fullSettings = JSON.parse(stored);
				loadedSettings = {
					autoLockTimeout: fullSettings.autoLockTimeout || 30,
					keyboardShortcuts:
						fullSettings.keyboardShortcuts !== undefined
							? fullSettings.keyboardShortcuts
							: true,
					confirmOnDelete:
						fullSettings.confirmOnDelete !== undefined
							? fullSettings.confirmOnDelete
							: true,
					debugMode:
						fullSettings.debugMode !== undefined
							? fullSettings.debugMode
							: false,
					logLevel: fullSettings.logLevel || "info",
					terminalNickname: fullSettings.terminalNickname || "",
				};
			}

			const finalSettings = { ...settings, ...loadedSettings };
			setSettings(finalSettings);
			setOriginalSettings(finalSettings);
		} catch (error) {
			console.error("Failed to load behavior settings:", error);
		}
	};

	const saveSettings = async () => {
		setIsSaving(true);
		try {
			const existingSettings = JSON.parse(
				localStorage.getItem("posSettings") || "{}"
			);
			const updatedSettings = { ...existingSettings, ...settings };
			localStorage.setItem("posSettings", JSON.stringify(updatedSettings));

			if (window.dbApi) {
				await window.dbApi.saveSettings(updatedSettings);
			}

			setOriginalSettings(settings);
			setHasChanges(false);

			toast({
				title: "Success",
				description: "Behavior settings saved successfully",
			});
		} catch (error) {
			console.error("Failed to save behavior settings:", error);
			toast({
				title: "Error",
				description: "Failed to save behavior settings",
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
					<Settings className="h-4 w-4" />
					Terminal Behavior
					<Badge
						variant="secondary"
						className="flex items-center gap-1"
					>
						<Edit className="h-3 w-3" />
						Terminal
					</Badge>
				</CardTitle>
				<CardDescription>
					Configure how this terminal behaves during operation
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div className="space-y-4">
						<h4 className="font-medium">Security & Access</h4>

						<div className="space-y-2">
							<Label htmlFor="autoLockTimeout">
								Auto-lock Timeout (minutes)
							</Label>
							<Input
								id="autoLockTimeout"
								type="number"
								min="5"
								max="120"
								value={settings.autoLockTimeout}
								onChange={(e) =>
									updateSetting("autoLockTimeout", parseInt(e.target.value))
								}
							/>
							<p className="text-sm text-muted-foreground">
								Time before terminal locks due to inactivity (5-120 minutes)
							</p>
						</div>

						<div className="flex items-center justify-between">
							<Label htmlFor="keyboardShortcuts">Keyboard Shortcuts</Label>
							<Switch
								id="keyboardShortcuts"
								checked={settings.keyboardShortcuts}
								onCheckedChange={(checked) =>
									updateSetting("keyboardShortcuts", checked)
								}
							/>
						</div>

						<div className="flex items-center justify-between">
							<Label htmlFor="confirmOnDelete">Confirm Deletions</Label>
							<Switch
								id="confirmOnDelete"
								checked={settings.confirmOnDelete}
								onCheckedChange={(checked) =>
									updateSetting("confirmOnDelete", checked)
								}
							/>
						</div>
					</div>

					<div className="space-y-4">
						<h4 className="font-medium">Terminal Identity</h4>

						<div className="space-y-2">
							<Label htmlFor="terminalNickname">Terminal Nickname</Label>
							<Input
								id="terminalNickname"
								placeholder="e.g., Front Counter, Kitchen Terminal"
								value={settings.terminalNickname}
								onChange={(e) =>
									updateSetting("terminalNickname", e.target.value)
								}
							/>
							<p className="text-sm text-muted-foreground">
								Friendly name to identify this terminal in reports and logs
							</p>
						</div>

						<h4 className="font-medium">Debug & Development</h4>

						<div className="flex items-center justify-between">
							<Label htmlFor="debugMode">Debug Mode</Label>
							<Switch
								id="debugMode"
								checked={settings.debugMode}
								onCheckedChange={(checked) =>
									updateSetting("debugMode", checked)
								}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="logLevel">Log Level</Label>
							<select
								id="logLevel"
								className="w-full p-2 border rounded"
								value={settings.logLevel}
								onChange={(e) => updateSetting("logLevel", e.target.value)}
							>
								<option value="error">Error</option>
								<option value="warn">Warning</option>
								<option value="info">Info</option>
								<option value="debug">Debug</option>
							</select>
							<p className="text-sm text-muted-foreground">
								Controls how much information is logged
							</p>
						</div>
					</div>
				</div>

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

export default TerminalBehaviorSettings;
