import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { db } from "../utils/db";
import { loginSchema } from "../schemas/authSchema";
import { AlertCircle, LogIn, StickyNote } from "lucide-react";
import "../styles/Auth.css";

const LoginPage = () => {
    const [formData, setFormData] = useState({ username: "", password: "" });
    const [errors, setErrors]     = useState({});
    const [serverError, setServerError] = useState("");
    const [loading, setLoading]   = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrors({});
        setServerError("");
        setLoading(true);

        const result = loginSchema.safeParse(formData);
        if (!result.success) {
            const fe = {};
            result.error.issues.forEach(i => { fe[i.path[0]] = i.message; });
            setErrors(fe);
            setLoading(false);
            return;
        }

        try {
            const res  = await db.auth.login(formData.username, formData.password);
            const data = await res.json();
            if (res.ok) {
                localStorage.setItem("token", data.access_token);
                navigate("/");
            } else {
                setServerError(data.detail || "Wrong username or password.");
            }
        } catch {
            setServerError("Can't reach the server. Is it running?");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            {/* Logo */}
            <div className="auth-brand">
                <StickyNote size={20} color="rgba(255,235,161,0.7)" strokeWidth={2} />
                <span className="auth-brand-name">MySticky</span>
            </div>

            {/* Sticky Note Card */}
            <div className="auth-card">
                <h2>Hey, welcome back!</h2>
                <p>Sign in to your notes ✏️</p>

                {serverError && (
                    <div className="auth-error">
                        <AlertCircle size={14} />
                        {serverError}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Username</label>
                        <input
                            type="text"
                            value={formData.username}
                            onChange={e => setFormData({ ...formData, username: e.target.value })}
                            className={errors.username ? "input-error" : ""}
                            placeholder="johndoe"
                            autoComplete="username"
                            required
                        />
                        {errors.username && <span className="error-text">{errors.username}</span>}
                    </div>

                    <div className="form-group">
                        <label>Password</label>
                        <input
                            type="password"
                            value={formData.password}
                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                            className={errors.password ? "input-error" : ""}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            required
                        />
                        {errors.password && <span className="error-text">{errors.password}</span>}
                    </div>

                    <button type="submit" className="auth-btn" disabled={loading}>
                        {loading ? "Signing in..." : <><LogIn size={16} /> Sign In</>}
                    </button>
                </form>

                <p className="auth-footer">
                    No account? <Link to="/signup">Create one →</Link>
                </p>
            </div>
        </div>
    );
};

export default LoginPage;
