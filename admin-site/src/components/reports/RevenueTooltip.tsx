import React from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	HelpCircle,
	DollarSign,
	TrendingUp,
	TrendingDown,
	MinusCircle,
} from "lucide-react";

interface RevenueTooltipProps {
	type:
		| "gross_revenue"
		| "net_revenue"
		| "subtotal"
		| "tips"
		| "discounts"
		| "tax"
		| "surcharges";
	children: React.ReactNode;
}

const tooltipContent = {
	gross_revenue: {
		title: "Gross Revenue",
		description: "Total amount successfully processed from customers",
		formula: "All successful payment transactions",
		note: "This is the total amount actually collected before discounts",
		icon: <DollarSign className="h-4 w-4 text-blue-500" />,
	},
	net_revenue: {
		title: "Net Revenue",
		description: "Your actual business revenue from sales",
		formula: "Subtotal + Tips - Discounts",
		note: "This excludes tax (goes to government) and surcharges (covers fees)",
		icon: <TrendingUp className="h-4 w-4 text-green-500" />,
	},
	subtotal: {
		title: "Subtotal",
		description: "Base revenue from product sales",
		formula: "Product prices × quantities sold",
		note: "This is your core product revenue before any adjustments",
		icon: <DollarSign className="h-4 w-4 text-blue-500" />,
	},
	tips: {
		title: "Tips",
		description: "Additional revenue from customer tips",
		formula: "Customer-added gratuity",
		note: "Tips directly increase your business revenue",
		icon: <TrendingUp className="h-4 w-4 text-green-500" />,
	},
	discounts: {
		title: "Discounts Applied",
		description: "Revenue reduction from promotional offers",
		formula: "Coupon codes, percentage discounts, BOGO offers",
		note: "Discounts reduce your net revenue but can drive sales volume",
		icon: <MinusCircle className="h-4 w-4 text-red-500" />,
	},
	tax: {
		title: "Tax Collected",
		description: "Government taxes collected from customers",
		formula: "Sales tax, VAT, or other applicable taxes",
		note: "This money goes to the government, not your business profit",
		icon: <HelpCircle className="h-4 w-4 text-muted-foreground" />,
	},
	surcharges: {
		title: "Surcharges",
		description: "Processing fees passed to customers",
		formula: "Credit card fees, convenience charges",
		note: "These fees cover your payment processing costs",
		icon: <TrendingDown className="h-4 w-4 text-orange-500" />,
	},
};

export function RevenueTooltip({ type, children }: RevenueTooltipProps) {
	const content = tooltipContent[type];

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>{children}</TooltipTrigger>
				<TooltipContent
					className="max-w-sm p-3 bg-popover text-popover-foreground border border-border shadow-lg"
					side="top"
				>
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							{content.icon}
							<span className="font-semibold text-sm">{content.title}</span>
						</div>
						<p className="text-xs text-muted-foreground">{content.description}</p>
						<div className="text-xs">
							<span className="font-medium">Formula: </span>
							<span className="text-muted-foreground">{content.formula}</span>
						</div>
						<p className="text-xs text-muted-foreground italic">{content.note}</p>
					</div>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
