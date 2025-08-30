import React from "react";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import ReasonSelector from "./ReasonSelector";

export const ReasonInput = ({
	// Reason selector props
	reasonId,
	onReasonChange,
	reasonPlaceholder = "Select a reason",
	categoryFilter = null,
	showUsageStats = false,
	reasonRequired = true,
	reasonDisabled = false,
	
	// Detailed reason props  
	detailedReason,
	onDetailedReasonChange,
	detailedReasonPlaceholder = "Optional: Add specific details about this operation...",
	detailedReasonMaxLength = 500,
	detailedReasonRequired = false,
	detailedReasonDisabled = false,
	
	// Layout props
	layout = "stacked", // "stacked" or "side-by-side"
	
	// Labels and descriptions
	reasonLabel = "Reason",
	reasonDescription = null,
	detailedReasonLabel = "Additional Details",
	detailedReasonDescription = null,
}) => {
	const reasonField = (
		<div className="space-y-2">
			<Label htmlFor="reason">
				{reasonLabel}
				{reasonRequired && <span className="text-red-500 ml-1">*</span>}
			</Label>
			<ReasonSelector
				value={reasonId}
				onValueChange={onReasonChange}
				placeholder={reasonPlaceholder}
				categoryFilter={categoryFilter}
				showUsageStats={showUsageStats}
				disabled={reasonDisabled}
				required={reasonRequired}
			/>
			{reasonDescription && (
				<p className="text-sm text-muted-foreground">{reasonDescription}</p>
			)}
		</div>
	);

	const detailedReasonField = (
		<div className="space-y-2">
			<Label htmlFor="detailed-reason">
				{detailedReasonLabel}
				{detailedReasonRequired && <span className="text-red-500 ml-1">*</span>}
			</Label>
			<Textarea
				id="detailed-reason"
				value={detailedReason}
				onChange={(e) => onDetailedReasonChange?.(e.target.value)}
				placeholder={detailedReasonPlaceholder}
				maxLength={detailedReasonMaxLength}
				disabled={detailedReasonDisabled}
				rows={3}
				className="resize-none"
			/>
			<div className="flex justify-between text-xs text-muted-foreground">
				{detailedReasonDescription && (
					<span>{detailedReasonDescription}</span>
				)}
				<span>
					{detailedReason?.length || 0}/{detailedReasonMaxLength}
				</span>
			</div>
		</div>
	);

	if (layout === "side-by-side") {
		return (
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				{reasonField}
				{detailedReasonField}
			</div>
		);
	}

	// Default stacked layout
	return (
		<div className="space-y-4">
			{reasonField}
			{detailedReasonField}
		</div>
	);
};

export default ReasonInput;