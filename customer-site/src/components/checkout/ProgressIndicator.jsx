import React from "react";
import { Check, User, CreditCard, ShoppingBag } from "lucide-react";

const ProgressIndicator = ({ currentStep }) => {
	const steps = [
		{
			id: 1,
			title: "Information",
			description: "Contact details",
			icon: User,
		},
		{
			id: 2,
			title: "Payment",
			description: "Complete order",
			icon: CreditCard,
		},
	];

	const getStepStatus = (stepId) => {
		if (stepId < currentStep) return "completed";
		if (stepId === currentStep) return "current";
		return "upcoming";
	};

	const getStepClasses = (status) => {
		switch (status) {
			case "completed":
				return "bg-primary-green text-accent-light-beige border-primary-green";
			case "current":
				return "bg-accent-light-beige text-primary-green border-primary-green ring-4 ring-primary-green/20";
			case "upcoming":
				return "bg-accent-subtle-gray/30 text-accent-dark-brown/50 border-accent-subtle-gray";
			default:
				return "bg-accent-subtle-gray/30 text-accent-dark-brown/50 border-accent-subtle-gray";
		}
	};

	const getConnectorClasses = (stepId) => {
		const isCompleted = stepId < currentStep;
		return isCompleted ? "bg-primary-green" : "bg-accent-subtle-gray/30";
	};

	return (
		<div className="w-full relative">
			<div className="flex items-center">
				{steps.map((step, index) => {
					const status = getStepStatus(step.id);
					const IconComponent = step.icon;
					const isFirstStep = index === 0;
					const isLastStep = index === steps.length - 1;

					return (
						<React.Fragment key={step.id}>
							{/* Step Circle and Labels */}
							<div
								className={`flex flex-col items-center relative z-10 ${
									isFirstStep
										? "items-start"
										: isLastStep
										? "items-end"
										: "items-center"
								}`}
							>
								<div
									className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${getStepClasses(
										status
									)}`}
								>
									{status === "completed" ? (
										<Check size={20} />
									) : (
										<IconComponent size={20} />
									)}
								</div>

								{/* Step Labels */}
								<div className="mt-3 text-center">
									<div
										className={`text-sm font-medium ${
											status === "current"
												? "text-primary-green"
												: status === "completed"
												? "text-accent-dark-green"
												: "text-accent-dark-brown/50"
										}`}
									>
										{step.title}
									</div>
									<div
										className={`text-xs mt-1 ${
											status === "current" || status === "completed"
												? "text-accent-dark-brown/70"
												: "text-accent-dark-brown/40"
										}`}
									>
										{step.description}
									</div>
								</div>
							</div>

							{/* Connector Line - Between icons */}
							{!isLastStep && (
								<div className="flex-1 flex items-center px-6">
									<div
										className={`h-0.5 w-full transition-all duration-300 ${getConnectorClasses(
											step.id
										)}`}
									/>
								</div>
							)}
						</React.Fragment>
					);
				})}
			</div>
		</div>
	);
};

export default ProgressIndicator;
