import React from "react";
import { ReasonSelector } from "./ReasonSelector";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { MessageSquare, Tag } from "lucide-react";

interface ReasonInputProps {
	// Reason selector props
	reasonValue?: string;
	onReasonChange: (value: string) => void;
	reasonPlaceholder?: string;
	categoryFilter?: string;
	reasonDisabled?: boolean;
	
	// Detailed reason props
	detailedReasonValue?: string;
	onDetailedReasonChange: (value: string) => void;
	detailedReasonPlaceholder?: string;
	detailedReasonDisabled?: boolean;
	maxLength?: number;
	
	// Layout props
	layout?: "stacked" | "side-by-side";
	className?: string;
	required?: boolean;
	
	// Labels and descriptions
	reasonLabel?: string;
	detailedReasonLabel?: string;
	reasonDescription?: string;
	detailedReasonDescription?: string;
	
	// Display options
	showUsageStats?: boolean;
	showCategoryBadges?: boolean;
}

export const ReasonInput: React.FC<ReasonInputProps> = ({
	reasonValue,
	onReasonChange,
	reasonPlaceholder = "Select a reason...",
	categoryFilter,
	reasonDisabled = false,
	
	detailedReasonValue = "",
	onDetailedReasonChange,
	detailedReasonPlaceholder = "Optional: Add more details about this stock action...",
	detailedReasonDisabled = false,
	maxLength = 500,
	
	layout = "stacked",
	className = "",
	required = false,
	
	reasonLabel = "Reason",
	detailedReasonLabel = "Additional Details",
	reasonDescription = "Select the primary reason for this stock action.",
	detailedReasonDescription = "Provide additional context or notes about this operation.",
	
	showUsageStats = true,
	showCategoryBadges = true,
}) => {
	const containerClassName = layout === "side-by-side" 
		? `grid grid-cols-1 lg:grid-cols-2 gap-4 ${className}`
		: `space-y-4 ${className}`;

	return (
		<div className={containerClassName}>
			{/* Reason Selector */}
			<div className="space-y-2">
				<Label className="flex items-center gap-2">
					<Tag className="h-4 w-4" />
					{reasonLabel}
					{required && <span className="text-destructive">*</span>}
				</Label>
				<ReasonSelector
					value={reasonValue}
					onValueChange={onReasonChange}
					placeholder={reasonPlaceholder}
					categoryFilter={categoryFilter}
					disabled={reasonDisabled}
					showUsageStats={showUsageStats}
					showCategoryBadges={showCategoryBadges}
					className="w-full"
				/>
				{reasonDescription && (
					<p className="text-sm text-muted-foreground">{reasonDescription}</p>
				)}
			</div>

			{/* Detailed Reason Input */}
			<div className="space-y-2">
				<Label className="flex items-center gap-2">
					<MessageSquare className="h-4 w-4" />
					{detailedReasonLabel}
					<span className="text-xs text-muted-foreground ml-1">(Optional)</span>
				</Label>
				<Textarea
					value={detailedReasonValue}
					onChange={(e) => onDetailedReasonChange(e.target.value)}
					placeholder={detailedReasonPlaceholder}
					disabled={detailedReasonDisabled}
					maxLength={maxLength}
					className="min-h-[80px] resize-none"
				/>
				<div className="flex justify-between items-center text-xs text-muted-foreground">
					<span>{detailedReasonDescription}</span>
					<span>{detailedReasonValue.length}/{maxLength}</span>
				</div>
			</div>
		</div>
	);
};

// React Hook Form integration component
interface ReasonFormFieldsProps {
	control: any;
	reasonName?: string;
	detailedReasonName?: string;
	categoryFilter?: string;
	required?: boolean;
	layout?: "stacked" | "side-by-side";
	className?: string;
}

export const ReasonFormFields: React.FC<ReasonFormFieldsProps> = ({
	control,
	reasonName = "reason_id",
	detailedReasonName = "detailed_reason",
	categoryFilter,
	required = false,
	layout = "stacked",
	className = "",
}) => {
	const containerClassName = layout === "side-by-side" 
		? `grid grid-cols-1 lg:grid-cols-2 gap-4 ${className}`
		: `space-y-4 ${className}`;

	return (
		<div className={containerClassName}>
			{/* Reason Selector Field */}
			<FormField
				control={control}
				name={reasonName}
				render={({ field }) => (
					<FormItem>
						<FormLabel className="flex items-center gap-2">
							<Tag className="h-4 w-4" />
							Reason
							{required && <span className="text-destructive">*</span>}
						</FormLabel>
						<FormControl>
							<ReasonSelector
								value={field.value}
								onValueChange={field.onChange}
								categoryFilter={categoryFilter}
								showUsageStats={true}
								showCategoryBadges={true}
								className="w-full"
							/>
						</FormControl>
						<FormDescription>
							Select the primary reason for this stock action.
						</FormDescription>
						<FormMessage />
					</FormItem>
				)}
			/>

			{/* Detailed Reason Field */}
			<FormField
				control={control}
				name={detailedReasonName}
				render={({ field }) => (
					<FormItem>
						<FormLabel className="flex items-center gap-2">
							<MessageSquare className="h-4 w-4" />
							Additional Details
							<span className="text-xs text-muted-foreground ml-1">(Optional)</span>
						</FormLabel>
						<FormControl>
							<Textarea
								{...field}
								placeholder="Optional: Add more details about this stock action..."
								maxLength={500}
								className="min-h-[80px] resize-none"
							/>
						</FormControl>
						<FormDescription className="flex justify-between items-center">
							<span>Provide additional context or notes about this operation.</span>
							<span className="text-xs">{field.value?.length || 0}/500</span>
						</FormDescription>
						<FormMessage />
					</FormItem>
				)}
			/>
		</div>
	);
};