import React, { useState, useEffect } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { useToast } from "@/shared/components/ui/use-toast";
import { Monitor, Save, RotateCcw, Loader2, Edit } from "lucide-react";

export const TerminalDisplaySettings = () => {
	const [settings, setSettings] = useState({
		theme: "light",
		language: "en",
		fontSize: "medium",
		displayTimeout: 5,
		soundEnabled: true,
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
					theme: fullSettings.theme || "light",
					language: fullSettings.language || "en",
					fontSize: fullSettings.fontSize || "medium",
					displayTimeout: fullSettings.displayTimeout || 5,
					soundEnabled:
						fullSettings.soundEnabled !== undefined
							? fullSettings.soundEnabled
							: true,
				};
			}

			const finalSettings = { ...settings, ...loadedSettings };
			setSettings(finalSettings);
			setOriginalSettings(finalSettings);
		} catch (error) {
			console.error("Failed to load display settings:", error);
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
				description: "Display settings saved successfully",
			});
		} catch (error) {
			console.error("Failed to save display settings:", error);
			toast({
				title: "Error",
				description: "Failed to save display settings",
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
					<Monitor className="h-4 w-4" />
					Display & Accessibility
					<Badge
						variant="secondary"
						className="flex items-center gap-1"
					>
						<Edit className="h-3 w-3" />
						Terminal
					</Badge>
				</CardTitle>
				<CardDescription>
					Customize display preferences and accessibility settings for this
					terminal
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div className="space-y-4">
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
							<Label htmlFor="fontSize">Font Size</Label>
							<select
								id="fontSize"
								className="w-full p-2 border rounded"
								value={settings.fontSize}
								onChange={(e) => updateSetting("fontSize", e.target.value)}
							>
								<option value="small">Small</option>
								<option value="medium">Medium</option>
								<option value="large">Large</option>
							</select>
						</div>
					</div>

					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="displayTimeout">Screen Timeout (minutes)</Label>
							<Input
								id="displayTimeout"
								type="number"
								min="1"
								max="60"
								value={settings.displayTimeout}
								onChange={(e) =>
									updateSetting("displayTimeout", parseInt(e.target.value))
								}
							/>
							<p className="text-sm text-muted-foreground">
								Time before screen dims (1-60 minutes)
							</p>
						</div>

						<div className="flex items-center justify-between">
							<Label htmlFor="soundEnabled">Sound Effects</Label>
							<Switch
								id="soundEnabled"
								checked={settings.soundEnabled}
								onCheckedChange={(checked) =>
									updateSetting("soundEnabled", checked)
								}
							/>
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
