import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
	getApprovalPolicyByLocation,
	updateApprovalPolicy,
} from "@/services/api/approvalsService";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { ShieldAlert, AlertTriangle, Check } from "lucide-react";

interface ApprovalPolicySettingsProps {
	locationId: string;
}

export default function ApprovalPolicySettings({
	locationId,
}: ApprovalPolicySettingsProps) {
	const queryClient = useQueryClient();

	const {
		data: policy,
		isLoading,
		error,
	} = useQuery({
		queryKey: ["approvalPolicy", locationId],
		queryFn: async () => {
			console.log("Fetching approval policy for location:", locationId);
			const result = await getApprovalPolicyByLocation(locationId);
			console.log("Approval policy result:", result);
			return result;
		},
		enabled: !!locationId,
	});

	// Local state for form values
	const [formValues, setFormValues] = useState({
		max_discount_percent: 15,
		max_fixed_discount_amount: 20,
		max_refund_amount: 50,
		max_price_override_amount: 50,
		max_void_order_amount: 100,
		always_require_approval_for: [] as string[],
		allow_self_approval: false,
	});

	// Track which field was last saved
	const [lastSavedField, setLastSavedField] = useState<string | null>(null);

	// Update local state when policy loads
	useEffect(() => {
		if (policy) {
			setFormValues({
				max_discount_percent: Number(policy.max_discount_percent) || 15,
				max_fixed_discount_amount: Number(policy.max_fixed_discount_amount) || 20,
				max_refund_amount: Number(policy.max_refund_amount) || 50,
				max_price_override_amount:
					Number(policy.max_price_override_amount) || 50,
				max_void_order_amount: Number(policy.max_void_order_amount) || 100,
				always_require_approval_for: policy.always_require_approval_for || [],
				allow_self_approval: policy.allow_self_approval || false,
			});
		}
	}, [policy]);

	const mutation = useMutation({
		mutationFn: (values: typeof formValues) => {
			if (!policy?.id) {
				throw new Error("Policy ID not found");
			}
			return updateApprovalPolicy(policy.id, values);
		},
		onSuccess: (data, variables) => {
			queryClient.invalidateQueries({
				queryKey: ["approvalPolicy", locationId],
			});
			toast.success("Approval policy updated successfully!");
			// Clear the saved field indicator after 2 seconds
			setTimeout(() => setLastSavedField(null), 2000);
		},
		onError: (error: Error) => {
			toast.error(`Failed to update policy: ${error.message}`);
			setLastSavedField(null);
		},
	});

	const handleFieldChange = (field: string, value: any) => {
		setFormValues((prev) => ({ ...prev, [field]: value }));
	};

	const handleFieldBlur = (field: string) => {
		// Save the entire form when a field loses focus
		setLastSavedField(field);
		mutation.mutate(formValues);
	};

	const toggleAlwaysRequireApproval = (actionType: string, enabled: boolean) => {
		setFormValues((prev) => {
			const newList = enabled
				? [...prev.always_require_approval_for, actionType]
				: prev.always_require_approval_for.filter((type) => type !== actionType);

			const newValues = { ...prev, always_require_approval_for: newList };
			// Save immediately
			setLastSavedField(`always_require_${actionType}`);
			mutation.mutate(newValues);
			return newValues;
		});
	};

	const isAlwaysRequired = (actionType: string) => {
		return formValues.always_require_approval_for.includes(actionType);
	};

	if (isLoading) {
		return (
			<Card className="border-border bg-card">
				<CardContent className="pt-6">
					<div className="flex items-center justify-center py-8">
						<div className="text-center">
							<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
							<p className="mt-2 text-sm text-muted-foreground">
								Loading approval policy...
							</p>
						</div>
					</div>
				</CardContent>
			</Card>
		);
	}

	if (error) {
		return (
			<Alert variant="destructive">
				<AlertTriangle className="h-4 w-4" />
				<AlertDescription>
					Failed to load approval policy. Please try again.
				</AlertDescription>
			</Alert>
		);
	}

	if (!policy) {
		return (
			<Alert>
				<ShieldAlert className="h-4 w-4" />
				<AlertDescription>
					<strong>No approval policy found for this location.</strong>
					<br />
					An approval policy will be created automatically when you save this
					form. Default thresholds will be applied, and you can customize them
					after saving.
				</AlertDescription>
			</Alert>
		);
	}

	return (
		<Card className="border-border bg-card">
			<CardHeader>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
							<ShieldAlert className="h-4 w-4 text-orange-600 dark:text-orange-400" />
						</div>
						<div>
							<CardTitle className="text-foreground">
								Approval Policy Configuration
							</CardTitle>
							<CardDescription>
								Configure thresholds that require manager approval. Changes are
								saved automatically.
							</CardDescription>
						</div>
					</div>
					{mutation.isPending && (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
							Saving...
						</div>
					)}
				</div>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="space-y-4">
					<h3 className="text-sm font-semibold text-foreground">
						Threshold Settings
					</h3>
					<p className="text-sm text-muted-foreground">
						Operations exceeding these thresholds will require manager approval
						with PIN verification.
					</p>

					{/* Max Discount Percentage */}
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<Label htmlFor="max_discount_percent">
								Maximum Discount Percentage
								{lastSavedField === "max_discount_percent" && (
									<Check className="inline h-3 w-3 ml-2 text-green-600" />
								)}
							</Label>
							<div className="flex items-center gap-2">
								<Label
									htmlFor="always_discount"
									className="text-sm font-normal text-muted-foreground"
								>
									Always require
								</Label>
								<Switch
									id="always_discount"
									checked={isAlwaysRequired("DISCOUNT")}
									onCheckedChange={(checked) =>
										toggleAlwaysRequireApproval("DISCOUNT", checked)
									}
								/>
								{lastSavedField === "always_require_DISCOUNT" && (
									<Check className="h-3 w-3 text-green-600" />
								)}
							</div>
						</div>
						{!isAlwaysRequired("DISCOUNT") && (
							<div className="relative">
								<Input
									id="max_discount_percent"
									type="number"
									step="0.01"
									min="0"
									max="100"
									value={formValues.max_discount_percent}
									onChange={(e) =>
										handleFieldChange(
											"max_discount_percent",
											Number(e.target.value)
										)
									}
									onBlur={() => handleFieldBlur("max_discount_percent")}
								/>
								<span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
									%
								</span>
							</div>
						)}
						<p className="text-sm text-muted-foreground">
							{isAlwaysRequired("DISCOUNT")
								? "All discounts will require manager approval regardless of percentage."
								: "Percentage discounts exceeding this value will require manager approval."}
						</p>
					</div>

					{/* Max Fixed Discount Amount */}
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<Label htmlFor="max_fixed_discount_amount">
								Maximum Fixed Discount Amount
								{lastSavedField === "max_fixed_discount_amount" && (
									<Check className="inline h-3 w-3 ml-2 text-green-600" />
								)}
							</Label>
						</div>
						{!isAlwaysRequired("DISCOUNT") && (
							<div className="relative">
								<span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
									$
								</span>
								<Input
									id="max_fixed_discount_amount"
									type="number"
									step="0.01"
									min="0"
									className="pl-7"
									value={formValues.max_fixed_discount_amount}
									onChange={(e) =>
										handleFieldChange(
											"max_fixed_discount_amount",
											Number(e.target.value)
										)
									}
									onBlur={() => handleFieldBlur("max_fixed_discount_amount")}
								/>
							</div>
						)}
						<p className="text-sm text-muted-foreground">
							{isAlwaysRequired("DISCOUNT")
								? "Controlled by 'Always require' toggle for discounts above."
								: "Fixed amount discounts exceeding this value will require manager approval."}
						</p>
					</div>

					{/* Max Refund Amount */}
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<Label htmlFor="max_refund_amount">
								Maximum Refund Amount
								{lastSavedField === "max_refund_amount" && (
									<Check className="inline h-3 w-3 ml-2 text-green-600" />
								)}
							</Label>
							<div className="flex items-center gap-2">
								<Label
									htmlFor="always_refund"
									className="text-sm font-normal text-muted-foreground"
								>
									Always require
								</Label>
								<Switch
									id="always_refund"
									checked={isAlwaysRequired("REFUND")}
									onCheckedChange={(checked) =>
										toggleAlwaysRequireApproval("REFUND", checked)
									}
								/>
								{lastSavedField === "always_require_REFUND" && (
									<Check className="h-3 w-3 text-green-600" />
								)}
							</div>
						</div>
						{!isAlwaysRequired("REFUND") && (
							<div className="relative">
								<span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
									$
								</span>
								<Input
									id="max_refund_amount"
									type="number"
									step="0.01"
									min="0"
									className="pl-7"
									value={formValues.max_refund_amount}
									onChange={(e) =>
										handleFieldChange("max_refund_amount", Number(e.target.value))
									}
									onBlur={() => handleFieldBlur("max_refund_amount")}
								/>
							</div>
						)}
						<p className="text-sm text-muted-foreground">
							{isAlwaysRequired("REFUND")
								? "All refunds will require manager approval regardless of amount."
								: "Refunds exceeding this amount will require manager approval."}
						</p>
					</div>

					{/* Max Price Override Amount */}
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<Label htmlFor="max_price_override_amount">
								Maximum Price Override Amount
								{lastSavedField === "max_price_override_amount" && (
									<Check className="inline h-3 w-3 ml-2 text-green-600" />
								)}
							</Label>
							<div className="flex items-center gap-2">
								<Label
									htmlFor="always_price_override"
									className="text-sm font-normal text-muted-foreground"
								>
									Always require
								</Label>
								<Switch
									id="always_price_override"
									checked={isAlwaysRequired("PRICE_OVERRIDE")}
									onCheckedChange={(checked) =>
										toggleAlwaysRequireApproval("PRICE_OVERRIDE", checked)
									}
								/>
								{lastSavedField === "always_require_PRICE_OVERRIDE" && (
									<Check className="h-3 w-3 text-green-600" />
								)}
							</div>
						</div>
						{!isAlwaysRequired("PRICE_OVERRIDE") && (
							<div className="relative">
								<span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
									$
								</span>
								<Input
									id="max_price_override_amount"
									type="number"
									step="0.01"
									min="0"
									className="pl-7"
									value={formValues.max_price_override_amount}
									onChange={(e) =>
										handleFieldChange(
											"max_price_override_amount",
											Number(e.target.value)
										)
									}
									onBlur={() => handleFieldBlur("max_price_override_amount")}
								/>
							</div>
						)}
						<p className="text-sm text-muted-foreground">
							{isAlwaysRequired("PRICE_OVERRIDE")
								? "All price overrides will require manager approval regardless of amount."
								: "Price overrides exceeding this amount will require manager approval."}
						</p>
					</div>

					{/* Max Void Order Amount */}
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<Label htmlFor="max_void_order_amount">
								Maximum Void Order Amount
								{lastSavedField === "max_void_order_amount" && (
									<Check className="inline h-3 w-3 ml-2 text-green-600" />
								)}
							</Label>
							<div className="flex items-center gap-2">
								<Label
									htmlFor="always_void"
									className="text-sm font-normal text-muted-foreground"
								>
									Always require
								</Label>
								<Switch
									id="always_void"
									checked={isAlwaysRequired("ORDER_VOID")}
									onCheckedChange={(checked) =>
										toggleAlwaysRequireApproval("ORDER_VOID", checked)
									}
								/>
								{lastSavedField === "always_require_ORDER_VOID" && (
									<Check className="h-3 w-3 text-green-600" />
								)}
							</div>
						</div>
						{!isAlwaysRequired("ORDER_VOID") && (
							<div className="relative">
								<span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
									$
								</span>
								<Input
									id="max_void_order_amount"
									type="number"
									step="0.01"
									min="0"
									className="pl-7"
									value={formValues.max_void_order_amount}
									onChange={(e) =>
										handleFieldChange(
											"max_void_order_amount",
											Number(e.target.value)
										)
									}
									onBlur={() => handleFieldBlur("max_void_order_amount")}
								/>
							</div>
						)}
						<p className="text-sm text-muted-foreground">
							{isAlwaysRequired("ORDER_VOID")
								? "All order voids will require manager approval regardless of amount."
								: "Voiding orders exceeding this amount will require manager approval."}
						</p>
					</div>
				</div>

				<div className="space-y-4 pt-4 border-t">
					<h3 className="text-sm font-semibold text-foreground">
						Security Settings
					</h3>

					{/* Allow Self-Approval */}
					<div className="flex flex-row items-start justify-between rounded-lg border p-4">
						<div className="space-y-0.5 flex-1">
							<Label htmlFor="allow_self_approval" className="text-base">
								Allow Self-Approval
								{lastSavedField === "allow_self_approval" && (
									<Check className="inline h-3 w-3 ml-2 text-green-600" />
								)}
							</Label>
							<p className="text-sm text-muted-foreground">
								Allow managers to approve their own requests. This is{" "}
								<span className="font-semibold text-orange-600 dark:text-orange-400">
									not recommended
								</span>{" "}
								for security and compliance reasons.
							</p>
						</div>
						<Switch
							id="allow_self_approval"
							checked={formValues.allow_self_approval}
							onCheckedChange={(checked) => {
								handleFieldChange("allow_self_approval", checked);
								// Save immediately when toggling switch
								setFormValues((prev) => {
									const newValues = { ...prev, allow_self_approval: checked };
									setLastSavedField("allow_self_approval");
									mutation.mutate(newValues);
									return newValues;
								});
							}}
						/>
					</div>

					{formValues.allow_self_approval && (
						<Alert variant="destructive">
							<AlertTriangle className="h-4 w-4" />
							<AlertDescription>
								<strong>Security Warning:</strong> Allowing self-approval
								reduces accountability and increases risk of fraud. Consider
								disabling this option for better security controls.
							</AlertDescription>
						</Alert>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
