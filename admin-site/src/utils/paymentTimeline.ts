import { TimelineItem } from "@/components/ui/Timeline";

interface Payment {
	id: string;
	payment_number: string;
	status: string;
	total_amount_due: string;
	total_collected: string;
	created_at: string;
	updated_at: string;
	guest_payer_name?: string;
	transactions?: Array<{
		id: string;
		status: string;
		method: string;
		amount: string;
		tip: string;
		surcharge: string;
		created_at: string;
		metadata?: Record<string, any>;
		transaction_id?: string;
	}>;
}

export function generatePaymentTimeline(payment: Payment): TimelineItem[] {
	const events: TimelineItem[] = [];

	// 1. Payment Created Event
	events.push({
		id: `created-${payment.id}`,
		timestamp: payment.created_at,
		actor: payment.guest_payer_name
			? {
					name: payment.guest_payer_name,
					type: "user",
			  }
			: undefined,
		event: "Payment Initiated",
		description: `Payment #${payment.payment_number} created`,
		icon: "default",
	});

	// 2. Transaction Events (successes, failures, refunds)
	if (payment.transactions) {
		payment.transactions.forEach((transaction) => {
			const isSuccess = transaction.status === "SUCCESSFUL";
			const isFailed = transaction.status === "FAILED";
			const isRefunded = transaction.status === "REFUNDED";

			// Determine event type
			let eventType = "Payment Processing";
			let icon: TimelineItem["icon"] = "warning";

			if (isSuccess) {
				eventType = "Payment Captured";
				icon = "payment";
			} else if (isFailed) {
				eventType = "Payment Failed";
				icon = "error";
			} else if (isRefunded) {
				eventType = "Payment Refunded";
				icon = "warning";
			}

			// Build description
			const methodDisplay = transaction.method.replace("_", " ");
			const amountStr = `$${transaction.amount}`;
			const tipStr = transaction.tip && parseFloat(transaction.tip) > 0
				? ` (Tip: $${transaction.tip})`
				: "";

			const description = `${methodDisplay} • ${amountStr}${tipStr}`;

			// Build metadata
			const metadata: Record<string, any> = {};
			if (transaction.metadata?.card_brand) {
				metadata["Card Brand"] = transaction.metadata.card_brand;
			}
			if (transaction.metadata?.card_last4) {
				metadata["Last 4"] = transaction.metadata.card_last4;
			}
			if (transaction.transaction_id) {
				metadata["Transaction ID"] = transaction.transaction_id;
			}
			if (transaction.surcharge && parseFloat(transaction.surcharge) > 0) {
				metadata["Surcharge"] = `$${transaction.surcharge}`;
			}

			events.push({
				id: `transaction-${transaction.id}`,
				timestamp: transaction.created_at,
				actor: {
					name: "Payment System",
					type: "system",
				},
				event: eventType,
				description,
				icon,
				metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
			});
		});
	}

	// Sort events by timestamp (newest first for display)
	return events.sort(
		(a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
	);
}