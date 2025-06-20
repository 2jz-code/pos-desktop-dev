import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
	Receipt,
	Save,
	X,
	Loader2,
	CheckCircle,
	AlertCircle,
	Info,
} from "lucide-react";
import { useBusinessSettingsStore } from "../../../store/businessSettingsStore";
import { useToast } from "@/components/ui/use-toast";

const BusinessReceiptSettings = () => {
	const {
		receiptConfig,
		isLoadingReceipt,
		receiptError,
		fetchReceiptConfig,
		updateReceiptConfig,
	} = useBusinessSettingsStore();

	const [isEditing, setIsEditing] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [formData, setFormData] = useState({
		receipt_header: "",
		receipt_footer: "",
	});
	const { toast } = useToast();

	useEffect(() => {
		fetchReceiptConfig();
	}, [fetchReceiptConfig]);

	// Update form data when receipt config loads
	useEffect(() => {
		if (receiptConfig) {
			setFormData({
				receipt_header: receiptConfig.receipt_header || "",
				receipt_footer: receiptConfig.receipt_footer || "",
			});
		}
	}, [receiptConfig]);

	const handleInputChange = (field, value) => {
		setFormData((prev) => ({ ...prev, [field]: value }));
	};

	const handleSave = async () => {
		setIsSaving(true);
		try {
			await updateReceiptConfig(formData);
			setIsEditing(false);
			toast({
				title: "Success",
				description: "Receipt configuration updated successfully",
				variant: "default",
			});
		} catch (error) {
			console.error("Failed to update receipt config:", error);
			toast({
				title: "Error",
				description: error.message || "Failed to update receipt configuration",
				variant: "destructive",
			});
		} finally {
			setIsSaving(false);
		}
	};

	const handleCancel = () => {
		// Reset form data to original values
		if (receiptConfig) {
			setFormData({
				receipt_header: receiptConfig.receipt_header || "",
				receipt_footer: receiptConfig.receipt_footer || "",
			});
		}
		setIsEditing(false);
	};

	const hasChanges = () => {
		if (!receiptConfig) return false;
		return (
			formData.receipt_header !== (receiptConfig.receipt_header || "") ||
			formData.receipt_footer !== (receiptConfig.receipt_footer || "")
		);
	};

	if (isLoadingReceipt) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Receipt className="h-4 w-4" />
						Receipt Configuration
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
						<span>Loading receipt configuration...</span>
					</div>
				</CardContent>
			</Card>
		);
	}

	if (receiptError) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Receipt className="h-4 w-4" />
						Receipt Configuration
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
							<strong>Error:</strong> {receiptError}
						</AlertDescription>
					</Alert>
					<Button
						onClick={() => fetchReceiptConfig()}
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
					<Receipt className="h-4 w-4" />
					Receipt Configuration
					<Badge
						variant="outline"
						className="flex items-center gap-1"
					>
						<CheckCircle className="h-3 w-3" />
						Editable
					</Badge>
				</CardTitle>
				<CardDescription>
					Customize receipt appearance and printing behavior
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{!isEditing && (
					<Alert>
						<Info className="h-4 w-4" />
						<AlertDescription>
							Receipt configuration affects all terminals. Changes will apply to
							new receipts immediately.
						</AlertDescription>
					</Alert>
				)}

				{isEditing ? (
					<>
						<div className="grid grid-cols-1 gap-4">
							<div className="space-y-2">
								<Label htmlFor="receipt_header">Receipt Header</Label>
								<Textarea
									id="receipt_header"
									value={formData.receipt_header}
									onChange={(e) =>
										handleInputChange("receipt_header", e.target.value)
									}
									placeholder="Enter text to appear at the top of receipts..."
									rows={3}
								/>
								<p className="text-xs text-muted-foreground">
									This text will appear at the top of every receipt. You can
									include store name, welcome message, etc.
								</p>
							</div>

							<div className="space-y-2">
								<Label htmlFor="receipt_footer">Receipt Footer</Label>
								<Textarea
									id="receipt_footer"
									value={formData.receipt_footer}
									onChange={(e) =>
										handleInputChange("receipt_footer", e.target.value)
									}
									placeholder="Enter text to appear at the bottom of receipts..."
									rows={3}
								/>
								<p className="text-xs text-muted-foreground">
									This text will appear at the bottom of every receipt. Common
									uses: thank you message, return policy, contact info.
								</p>
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
						<div className="grid grid-cols-1 gap-4">
							<div className="space-y-1">
								<label className="text-sm font-medium text-muted-foreground">
									Receipt Header
								</label>
								<div className="p-3 bg-muted rounded border min-h-[60px]">
									{receiptConfig?.receipt_header ? (
										<p className="text-sm font-mono whitespace-pre-wrap">
											{receiptConfig.receipt_header}
										</p>
									) : (
										<p className="text-sm text-muted-foreground italic">
											No header text set
										</p>
									)}
								</div>
							</div>

							<div className="space-y-1">
								<label className="text-sm font-medium text-muted-foreground">
									Receipt Footer
								</label>
								<div className="p-3 bg-muted rounded border min-h-[60px]">
									{receiptConfig?.receipt_footer ? (
										<p className="text-sm font-mono whitespace-pre-wrap">
											{receiptConfig.receipt_footer}
										</p>
									) : (
										<p className="text-sm text-muted-foreground italic">
											No footer text set
										</p>
									)}
								</div>
							</div>
						</div>

						<div className="flex justify-end pt-4 border-t">
							<Button
								onClick={() => setIsEditing(true)}
								variant="default"
							>
								Edit Receipt Configuration
							</Button>
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
};

export default BusinessReceiptSettings;
