import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion"; // eslint-disable-line
import { SiUbereats, SiDoordash, SiGrubhub } from "react-icons/si";

// Define your delivery service links (IMPORTANT: Replace these placeholders)
const UBER_EATS_RESTAURANT_LINK =
	import.meta.env.VITE_UBEREATS_LINK || "https://www.ubereats.com";
const DOORDASH_RESTAURANT_LINK =
	import.meta.env.VITE_DOORDASH_LINK || "https://www.doordash.com";
// const GRUBHUB_RESTAURANT_LINK =
// 	import.meta.env.VITE_GRUBHUB_LINK || "https://www.grubhub.com";

const deliveryServices = [
	{
		name: "DoorDash",
		IconComponent: SiDoordash,
		href: DOORDASH_RESTAURANT_LINK,
		iconColorClassName: "text-[#FF3008]",
		ariaLabel: "Order Ajeen on DoorDash",
	},
	{
		name: "Uber Eats",
		IconComponent: SiUbereats,
		href: UBER_EATS_RESTAURANT_LINK,
		iconColorClassName: "text-[#06C167]",
		ariaLabel: "Order Ajeen on Uber Eats",
	},

	// {
	// 	name: "Grubhub",
	// 	IconComponent: SiGrubhub,
	// 	href: GRUBHUB_RESTAURANT_LINK,
	// 	iconColorClassName: "text-[#F68B1F]",
	// 	ariaLabel: "Order Ajeen on Grubhub",
	// },
];

const Order = () => {
	return (
		<div className="relative bg-gradient-to-b from-background to-primary-beige py-20 overflow-hidden">
			{/* Decorative shapes using primary green for contrast */}
			<div className="absolute inset-0 overflow-hidden">
				<div className="absolute -top-24 -right-24 w-72 h-72 md:w-96 md:h-96 bg-primary-green opacity-10 rounded-full"></div>
				<div className="absolute top-1/2 left-1/4 w-56 h-56 md:w-64 md:h-64 bg-primary-green opacity-10 rounded-full"></div>
				<div className="absolute -bottom-32 -left-32 w-72 h-72 md:w-96 md:h-96 bg-primary-green opacity-10 rounded-full"></div>
			</div>

			<div className="relative max-w-5xl mx-auto px-4 text-center z-10">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.7, ease: "easeOut" }}
					viewport={{ once: true, amount: 0.2 }}
				>
					{/* Heading text color: Dark Green. Consider Light Beige if background gets too dark for Dark Green. */}
					<h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-accent-dark-green mb-6 tracking-tight">
						Ready to Satisfy Your Cravings?
					</h2>

					{/* Paragraph text color: Dark Brown. Consider Light Beige if background gets too dark for Dark Brown. */}
					<p className="text-lg sm:text-xl text-accent-dark-brown mb-10 max-w-3xl mx-auto leading-relaxed">
						Experience authentic Middle Eastern flavors with our freshly
						prepared dishes. Order now for pickup and enjoy a taste of
						tradition!
					</p>

					<div className="flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0 sm:space-x-6 mb-16">
						{/* "Order Online" button: Primary Green background, Light Beige text */}
						<Link
							to="/menu"
							className="inline-flex items-center justify-center px-8 py-3.5 rounded-full bg-primary-green text-accent-light-beige font-semibold text-base sm:text-lg shadow-xl hover:bg-accent-dark-green transform hover:scale-105 transition-all duration-300 ease-out focus:outline-none focus:ring-2 focus:ring-primary-green focus:ring-opacity-50"
						>
							Order Online
							<svg
								className="ml-2.5 w-5 h-5"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2.5}
									d="M14 5l7 7m0 0l-7 7m7-7H3"
								/>
							</svg>
						</Link>
					</div>

					{/* Delivery Service Icons */}
					<div className="mt-12 flex flex-wrap justify-center items-center gap-x-6 gap-y-6 sm:gap-x-8">
						{deliveryServices.map((service) => (
							<a
								key={service.name}
								href={
									service.href === "#" || service.href.includes("YOUR_")
										? "#"
										: service.href
								}
								target={
									service.href === "#" || service.href.includes("YOUR_")
										? "_self"
										: "_blank"
								}
								rel="noopener noreferrer"
								aria-label={service.ariaLabel}
								title={`Order on ${service.name}`}
								className={`rounded-full transition-all duration-300 ease-out group focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-primary-beige focus:ring-primary-green ${
									service.href === "#" || service.href.includes("YOUR_")
										? "cursor-default"
										: "hover:scale-105"
								}`}
								onClick={(e) => {
									if (service.href === "#" || service.href.includes("YOUR_")) {
										e.preventDefault();
										console.warn(`Link for ${service.name} is not configured.`);
									}
								}}
							>
								{/* Plaquette background remains light beige, good for colorful icons */}
								<div
									className={`flex items-center justify-center p-3 sm:p-3.5 bg-accent-light-beige rounded-full shadow-lg group-hover:shadow-xl transition-all duration-300 ease-out ${
										service.href === "#" || service.href.includes("YOUR_")
											? "opacity-60"
											: ""
									}`}
								>
									<service.IconComponent
										className={`w-10 h-10 sm:w-11 md:w-12 ${service.iconColorClassName} transition-transform duration-300 ease-out`}
									/>
								</div>
							</a>
						))}
					</div>
					{deliveryServices.some(
						(s) => s.href.includes("YOUR_") || s.href === "#"
					) && (
						// Text color for placeholder message
						<p className="mt-4 text-xs text-accent-dark-brown opacity-80">
							(Delivery partner links will be active soon)
						</p>
					)}
				</motion.div>
			</div>
		</div>
	);
};

export default Order;
