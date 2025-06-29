import React, {
	useState,
	useEffect,
	useCallback,
	useMemo,
	useRef,
} from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "framer-motion";
import {
	Menu,
	X,
	User,
	ShoppingCart,
	History,
	Settings,
	LogOut,
} from "lucide-react";

import { Button } from "@/components/ui/button";

// NOTE: The following imports are assumed to exist based on the old project structure.
// You will need to create and expose the AuthContext.
import { useAuth } from "@/contexts/AuthContext";
// The logo asset needs to be placed in the specified path.
import LogoImg from "@/assets/logo.png";
import { useCartSidebar } from "@/contexts/CartSidebarContext";
import { useCart } from "@/hooks/useCart";
import OptimizedImage from "@/components/OptimizedImage";

const ProfileDropdown = () => {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef(null);
	const { logout, user } = useAuth();
	const profileImageUrl = user?.profile_image;

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
				setIsOpen(false);
			}
		};

		if (isOpen) {
			document.addEventListener("mousedown", handleClickOutside);
		}
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isOpen]);

	// Handle escape key press to close dropdown
	useEffect(() => {
		const handleEscapeKey = (event) => {
			if (event.key === "Escape") {
				setIsOpen(false);
			}
		};
		if (isOpen) {
			document.addEventListener("keydown", handleEscapeKey);
		}
		return () => {
			document.removeEventListener("keydown", handleEscapeKey);
		};
	}, [isOpen]);

	const toggleDropdown = () => {
		setIsOpen(!isOpen);
	};

	const menuItems = [
		{
			id: "profile",
			label: "My Profile",
			icon: (
				<User
					className="mr-2 text-accent-dark-green"
					size={16}
				/>
			),
			link: "/dashboard",
			divider: false,
		},
		{
			id: "orders",
			label: "Order History",
			icon: (
				<History
					className="mr-2 text-accent-dark-green"
					size={16}
				/>
			),
			link: "/dashboard?tab=orders",
			divider: false,
		},
		{
			id: "settings",
			label: "Account Settings",
			icon: (
				<Settings
					className="mr-2 text-accent-dark-green"
					size={16}
				/>
			),
			link: "/dashboard?tab=account",
			divider: true,
		},
		{
			id: "logout",
			label: "Logout",
			icon: (
				<LogOut
					className="mr-2 text-red-500"
					size={16}
				/>
			),
			action: logout,
			divider: false,
		},
	];

	if (!user) return null;

	return (
		<div
			className="relative"
			ref={dropdownRef}
		>
			{/* Profile Avatar Button */}
			<button
				onClick={toggleDropdown}
				className="relative flex items-center focus:outline-none focus:ring-2 focus:ring-primary-green rounded-full"
				aria-expanded={isOpen}
				aria-haspopup="true"
			>
				<div className="w-8 h-8 rounded-full overflow-hidden bg-accent-subtle-gray flex items-center justify-center">
					{profileImageUrl ? (
						<OptimizedImage
							src={profileImageUrl}
							alt="User profile"
							className="w-full h-full object-cover"
						/>
					) : (
						<User
							className="text-accent-dark-brown"
							size={20}
						/>
					)}
				</div>
			</button>

			{/* Dropdown Menu */}
			<AnimatePresence>
				{isOpen && (
					<motion.div
						initial={{ opacity: 0, y: -10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -10 }}
						transition={{ duration: 0.2 }}
						className="absolute right-0 mt-2 w-48 bg-accent-light-beige rounded-md shadow-lg z-50 overflow-hidden border border-accent-subtle-gray/50"
						style={{ transformOrigin: "top right" }}
						role="menu"
						aria-orientation="vertical"
						aria-labelledby="user-menu"
					>
						<div className="py-1">
							{menuItems.map((item) => (
								<React.Fragment key={item.id}>
									{item.link ? (
										<Link
											to={item.link}
											className="flex items-center px-4 py-2 text-sm text-accent-dark-green hover:bg-primary-beige hover:text-primary-green transition-colors"
											onClick={() => setIsOpen(false)}
											role="menuitem"
										>
											{item.icon}
											{item.label}
										</Link>
									) : (
										<button
											onClick={() => {
												setIsOpen(false);
												if (item.action) item.action();
											}}
											className={`flex items-center w-full text-left px-4 py-2 text-sm transition-colors ${
												item.id === "logout"
													? "text-red-600 hover:bg-red-50 hover:text-red-700"
													: "text-accent-dark-green hover:bg-primary-beige hover:text-primary-green"
											}`}
											role="menuitem"
										>
											{item.icon}
											{item.label}
										</button>
									)}
									{item.divider && (
										<div className="border-t border-accent-subtle-gray/30 my-1"></div>
									)}
								</React.Fragment>
							))}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
};

const Navbar = () => {
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const [scrolled, setScrolled] = useState(false);
	const { isAuthenticated, logout } = useAuth(); //eslint-disable-line
	const navigate = useNavigate();
	const location = useLocation();
	const isHomePage = location.pathname === "/";
	const isMenuPage = location.pathname === "/menu";
	const { openCart } = useCartSidebar();
	const { cartItemCount } = useCart();

	const handleScroll = useCallback(() => {
		// Use a small threshold to prevent style flickering on some browsers
		setScrolled(window.scrollY > 10);
	}, []);

	useEffect(() => {
		// Only add scroll listener on the home page (not menu page)
		if (isHomePage && !isMenuPage) {
			window.addEventListener("scroll", handleScroll);
			// Call handler once on mount to set initial state
			handleScroll();
		}

		return () => {
			if (isHomePage && !isMenuPage) {
				window.removeEventListener("scroll", handleScroll);
			}
		};
	}, [isHomePage, isMenuPage, handleScroll]);

	useEffect(() => {
		// Cleanup function
		return () => {
			setMobileMenuOpen(false);
		};
	}, [location.pathname]);

	const navLinks = useMemo(
		() => [
			{ name: "Home", href: "/" },
			{ name: "About", href: "/#about" },
			{ name: "Contact", href: "/#contact" },
			{ name: "FAQ", href: "/#faq" },
		],
		[]
	);

	const navbarClasses = useMemo(() => {
		const baseClasses =
			"fixed top-0 left-0 right-0 z-40 transition-all duration-300 ease-in-out";
		if (isHomePage) {
			return `${baseClasses} ${
				scrolled || mobileMenuOpen
					? "bg-accent-light-beige/95 backdrop-blur-sm shadow-md"
					: "bg-transparent"
			}`;
		}
		// For all other pages, use a solid background
		return `${baseClasses} bg-accent-light-beige shadow-sm`;
	}, [scrolled, mobileMenuOpen, isHomePage]);

	const linkClasses = useMemo(() => {
		const baseClasses =
			"text-md font-medium transition-colors hover:text-primary-green";
		if (isHomePage && !scrolled && !mobileMenuOpen) {
			return `${baseClasses} text-accent-light-beige`;
		}
		return `${baseClasses} text-accent-dark-brown`;
	}, [isHomePage, scrolled, mobileMenuOpen]);

	const handleCartClick = (e) => {
		e.preventDefault();
		openCart();
	};

	const renderNavLinks = () =>
		navLinks.map((link) => (
			<Link
				key={link.name}
				to={link.href}
				className={linkClasses}
				onClick={() => setMobileMenuOpen(false)}
			>
				{link.name}
			</Link>
		));

	const renderAuthButtons = () => {
		if (isAuthenticated) {
			return <ProfileDropdown />;
		}
		return (
			<Button
				onClick={() => navigate("/login")}
				className={`${
					isHomePage && !scrolled && !mobileMenuOpen
						? "bg-white/20 text-white hover:bg-white/30"
						: "bg-primary-green text-white hover:bg-primary-green/90"
				} transition-colors`}
			>
				Login
			</Button>
		);
	};

	return (
		<header className={navbarClasses}>
			<nav className="container mx-auto px-4 sm:px-6 lg:px-8">
				<div className="flex items-center justify-between h-20">
					{/* Logo */}
					<div className="flex-shrink-0">
						<Link
							to="/"
							className="flex items-center space-x-2"
						>
							<OptimizedImage
								src={LogoImg}
								alt="Ajeen Logo"
								className="h-14 w-auto"
								width={64}
								height={56}
								priority
							/>
						</Link>
					</div>

					{/* Desktop Navigation */}
					<div className="hidden md:flex md:items-center md:space-x-8">
						{renderNavLinks()}
					</div>

					{/* Right side items */}
					<div className="flex items-center space-x-4">
						<div className="hidden md:block">
							<Button
								onClick={() => navigate("/menu")}
								className="bg-accent-warm-brown text-white hover:bg-accent-warm-brown/90 rounded-full"
							>
								Order Now
							</Button>
						</div>
						{/* Cart Icon */}
						<div className="hidden md:flex">
							<Button
								variant="ghost"
								size="icon"
								onClick={handleCartClick}
								className={`${linkClasses} relative`}
							>
								<ShoppingCart
									aria-hidden="true"
									size={24}
								/>
								{cartItemCount > 0 && (
									<span className="absolute top-0 right-0 -mt-1 -mr-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary-green text-xs font-bold text-white">
										{cartItemCount}
									</span>
								)}
								<span className="sr-only">Open cart</span>
							</Button>
						</div>

						{/* Auth Buttons / Profile Dropdown */}
						<div className="hidden md:block">{renderAuthButtons()}</div>

						{/* Mobile Menu Button */}
						<div className="md:hidden">
							<button
								onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
								className={`${linkClasses} inline-flex items-center justify-center p-2 rounded-md focus:outline-none`}
								aria-controls="mobile-menu"
								aria-expanded={mobileMenuOpen}
							>
								<span className="sr-only">
									{mobileMenuOpen ? "Close main menu" : "Open main menu"}
								</span>
								{mobileMenuOpen ? (
									<X
										className="block h-6 w-6"
										aria-hidden="true"
									/>
								) : (
									<Menu
										className="block h-6 w-6"
										aria-hidden="true"
									/>
								)}
							</button>
						</div>
					</div>
				</div>
			</nav>

			{/* Mobile Menu */}
			<AnimatePresence>
				{mobileMenuOpen && (
					<motion.div
						id="mobile-menu"
						initial={{ opacity: 0, y: -20 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -20 }}
						className="md:hidden bg-accent-light-beige/95 backdrop-blur-sm"
					>
						<div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
							{renderNavLinks()}
							<div className="border-t border-gray-200 pt-4 pb-3">
								<div className="flex items-center px-2">
									<div className="flex-shrink-0">
										<Button
											variant="ghost"
											size="icon"
											onClick={(e) => {
												handleCartClick(e);
												setMobileMenuOpen(false);
											}}
											className="text-accent-dark-brown relative"
										>
											<ShoppingCart
												aria-hidden="true"
												size={24}
											/>
											{cartItemCount > 0 && (
												<span className="absolute top-0 right-0 -mt-1 -mr-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary-green text-xs font-bold text-white">
													{cartItemCount}
												</span>
											)}
											<span className="sr-only">Open cart</span>
										</Button>
									</div>
									<div className="ml-auto flex items-center space-x-2">
										<Button
											onClick={() => {
												navigate("/menu");
												setMobileMenuOpen(false);
											}}
											className="bg-accent-warm-brown text-white hover:bg-accent-warm-brown/90 text-sm"
											size="sm"
										>
											Order Now
										</Button>
										{renderAuthButtons()}
									</div>
								</div>
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</header>
	);
};

export default Navbar;
