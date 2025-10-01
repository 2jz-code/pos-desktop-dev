import { TimelineItem } from "@/components/ui/Timeline";

interface Order {
	id: string;
	order_number: string;
	status: string;
	payment_status: string;
	order_type: string;
	confirmation_sent: boolean;
	created_at: string;
	updated_at: string;
	cashier?: {
		username: string;
		first_name?: string;
		last_name?: string;
	};
	payment_details?: {
		transactions?: Array<{
			id: string;
			status: string;
			method: string;
			amount: string;
			created_at: string;
			metadata?: Record<string, any>;
		}>;
	};
}

export function generateOrderTimeline(order: Order): TimelineItem[] {
	const events: TimelineItem[] = [];

	// 1. Order Created Event
	events.push({
		id: `created-${order.id}`,
		timestamp: order.created_at,
		actor: order.cashier
			? {
					name: order.cashier.first_name
						? `${order.cashier.first_name} ${order.cashier.last_name || ""}`
						: order.cashier.username,
					type: "user",
			  }
			: undefined,
		event: "Order Created",
		description: `Order #${order.order_number} was created via ${order.order_type}`,
		icon: "success",
	});

	// 2. Payment Transaction Events (ACTUAL transactions that happened)
	if (order.payment_details?.transactions) {
		order.payment_details.transactions.forEach((transaction) => {
			const isSuccess = transaction.status === "SUCCESSFUL";
			const isFailed = transaction.status === "FAILED";

			events.push({
				id: `transaction-${transaction.id}`,
				timestamp: transaction.created_at,
				actor: {
					name: "Payment System",
					type: "system",
				},
				event: isSuccess
					? "Payment Captured"
					: isFailed
					? "Payment Failed"
					: "Payment Processing",
				description: `${transaction.method.replace("_", " ")} • $${transaction.amount}`,
				icon: isSuccess ? "payment" : isFailed ? "error" : "warning",
				metadata: transaction.metadata
					? {
							"Card Brand": transaction.metadata.card_brand,
							"Last 4": transaction.metadata.card_last4,
					  }
					: undefined,
			});
		});
	}

	// 3. Email sent event - ONLY for WEB orders where confirmation was actually sent
	if (order.order_type === "WEB" && order.confirmation_sent) {
		events.push({
			id: `email-${order.id}`,
			timestamp: order.updated_at, // Note: This is approximate - we don't track exact email send time
			actor: {
				name: "Email Service",
				type: "system",
			},
			event: "Confirmation Email Sent",
			description: "Order confirmation sent to customer",
			icon: "email",
		});
	}

	// Note: We don't show status change events (PENDING -> COMPLETED, etc.)
	// because we don't currently track the actual timestamp when these changes occurred.
	// The order.updated_at field gets updated for many reasons, not just status changes.
	// Proper history tracking should be implemented to show accurate status changes.

	// Sort events by timestamp (newest first for display)
	return events.sort(
		(a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
	);
}