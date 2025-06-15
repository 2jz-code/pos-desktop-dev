import React from "react";
import useTerminalStore from "@/store/terminalStore";
import { shallow } from "zustand/shallow";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard } from "lucide-react";
import TerminalStatus from "../TerminalStatus";

const CreditCardView = ({ amount }) => {
	const { terminalStatus, error, connectedReader } = useTerminalStore(
		(state) => ({
			terminalStatus: state.terminalStatus,
			error: state.error,
			connectedReader: state.connectedReader,
		}),
		shallow
	);

	const total = amount;

	return (
		<div className="flex flex-col items-center space-y-6 p-4">
			<CreditCard className="h-16 w-16 text-blue-500" />
			<h2 className="text-2xl font-semibold">Card Payment</h2>

			<div className="text-center p-4 bg-muted rounded-lg w-full">
				<p className="text-lg">Total to Pay</p>
				<p className="text-4xl font-bold">${total.toFixed(2)}</p>
			</div>

			<div className="w-full min-h-[60px]">
				<TerminalStatus
					status={terminalStatus}
					error={error}
					reader={connectedReader}
				/>
			</div>

			<div className="text-sm text-muted-foreground pt-4">
				The payment process has started automatically. Please follow the prompts
				on the card reader.
			</div>
		</div>
	);
};

export default CreditCardView;
