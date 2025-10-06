import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { PanelLeft } from "lucide-react";

export function LoginPage() {
	const [username, setUsername] = useState("");
	const [pin, setPin] = useState("");
	const [error, setError] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const { login } = useAuth();
	const navigate = useNavigate();

	const handleLogin = async (e) => {
		e.preventDefault();
		setError("");
		setIsSubmitting(true);

		try {
			await login(username, pin);
			navigate("/");
			//eslint-disable-next-line
		} catch (err) {
			// Display the specific error message from the backend
			const errorMessage = err.message || err.response?.data?.error || "Failed to log in. Please check your credentials.";
			setError(errorMessage);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
			<div className="w-full max-w-md p-4">
				<div className="text-center mb-6">
					<PanelLeft className="mx-auto h-10 w-10 text-gray-700 dark:text-gray-300" />
					<h1 className="text-3xl font-bold mt-2 text-gray-900 dark:text-gray-50">
						Ajeen POS
					</h1>
				</div>
				<Card>
					<CardHeader>
						<CardTitle className="text-2xl">Login</CardTitle>
						<CardDescription>
							Enter your username and PIN to access the Ajeen POS.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleLogin}>
							<div className="grid gap-4">
								<div className="grid gap-2">
									<Label htmlFor="username">Username</Label>
									<Input
										id="username"
										type="text"
										value={username}
										onChange={(e) => {
											setUsername(e.target.value);
											if (error) setError(""); // Clear error on input change
										}}
										required
										placeholder="Your username"
									/>
								</div>
								<div className="grid gap-2">
									<Label htmlFor="pin">PIN</Label>
									<Input
										id="pin"
										type="password"
										value={pin}
										onChange={(e) => {
											setPin(e.target.value);
											if (error) setError(""); // Clear error on input change
										}}
										required
										placeholder="Your PIN"
									/>
								</div>
								{error && (
									<div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
										<p className="text-sm text-red-600 dark:text-red-400 font-medium">
											{error}
										</p>
									</div>
								)}
								<Button
									type="submit"
									className="w-full"
									disabled={isSubmitting}
								>
									{isSubmitting ? "Logging in..." : "Login"}
								</Button>
							</div>
						</form>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
