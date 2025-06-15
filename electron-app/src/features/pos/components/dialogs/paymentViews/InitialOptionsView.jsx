import React from "react";
import { Button } from "@/components/ui/button";

const InitialOptionsView = ({ onSelect }) => {
	return (
		<div className="flex flex-col space-y-4">
			<h2 className="text-xl font-semibold text-center">
				Select Payment Method
			</h2>
			<Button
				onClick={() => onSelect("CASH")}
				size="lg"
			>
				Pay with Cash
			</Button>
			<Button
				onClick={() => onSelect("CREDIT")}
				size="lg"
			>
				Pay with Card
			</Button>
			<Button
				onClick={() => onSelect("SPLIT")}
				size="lg"
				disabled
			>
				Split Payment (Coming Soon)
			</Button>
		</div>
	);
};

export default InitialOptionsView;
