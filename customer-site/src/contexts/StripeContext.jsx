import React, { createContext, useContext, useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";

// Create context
const StripeContext = createContext(null);

// Custom hook to use the Stripe context
// eslint-disable-next-line react-refresh/only-export-components
export const useStripe = () => {
	const context = useContext(StripeContext);
	if (!context) {
		throw new Error("useStripe must be used within a StripeProvider");
	}
	return context;
};

// Stripe provider component
export const StripeProvider = ({ children }) => {
	const [stripePromise, setStripePromise] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		const loadStripeInstance = async () => {
			try {
				setLoading(true);

				// Get the publishable key from environment
				const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

				if (!publishableKey) {
					throw new Error(
						"Stripe publishable key is missing from environment variables"
					);
				}

				console.log(
					"Loading Stripe with key:",
					publishableKey.substring(0, 20) + "..."
				);
				const stripe = await loadStripe(publishableKey);

				if (!stripe) {
					throw new Error("Failed to initialize Stripe");
				}

				console.log("Stripe loaded successfully");
				setStripePromise(stripe);
			} catch (err) {
				console.error("Stripe initialization error:", err);
				setError(err.message);
			} finally {
				setLoading(false);
			}
		};

		loadStripeInstance();
	}, []);

	// Stripe Elements options - optimized for performance
	const elementsOptions = {
		appearance: {
			theme: "stripe",
			variables: {
				colorPrimary: "#16a34a", // primary-green
				colorBackground: "#fefcf3", // accent-light-beige
				colorText: "#3f2f1e", // accent-dark-brown
				colorDanger: "#dc2626",
				fontFamily: "Inter, system-ui, sans-serif",
				spacingUnit: "4px",
				borderRadius: "8px",
			},
		},
		loader: "auto",
	};

	if (error) {
		return (
			<div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
				<h3 className="font-medium">Payment System Error</h3>
				<p className="text-sm mt-1">{error}</p>
				<p className="text-sm mt-2">
					Please refresh the page or contact support if the problem persists.
				</p>
			</div>
		);
	}

	if (loading) {
		return (
			<div className="flex flex-col items-center justify-center p-8">
				<div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-green mb-4"></div>
				<p className="text-accent-dark-brown text-sm">
					Loading payment system...
				</p>
			</div>
		);
	}

	return (
		<StripeContext.Provider value={{ stripePromise, elementsOptions }}>
			<Elements
				stripe={stripePromise}
				options={elementsOptions}
			>
				{children}
			</Elements>
		</StripeContext.Provider>
	);
};

export default StripeProvider;
