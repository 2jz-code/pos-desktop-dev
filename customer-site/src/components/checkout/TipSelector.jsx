import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, DollarSign } from "lucide-react";

const TipSelector = ({ onTipChange, subtotal = 0, currentTip = 0 }) => {
	const [selectedOption, setSelectedOption] = useState("none");
	const [customAmount, setCustomAmount] = useState("");
	const [isTypingCustom, setIsTypingCustom] = useState(false);

	// Preset tip percentages
	const tipPercentages = [15, 18, 20, 25];

	// Calculate tip amounts for preset percentages
	const calculateTipAmount = (percentage) => {
		const amount = (subtotal * percentage) / 100;
		return Math.round(amount * 100) / 100; // Round to 2 decimal places
	};

	// Format price display
	const formatPrice = (amount) => {
		return Number(amount).toFixed(2);
	};

	// Handle preset percentage selection
	const handlePercentageSelect = (percentage) => {
		const tipAmount = calculateTipAmount(percentage);
		console.log('🎯 TipSelector handlePercentageSelect - percentage:', percentage, 'tipAmount:', tipAmount);
		setSelectedOption(`${percentage}%`);
		setCustomAmount("");
		setIsTypingCustom(false);
		console.log('🎯 TipSelector calling onTipChange with:', tipAmount);
		onTipChange(tipAmount);
	};

	// Handle custom amount input
	const handleCustomAmountChange = (e) => {
		const value = e.target.value;
		
		// Only allow numbers and decimal point, and limit to 2 decimal places
		if (value === "" || /^\d*\.?\d{0,2}$/.test(value)) {
			setCustomAmount(value);
			setSelectedOption("custom");
			setIsTypingCustom(true);
			
			// Only call onTipChange if there's a valid number
			if (value && !value.endsWith('.')) {
				const numericValue = parseFloat(value) || 0;
				// Round to 2 decimal places to avoid validation errors
				const roundedValue = Math.round(numericValue * 100) / 100;
				console.log('🎯 TipSelector handleCustomAmountChange - value:', value, 'roundedValue:', roundedValue);
				console.log('🎯 TipSelector calling onTipChange with:', roundedValue);
				onTipChange(roundedValue);
			} else if (value === "") {
				// If field is empty, set tip to 0
				onTipChange(0);
			}
		}
	};

	// Handle blur on custom input (when user clicks away)
	const handleCustomBlur = () => {
		setIsTypingCustom(false);
	};

	// Handle no tip selection
	const handleNoTip = () => {
		setSelectedOption("none");
		setCustomAmount("");
		setIsTypingCustom(false);
		onTipChange(0);
	};

	// Set initial state based on currentTip
	useEffect(() => {
		// Don't auto-switch if user is actively typing in the custom field
		if (isTypingCustom) return;
		
		if (currentTip === 0) {
			setSelectedOption("none");
			setCustomAmount("");
		} else {
			// Check if current tip matches a percentage
			const matchingPercentage = tipPercentages.find(
				(percentage) => Math.abs(calculateTipAmount(percentage) - currentTip) < 0.01
			);
			
			if (matchingPercentage) {
				setSelectedOption(`${matchingPercentage}%`);
				setCustomAmount("");
			} else {
				setSelectedOption("custom");
				setCustomAmount(currentTip.toFixed(2));
			}
		}
	}, [currentTip, subtotal, isTypingCustom]);

	return (
		<Card className="border-primary-green/30 bg-gradient-to-br from-green-50/50 to-accent-light-beige/30">
			<CardHeader className="pb-4">
				<CardTitle className="text-accent-dark-green flex items-center text-lg">
					<Heart className="mr-2 h-5 w-5 text-red-500" />
					Add a Tip for Great Service?
				</CardTitle>
				<p className="text-sm text-accent-dark-brown/70 mt-1">
					Your tip goes directly to our hardworking team
				</p>
			</CardHeader>
			
			<CardContent className="space-y-4">
				{/* Preset Tip Percentages */}
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
					{tipPercentages.map((percentage) => {
						const tipAmount = calculateTipAmount(percentage);
						const isSelected = selectedOption === `${percentage}%`;
						
						return (
							<Button
								key={percentage}
								type="button"
								variant={isSelected ? "default" : "outline"}
								onClick={() => handlePercentageSelect(percentage)}
								className={`flex flex-col py-3 h-auto ${
									isSelected
										? "bg-primary-green text-accent-light-beige border-primary-green"
										: "border-accent-subtle-gray/50 text-accent-dark-brown hover:bg-primary-beige/50 hover:border-primary-green/50"
								}`}
							>
								<span className="font-semibold">{percentage}%</span>
								<span className="text-xs opacity-80">
									${formatPrice(tipAmount)}
								</span>
							</Button>
						);
					})}
				</div>

				{/* Custom Tip Amount */}
				<div className="space-y-2">
					<label className="text-sm font-medium text-accent-dark-brown">
						Custom Amount
					</label>
					<div className="relative">
						<DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-accent-dark-brown/60" />
						<Input
							type="text"
							placeholder="0.00"
							value={customAmount}
							onChange={handleCustomAmountChange}
							onBlur={handleCustomBlur}
							className={`pl-10 border-accent-subtle-gray/50 focus:border-primary-green focus:ring-primary-green/20 ${
								selectedOption === "custom"
									? "ring-2 ring-primary-green/20 border-primary-green"
									: ""
							}`}
						/>
					</div>
				</div>

				{/* No Tip Option */}
				<Button
					type="button"
					variant={selectedOption === "none" ? "default" : "outline"}
					onClick={handleNoTip}
					className={`w-full ${
						selectedOption === "none"
							? "bg-accent-dark-brown text-accent-light-beige"
							: "border-accent-subtle-gray/50 text-accent-dark-brown hover:bg-primary-beige/50"
					}`}
				>
					No Tip
				</Button>

				{/* Tip Summary */}
				{currentTip > 0 && (
					<div className="bg-primary-beige/50 rounded-lg p-3 border border-primary-green/20">
						<div className="flex justify-between items-center">
							<span className="text-sm text-accent-dark-brown/70">
								Tip Amount:
							</span>
							<span className="font-semibold text-accent-dark-green">
								${formatPrice(currentTip)}
							</span>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
};

export default TipSelector;