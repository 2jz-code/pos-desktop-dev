import React from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const AwaitTipView = () => (
	<div className="flex flex-col items-center justify-center p-8 space-y-4">
		<Loader2 className="w-12 h-12 animate-spin text-primary" />
		<p className="text-lg font-medium text-muted-foreground">
			Awaiting Tip from Customer...
		</p>
		<p className="text-sm text-center text-muted-foreground">
			Please ask the customer to complete their selection on the customer
			display.
		</p>
	</div>
);

export default AwaitTipView;
