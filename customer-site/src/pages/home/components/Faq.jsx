import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Disclosure } from "@headlessui/react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";

const FAQItem = ({ question, answer }) => {
	return (
		<Disclosure
			as="div"
			className="mt-4 first:mt-0"
		>
			{({ open }) => (
				<>
					<Disclosure.Button className="flex w-full justify-between rounded-lg bg-primary-beige px-6 py-4 text-left text-accent-dark-green shadow-md hover:shadow-lg transition-all duration-300 focus:outline-none focus-visible:ring focus-visible:ring-primary-green focus-visible:ring-opacity-75">
						{/* Question Text: Dark Green on Beige */}
						<span className="text-lg font-medium">{question}</span>
						<motion.span
							animate={{ rotate: open ? 180 : 0 }}
							transition={{ duration: 0.3 }}
							className="flex items-center"
						>
							{/* Chevron Icon: Primary Green */}
							<ChevronDownIcon className="h-5 w-5 text-primary-green" />
						</motion.span>
					</Disclosure.Button>
					<AnimatePresence>
						{open && (
							<Disclosure.Panel
								static
								as={motion.div}
								initial={{ height: 0, opacity: 0 }}
								animate={{ height: "auto", opacity: 1 }}
								exit={{ height: 0, opacity: 0 }}
								transition={{ duration: 0.3 }}
								className="overflow-hidden"
							>
								{/* Answer Panel: Dark Brown text on Primary Beige (slightly darker than main bg for depth) */}
								<div className="bg-primary-beige px-6 py-4 text-accent-dark-brown rounded-b-lg shadow-md mt-px">
									{answer}
								</div>
							</Disclosure.Panel>
						)}
					</AnimatePresence>
				</>
			)}
		</Disclosure>
	);
};

const Faq = () => {
	const faqItems = [
		{
			question: "What are your hours?",
			answer:
				"We're open Sunday through Thursday from 11:00 AM to 8:00 PM, and Friday and Saturday from 11:00 AM to 9:00 PM. Our kitchen starts serving at 11:00 AM and stays open until closing time.",
		},
		{
			question: "Do you deliver?",
			answer:
				"Yes, we offer delivery through DoorDash, Uber Eats, and we offer order pickup through our website.",
		},
		{
			question: "How did you start?",
			answer:
				"Our family has always dreamed of opening a restaurant that serves authentic Middle Eastern food. After years of perfecting our recipes and techniques, we finally opened our doors in 2025.",
		},
		{
			question: "Do you cater for events?",
			answer:
				"Absolutely! We offer catering services for events of all sizes, from intimate gatherings to large corporate functions. Please contact us at least 48 hours in advance to discuss your requirements and place your order.",
		},
		{
			question: "Are your ingredients halal?",
			answer:
				"Yes, all of our meat products are certified halal. We take great care in sourcing high-quality, authentic ingredients for all our dishes.",
		},
	];

	return (
		<div
			id="faq"
			className="w-full py-20 px-4 bg-background" // Main section background: --color-accent-light-beige
		>
			<div className="max-w-3xl mx-auto">
				<div className="text-center mb-12">
					{/* "Have Questions?" span: Primary Green */}
					<span className="text-primary-green font-semibold tracking-wider uppercase">
						Have Questions?
					</span>
					{/* Main heading "Frequently Asked Questions": Dark Green */}
					<h2 className="text-4xl font-bold mt-2 text-accent-dark-green">
						Frequently Asked Questions
					</h2>
					{/* Decorative line: Primary Green */}
					<div className="h-1 w-24 bg-primary-green mx-auto mt-4 rounded-full"></div>
				</div>

				<div className="space-y-4">
					{faqItems.map((item, index) => (
						<FAQItem
							key={index}
							question={item.question}
							answer={item.answer}
						/>
					))}
				</div>

				<div className="mt-12 text-center">
					{/* "Don't see your question here?" text: Dark Brown */}
					<p className="text-accent-dark-brown mb-6">
						Don't see your question here?
					</p>
					<a href="#contact">
						{/* Contact Us button: Warm Brown background, Light Beige text */}
						<button className="inline-flex items-center px-6 py-3 rounded-full bg-accent-warm-brown text-accent-light-beige font-medium hover:bg-opacity-80 transition-colors duration-300">
							Contact Us
							<svg
								className="ml-2 w-5 h-5"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M14 5l7 7m0 0l-7 7m7-7H3"
								/>
							</svg>
						</button>
					</a>
				</div>
			</div>
		</div>
	);
};

export default Faq;
