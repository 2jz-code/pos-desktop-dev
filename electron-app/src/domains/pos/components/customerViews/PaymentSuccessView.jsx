import React from "react";
import { CheckCircle } from "lucide-react";

const PaymentSuccessView = () => {
	return (
		<div className="text-center">
			<CheckCircle className="h-24 w-24 text-green-500 mx-auto mb-6" />
			<h2 className="text-4xl font-bold">Thank You!</h2>
			<p className="text-xl mt-4 text-muted-foreground">
				Your payment was successful.
			</p>
		</div>
	);
};

export default PaymentSuccessView;
