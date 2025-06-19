import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";
import { Store, Receipt, Save, RotateCcw, Loader2 } from "lucide-react";

const StoreSettings = () => {
	const [settings, setSettings] = useState({
		// Store Settings
		storeName: "",
		storeAddress: "",
		storePhone: "",

		// Receipt Settings
		receiptHeader: "",
		receiptFooter: "Thank you for your business!",

		// Tax Settings
		defaultTaxRate: 0,
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
				const fullSettings = JSON.parse(stored);
				// Extract only store-related settings
				loadedSettings = {
					storeName: fullSettings.storeName || "",
					storeAddress: fullSettings.storeAddress || "",
					storePhone: fullSettings.storePhone || "",
					receiptHeader: fullSettings.receiptHeader || "",
					receiptFooter:
						fullSettings.receiptFooter || "Thank you for your business!",
					defaultTaxRate: fullSettings.defaultTaxRate || 0,
				};
			}

			// Try to load from database if available
			if (window.dbApi) {
				try {
					const dbSettings = await window.dbApi.getSettings();
					if (dbSettings) {
						// Extract only store-related settings from database
						const storeDbSettings = {
							storeName: dbSettings.storeName,
							storeAddress: dbSettings.storeAddress,
							storePhone: dbSettings.storePhone,
							receiptHeader: dbSettings.receiptHeader,
							receiptFooter: dbSettings.receiptFooter,
							defaultTaxRate: dbSettings.defaultTaxRate,
						};
						loadedSettings = { ...loadedSettings, ...storeDbSettings };
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
			// Load existing settings from localStorage
			const existingSettings = JSON.parse(
				localStorage.getItem("posSettings") || "{}"
			);

			// Merge store settings with existing settings
			const updatedSettings = { ...existingSettings, ...settings };

			// Save to localStorage
			localStorage.setItem("posSettings", JSON.stringify(updatedSettings));

			// Save to database if available
			if (window.dbApi) {
				await window.dbApi.saveSettings(updatedSettings);
			}

			setOriginalSettings(settings);
			setHasChanges(false);

			toast({
				title: "Success",
				description: "Store settings saved successfully",
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
			{/* Store Information */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Store className="h-4 w-4" />
						Store Information
					</CardTitle>
					<CardDescription>
						Configure your store's basic information
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="storeName">Store Name</Label>
						<Input
							id="storeName"
							value={settings.storeName}
							onChange={(e) => updateSetting("storeName", e.target.value)}
							placeholder="Your Store Name"
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="storeAddress">Store Address</Label>
						<Input
							id="storeAddress"
							value={settings.storeAddress}
							onChange={(e) => updateSetting("storeAddress", e.target.value)}
							placeholder="123 Main St, City, State 12345"
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="storePhone">Store Phone</Label>
						<Input
							id="storePhone"
							value={settings.storePhone}
							onChange={(e) => updateSetting("storePhone", e.target.value)}
							placeholder="(555) 123-4567"
						/>
					</div>
				</CardContent>
			</Card>

			{/* Receipt Settings */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Receipt className="h-4 w-4" />
						Receipt Settings
					</CardTitle>
					<CardDescription>
						Configure receipt headers, footers, and tax settings
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="receiptHeader">Receipt Header</Label>
						<Input
							id="receiptHeader"
							value={settings.receiptHeader}
							onChange={(e) => updateSetting("receiptHeader", e.target.value)}
							placeholder="Welcome to our store!"
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="receiptFooter">Receipt Footer</Label>
						<Input
							id="receiptFooter"
							value={settings.receiptFooter}
							onChange={(e) => updateSetting("receiptFooter", e.target.value)}
							placeholder="Thank you for your business!"
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="defaultTaxRate">Default Tax Rate (%)</Label>
						<Input
							id="defaultTaxRate"
							type="number"
							min="0"
							max="50"
							step="0.01"
							value={settings.defaultTaxRate}
							onChange={(e) =>
								updateSetting("defaultTaxRate", parseFloat(e.target.value))
							}
						/>
					</div>
				</CardContent>
			</Card>

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

export default StoreSettings;
