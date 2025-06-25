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
	const { login, loading } = useAuth();
	const navigate = useNavigate();

	const handleLogin = async (e) => {
		e.preventDefault();
		setError("");
		try {
			await login(username, pin);
			navigate("/");
			//eslint-disable-next-line
		} catch (err) {
			setError("Failed to log in. Please check your credentials.");
		}
	};

	return (
		<div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
			<div className="w-full max-w-md p-4">
				<div className="text-center mb-6">
					<PanelLeft className="mx-auto h-10 w-10 text-gray-700 dark:text-gray-300" />
					<h1 className="text-3xl font-bold mt-2 text-gray-900 dark:text-gray-50">
						Admin Panel
					</h1>
				</div>
				<Card>
					<CardHeader>
						<CardTitle className="text-2xl">Login</CardTitle>
						<CardDescription>
							Enter your username and PIN to access the admin panel.
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
										onChange={(e) => setUsername(e.target.value)}
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
										onChange={(e) => setPin(e.target.value)}
										required
										placeholder="Your PIN"
									/>
								</div>
								{error && <p className="text-sm text-red-500">{error}</p>}
								<Button
									type="submit"
									className="w-full"
									disabled={loading}
								>
									{loading ? "Logging in..." : "Login"}
								</Button>
							</div>
						</form>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
