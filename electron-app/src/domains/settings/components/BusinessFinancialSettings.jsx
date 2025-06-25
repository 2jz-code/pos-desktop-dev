import React, { useEffect, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import {
	DollarSign,
	Save,
	X,
	Loader2,
	CheckCircle,
	AlertCircle,
	Info,
} from "lucide-react";
import { useBusinessSettingsStore } from "@/domains/settings/store/businessSettingsStore";
import { useToast } from "@/shared/components/ui/use-toast";

export const BusinessFinancialSettings = () => {
	const {
		financialSettings,
		isLoadingFinancial,
		financialError,
		fetchFinancialSettings,
		updateFinancialSettings,
	} = useBusinessSettingsStore();

	const [isEditing, setIsEditing] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [formData, setFormData] = useState({
		tax_rate: "",
		surcharge_percentage: "",
		currency: "USD",
	});
	const [formErrors, setFormErrors] = useState({});
	const { toast } = useToast();

	// Common currencies
	const currencies = [
		{ value: "USD", label: "USD ($)" },
		{ value: "EUR", label: "EUR (€)" },
		{ value: "GBP", label: "GBP (£)" },
		{ value: "CAD", label: "CAD ($)" },
		{ value: "AUD", label: "AUD ($)" },
		{ value: "JPY", label: "JPY (¥)" },
	];

	useEffect(() => {
		fetchFinancialSettings();
	}, [fetchFinancialSettings]);

	// Update form data when financial settings load
	useEffect(() => {
		if (financialSettings) {
			setFormData({
				tax_rate: (
					parseFloat(financialSettings.tax_rate || 0) * 100
				).toString(),
				surcharge_percentage: (
					parseFloat(financialSettings.surcharge_percentage || 0) * 100
				).toString(),
				currency: financialSettings.currency || "USD",
			});
		}
	}, [financialSettings]);

	const handleInputChange = (field, value) => {
		setFormData((prev) => ({ ...prev, [field]: value }));
		// Clear error for this field when user starts typing
		if (formErrors[field]) {
			setFormErrors((prev) => ({ ...prev, [field]: null }));
		}
	};

	const validateForm = () => {
		const errors = {};

		const taxRate = parseFloat(formData.tax_rate);
		if (isNaN(taxRate) || taxRate < 0 || taxRate > 100) {
			errors.tax_rate = "Tax rate must be between 0 and 100";
		}

		const surchargeRate = parseFloat(formData.surcharge_percentage);
		if (isNaN(surchargeRate) || surchargeRate < 0 || surchargeRate > 100) {
			errors.surcharge_percentage =
				"Surcharge percentage must be between 0 and 100";
		}

		if (!formData.currency) {
			errors.currency = "Currency is required";
		}

		setFormErrors(errors);
		return Object.keys(errors).length === 0;
	};

	const handleSave = async () => {
		if (!validateForm()) {
			return;
		}

		setIsSaving(true);
		try {
			// Convert percentages back to decimal values for the API
			// Use toFixed(6) to match Django's updated DecimalField(max_digits=8, decimal_places=6)
			// This preserves full precision while preventing floating-point errors
			const taxRateDecimal = (parseFloat(formData.tax_rate) / 100).toFixed(6);
			const surchargeDecimal = (
				parseFloat(formData.surcharge_percentage) / 100
			).toFixed(6);

			const dataToSave = {
				tax_rate: parseFloat(taxRateDecimal).toString(),
				surcharge_percentage: parseFloat(surchargeDecimal).toString(),
				currency: formData.currency,
			};

			await updateFinancialSettings(dataToSave);
			setIsEditing(false);
			toast({
				title: "Success",
				description: "Financial settings updated successfully",
				variant: "default",
			});
		} catch (error) {
			console.error("Failed to update financial settings:", error);
			toast({
				title: "Error",
				description: error.message || "Failed to update financial settings",
				variant: "destructive",
			});
		} finally {
			setIsSaving(false);
		}
	};

	const handleCancel = () => {
		// Reset form data to original values
		if (financialSettings) {
			setFormData({
				tax_rate: (
					parseFloat(financialSettings.tax_rate || 0) * 100
				).toString(),
				surcharge_percentage: (
					parseFloat(financialSettings.surcharge_percentage || 0) * 100
				).toString(),
				currency: financialSettings.currency || "USD",
			});
		}
		setFormErrors({});
		setIsEditing(false);
	};

	const hasChanges = () => {
		if (!financialSettings) return false;
		const currentTaxRate = (
			parseFloat(financialSettings.tax_rate || 0) * 100
		).toString();
		const currentSurcharge = (
			parseFloat(financialSettings.surcharge_percentage || 0) * 100
		).toString();
		const currentCurrency = financialSettings.currency || "USD";

		return (
			formData.tax_rate !== currentTaxRate ||
			formData.surcharge_percentage !== currentSurcharge ||
			formData.currency !== currentCurrency
		);
	};

	const formatPercentage = (value) => {
		if (!value) return "0%";
		return `${(parseFloat(value) * 100).toFixed(2)}%`;
	};

	if (isLoadingFinancial) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<DollarSign className="h-4 w-4" />
						Financial Settings
						<Badge
							variant="outline"
							className="flex items-center gap-1"
						>
							<CheckCircle className="h-3 w-3" />
							Editable
						</Badge>
					</CardTitle>
				</CardHeader>
				<CardContent className="flex items-center justify-center py-6">
					<div className="flex items-center gap-2">
						<Loader2 className="h-4 w-4 animate-spin" />
						<span>Loading financial settings...</span>
					</div>
				</CardContent>
			</Card>
		);
	}

	if (financialError) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<DollarSign className="h-4 w-4" />
						Financial Settings
						<Badge
							variant="outline"
							className="flex items-center gap-1"
						>
							<AlertCircle className="h-3 w-3" />
							Error
						</Badge>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<Alert variant="destructive">
						<AlertDescription>
							<strong>Error:</strong> {financialError}
						</AlertDescription>
					</Alert>
					<Button
						onClick={() => fetchFinancialSettings()}
						className="mt-4"
					>
						Retry
					</Button>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<DollarSign className="h-4 w-4" />
					Financial Settings
					<Badge
						variant="outline"
						className="flex items-center gap-1"
					>
						<CheckCircle className="h-3 w-3" />
						Editable
					</Badge>
				</CardTitle>
				<CardDescription>
					Tax rates and financial calculations applied to all transactions
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{!isEditing && (
					<Alert>
						<Info className="h-4 w-4" />
						<AlertDescription>
							These settings affect all transaction calculations across all
							terminals. Changes will apply to new transactions immediately.
						</AlertDescription>
					</Alert>
				)}

				{isEditing ? (
					<>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="tax_rate">Tax Rate (%)</Label>
								<Input
									id="tax_rate"
									value={formData.tax_rate}
									onChange={(e) =>
										handleInputChange("tax_rate", e.target.value)
									}
									placeholder="0.00"
									type="number"
									min="0"
									max="100"
									step="0.01"
									className={formErrors.tax_rate ? "border-destructive" : ""}
								/>
								{formErrors.tax_rate && (
									<p className="text-sm text-destructive">
										{formErrors.tax_rate}
									</p>
								)}
							</div>

							<div className="space-y-2">
								<Label htmlFor="surcharge_percentage">
									Surcharge Percentage (%)
								</Label>
								<Input
									id="surcharge_percentage"
									value={formData.surcharge_percentage}
									onChange={(e) =>
										handleInputChange("surcharge_percentage", e.target.value)
									}
									placeholder="0.00"
									type="number"
									min="0"
									max="100"
									step="0.01"
									className={
										formErrors.surcharge_percentage ? "border-destructive" : ""
									}
								/>
								{formErrors.surcharge_percentage && (
									<p className="text-sm text-destructive">
										{formErrors.surcharge_percentage}
									</p>
								)}
							</div>

							<div className="space-y-2">
								<Label htmlFor="currency">Currency</Label>
								<Select
									value={formData.currency}
									onValueChange={(value) =>
										handleInputChange("currency", value)
									}
								>
									<SelectTrigger
										className={formErrors.currency ? "border-destructive" : ""}
									>
										<SelectValue placeholder="Select currency" />
									</SelectTrigger>
									<SelectContent>
										{currencies.map((currency) => (
											<SelectItem
												key={currency.value}
												value={currency.value}
											>
												{currency.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{formErrors.currency && (
									<p className="text-sm text-destructive">
										{formErrors.currency}
									</p>
								)}
							</div>
						</div>

						<div className="flex justify-end gap-2 pt-4 border-t">
							<Button
								onClick={handleCancel}
								variant="outline"
								disabled={isSaving}
							>
								<X className="mr-2 h-4 w-4" />
								Cancel
							</Button>
							<Button
								onClick={handleSave}
								disabled={isSaving || !hasChanges()}
							>
								{isSaving ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<Save className="mr-2 h-4 w-4" />
								)}
								{isSaving ? "Saving..." : "Save Changes"}
							</Button>
						</div>
					</>
				) : (
					<>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="space-y-1">
								<label className="text-sm font-medium text-muted-foreground">
									Tax Rate
								</label>
								<p className="text-sm">
									{formatPercentage(financialSettings?.tax_rate)}
								</p>
							</div>

							<div className="space-y-1">
								<label className="text-sm font-medium text-muted-foreground">
									Surcharge Percentage
								</label>
								<p className="text-sm">
									{formatPercentage(financialSettings?.surcharge_percentage)}
								</p>
							</div>

							<div className="space-y-1">
								<label className="text-sm font-medium text-muted-foreground">
									Currency
								</label>
								<p className="text-sm">
									{financialSettings?.currency || "USD"}
								</p>
							</div>
						</div>

						<div className="flex justify-end pt-4 border-t">
							<Button
								onClick={() => setIsEditing(true)}
								variant="default"
							>
								Edit Financial Settings
							</Button>
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
};
