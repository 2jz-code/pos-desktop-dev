import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";

interface Tenant {
	tenant_id: string;
	tenant_name: string;
	tenant_slug: string;
	user_id: string;
	role: string;
}

interface TenantSelectorDialogProps {
	open: boolean;
	tenants: Tenant[];
	onSelectTenant: (tenantId: string) => Promise<void>;
	isLoading?: boolean;
}

const getRoleBadgeColor = (role: string) => {
	switch (role) {
		case "OWNER":
			return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
		case "ADMIN":
			return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
		case "MANAGER":
			return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
		default:
			return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
	}
};

export const TenantSelectorDialog = ({
	open,
	tenants,
	onSelectTenant,
	isLoading = false,
}: TenantSelectorDialogProps) => {
	const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

	const handleSelect = async (tenantId: string) => {
		setSelectedTenantId(tenantId);
		await onSelectTenant(tenantId);
	};

	return (
		<Dialog open={open}>
			<DialogContent className="sm:max-w-md" hideCloseButton>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Building2 className="h-5 w-5" />
						Select Your Business
					</DialogTitle>
					<DialogDescription>
						You have access to multiple businesses. Please select which one you'd
						like to manage.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3 mt-4">
					{tenants.map((tenant) => {
						const isSelecting = selectedTenantId === tenant.tenant_id;

						return (
							<Card
								key={tenant.tenant_id}
								className="cursor-pointer hover:border-primary transition-colors"
								onClick={() =>
									!isLoading && !isSelecting && handleSelect(tenant.tenant_id)
								}
							>
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div className="flex-1">
											<div className="flex items-center gap-2">
												<h3 className="font-semibold text-base">
													{tenant.tenant_name}
												</h3>
												<span
													className={`text-xs px-2 py-0.5 rounded-full font-medium ${getRoleBadgeColor(
														tenant.role
													)}`}
												>
													{tenant.role}
												</span>
											</div>
											<p className="text-sm text-muted-foreground mt-1">
												@{tenant.tenant_slug}
											</p>
										</div>

										<div className="ml-4">
											{isSelecting ? (
												<Loader2 className="h-5 w-5 animate-spin text-primary" />
											) : (
												<ChevronRight className="h-5 w-5 text-muted-foreground" />
											)}
										</div>
									</div>
								</CardContent>
							</Card>
						);
					})}
				</div>

				<div className="mt-4 text-center text-sm text-muted-foreground">
					<p>Can't find the business you're looking for?</p>
					<p className="mt-1">Contact your system administrator for access.</p>
				</div>
			</DialogContent>
		</Dialog>
	);
};
