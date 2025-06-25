import React from "react";
import { Loader2 } from "lucide-react";

const PaymentProcessingView = ({ status }) => {
	return (
		<div className="text-center">
			<h2 className="text-4xl font-bold mb-6">Processing Payment</h2>
			<div className="flex items-center justify-center">
				<Loader2 className="h-16 w-16 animate-spin text-primary" />
			</div>
			<p className="text-xl mt-6 text-muted-foreground">{status}</p>
		</div>
	);
};

export default PaymentProcessingView;
